/**
 * Backup & Restore Service
 *
 * Creates full app snapshots and restores from them atomically.
 * Validates schema before applying restores to prevent data corruption.
 */

import * as DocumentPicker from 'expo-document-picker';
import { File as ExpoFile, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import {
    getBudgetRepository,
    getCategoryRepository,
    getTransactionRepository,
    getWalletRepository,
} from '../../core/di';
import { dataEvents } from '../../core/events';
import {
    SerializableBudget,
    SerializableCategory,
    SerializableTransaction,
    SerializableWallet,
    deserializeBudget,
    deserializeCategory,
    deserializeTransaction,
    deserializeWallet,
    serializeBudget,
    serializeCategory,
    serializeTransaction,
    serializeWallet,
} from '../../domain/entities';
import { getCurrencyByCode } from '../../domain/constants/currencies';
import { ledgerEffect } from '../../domain/ledger/ledgerEffect';
import { ValidationError, validateTransaction, validateWallet } from '../../domain/validators';
import { getDb } from '../storage/sql/database';
import {
    budgetMapper,
    categoryMapper,
    sqlInsert,
    transactionMapper,
} from '../storage/sql/mappers';
import { scheduleDailyReminder } from './notificationService';
import { AppSettings, loadSettings, saveSettings } from './settingsService';
import { ensureUsableState } from './usableStateService';

// ─── Snapshot Types ───────────────────────────────────────────────────

export interface BackupSnapshot {
    /** Schema version for forward compatibility */
    version: number;
    /** ISO timestamp of when backup was created */
    createdAt: string;
    /** App version string */
    appVersion: string;
    /** All data */
    data: {
        wallets: SerializableWallet[];
        transactions: SerializableTransaction[];
        categories: SerializableCategory[];
        budgets: SerializableBudget[];
        settings?: AppSettings;
    };
}

/** Current schema version */
export const CURRENT_SCHEMA_VERSION = 1;

// ─── Validation ───────────────────────────────────────────────────────

/**
 * A refusal that has dedicated, user-facing copy behind it.
 *
 * Most validation failures are developer-facing strings joined into one error;
 * these are the ones the UI must explain in the user's own language instead.
 *
 * The two currency reasons are distinct so a diagnostic can tell "no currency
 * recorded" from "a currency this build has never heard of", but they share one
 * message: the user's situation is identical either way - the amounts in the
 * file have no exponent this app can trust, and the backup cannot be restored
 * safely.
 */
export type SnapshotRejectionReason = 'missingCurrency' | 'unknownCurrency';

/** Thrown when a snapshot is refused. `reason` selects the localized message. */
export class SnapshotRejectedError extends Error {
    constructor(message: string, public readonly reason?: SnapshotRejectionReason) {
        super(message);
        this.name = 'SnapshotRejectedError';
    }
}

export interface ValidationResult {
    valid: boolean;
    errors: string[];
    /** Set when the refusal has dedicated user-facing copy. */
    reason?: SnapshotRejectionReason;
}

/** English fallback for the refusal above; the UI shows a localized version. */
const MISSING_CURRENCY_ERROR =
    'This backup does not record which currency its amounts are in, so restoring it could misread every amount.';

/** Same for a code the currency registry does not carry. Diagnostics only. */
const unknownCurrencyError = (code: string) =>
    `This backup records its amounts in "${code}", which this version of the app does not know, so restoring it could misread every amount.`;

/**
 * Validate a snapshot's schema and referential integrity.
 */
export function validateSnapshot(data: unknown): ValidationResult {
    const errors: string[] = [];

    if (!data || typeof data !== 'object') {
        return { valid: false, errors: ['Snapshot is not a valid object'] };
    }

    const snapshot = data as Record<string, unknown>;

    // Version check
    if (typeof snapshot.version !== 'number' || snapshot.version < 1) {
        errors.push('Missing or invalid version');
    }

    // Future version check
    if (typeof snapshot.version === 'number' && snapshot.version > CURRENT_SCHEMA_VERSION) {
        errors.push(`Backup version ${snapshot.version} is newer than app version ${CURRENT_SCHEMA_VERSION}. Please update the app.`);
    }

    if (typeof snapshot.createdAt !== 'string') {
        errors.push('Missing createdAt timestamp');
    }

    if (!snapshot.data || typeof snapshot.data !== 'object') {
        errors.push('Missing data object');
        return { valid: false, errors };
    }

    const snapshotData = snapshot.data as Record<string, unknown>;

    // Array checks
    const requiredArrays = ['wallets', 'transactions', 'categories', 'budgets'] as const;
    for (const key of requiredArrays) {
        if (!Array.isArray(snapshotData[key])) {
            errors.push(`data.${key} must be an array`);
        }
    }

    if (errors.length > 0) {
        return { valid: false, errors };
    }

    // The unit the amounts are denominated in.
    //
    // Every amount in the file is an integer in MINOR units, and how many minor
    // units make a major one comes from the currency alone (XOF 0, most 2, KWD
    // and BHD and TND 3). A snapshot that carries data but no settings block
    // carries no currency, so its integers would be read under whatever currency
    // this device happens to be set to - restoring a 2-decimal ledger onto a
    // 0-decimal install misreads every amount by a factor of 100.
    //
    // Refused rather than repaired: there is nothing in the file to repair it
    // from, and no default is safe. The base currency legitimately changes on a
    // restore, because a restore replaces the whole ledger - what may never
    // happen is amounts arriving without the unit they are counted in.
    const settings = snapshotData.settings as { currency?: unknown } | undefined;
    const carriesData = requiredArrays.some(
        (key) => (snapshotData[key] as unknown[]).length > 0,
    );

    const settingsMissing = !settings || typeof settings !== 'object';
    const currencyMissing =
        !settingsMissing &&
        (typeof settings.currency !== 'string' || settings.currency.trim() === '');

    if ((carriesData && settingsMissing) || currencyMissing) {
        return { valid: false, errors: [MISSING_CURRENCY_ERROR], reason: 'missingCurrency' };
    }

    // A currency the registry does not carry has no `decimals`, and every reader
    // of an unknown code silently falls back: getCurrencyByCode returns the USD
    // definition rather than nothing, so a 0-decimal ledger tagged with a code
    // this build has never heard of would be displayed at two decimals with no
    // error anywhere. Asking the SAME function the formatter asks - and refusing
    // when it did not resolve the code to itself - is what keeps this check and
    // the display in agreement; a second private list of codes would not.
    if (!settingsMissing && typeof settings.currency === 'string') {
        const code = settings.currency;
        if (getCurrencyByCode(code).code !== code) {
            return {
                valid: false,
                errors: [unknownCurrencyError(code)],
                reason: 'unknownCurrency',
            };
        }
    }

    // Referential integrity checks
    const walletIds = new Set(
        (snapshotData.wallets as SerializableWallet[]).map(w => w.id),
    );
    const categoryIds = new Set(
        (snapshotData.categories as SerializableCategory[]).map(c => c.id),
    );

    for (const tx of snapshotData.transactions as SerializableTransaction[]) {
        if (!tx.id || typeof tx.amount !== 'number') {
            errors.push(`Transaction missing required fields: ${JSON.stringify(tx)}`);
            continue;
        }
        if (!walletIds.has(tx.walletId)) {
            errors.push(`Transaction ${tx.id} references non-existent wallet ${tx.walletId}`);
        }
        if (!categoryIds.has(tx.categoryId)) {
            errors.push(`Transaction ${tx.id} references non-existent category ${tx.categoryId}`);
        }
    }

    for (const b of snapshotData.budgets as SerializableBudget[]) {
        if (!categoryIds.has(b.categoryId)) {
            errors.push(`Budget ${b.id} references non-existent category ${b.categoryId}`);
        }
    }

    return { valid: errors.length === 0, errors };
}

// ─── Backup ───────────────────────────────────────────────────────────

/**
 * Create a full backup snapshot of all app data.
 * Module-private - consumed only by createAndShareBackup below.
 */
async function createBackupSnapshot(): Promise<BackupSnapshot> {
    const [wallets, transactions, categories, budgets, settings] = await Promise.all([
        getWalletRepository().getAll(),
        getTransactionRepository().getAll(),
        getCategoryRepository().getAll(),
        getBudgetRepository().getAll(),
        loadSettings(),
    ]);

    return {
        version: CURRENT_SCHEMA_VERSION,
        createdAt: new Date().toISOString(),
        appVersion: '1.0.0',
        data: {
            wallets: wallets.map(serializeWallet),
            transactions: transactions.map(serializeTransaction),
            categories: categories.map(serializeCategory),
            budgets: budgets.map(serializeBudget),
            settings,
        },
    };
}

/**
 * Create a backup and share the JSON file.
 */
export async function createAndShareBackup(): Promise<void> {
    const snapshot = await createBackupSnapshot();
    const json = JSON.stringify(snapshot, null, 2);

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `valto-backup-${timestamp}.json`;
    const file = new ExpoFile(Paths.cache, filename);

    file.write(json);

    if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(file.uri, {
            mimeType: 'application/json',
            dialogTitle: 'Save Backup',
            UTI: 'public.json',
        });
    }
}

// ─── Restore ──────────────────────────────────────────────────────────

/**
 * The tables a snapshot carries, in the order the restore clears them.
 *
 * Deliberately NOT the full FINANCIAL_TABLES list: `recurring_rules` is not part
 * of the backup file, so clearing it would delete data the snapshot cannot put
 * back. A restored rule may end up referencing a wallet or category the snapshot
 * did not contain; processRecurringRules catches that per rule and records it in
 * `errors` rather than failing boot, so a dangling reference degrades to a
 * logged error instead of data loss.
 */
const SNAPSHOT_TABLES = ['transactions', 'budgets', 'wallets', 'categories'] as const;

/**
 * Restore app data from a validated snapshot.
 *
 * Financial data is written to the encrypted SQLite store, which is the only
 * store the repositories read. An earlier revision wrote it to the legacy
 * AsyncStorage keys instead: nothing read those back, so the restore silently
 * did nothing to the ledger while leaving a cleartext copy of it on disk.
 *
 * Atomic: the clear and every insert run inside ONE runInTransaction on the
 * shared connection, so a failure at any point rolls the whole restore back and
 * leaves the pre-restore ledger intact. That is also why no manual "safety
 * backup + re-write" rollback is needed any more - SQLite provides it.
 *
 * Wallets are inserted directly rather than through WalletRepository.save,
 * because the ledger anchor has to be derived rather than defaulted:
 *     opening_balance = balance - Sum(ledgerEffect(restored txns of the wallet))
 * This is the same derivation migration v5 uses for imported wallets, and it is
 * what keeps a restored install from reading as drifted under
 * verifyFinancialIntegrity. WalletRepository.save would instead set
 * opening_balance = balance and double-count every restored transaction.
 *
 * Bypassing the repositories also bypasses the ONLY place the entity invariants
 * were enforced (TransactionRepository calls validateTransaction on save and
 * update), so each entity is validated here against the same domain validator
 * the repository uses - not a second copy of the rules. The checks run INSIDE
 * the transaction, immediately before their insert, so a snapshot whose 900th
 * transaction is invalid rolls the other 899 back with it. A partial restore is
 * never a valid outcome.
 *
 * @throws SnapshotRejectedError if snapshot validation fails
 * @throws Error if any entity fails its domain invariants, or any write fails
 */
export async function restoreFromSnapshot(snapshot: BackupSnapshot): Promise<void> {
    // Validate before touching any data
    const validation = validateSnapshot(snapshot);
    if (!validation.valid) {
        throw new SnapshotRejectedError(
            `Invalid backup snapshot:\n${validation.errors.join('\n')}`,
            validation.reason,
        );
    }

    const wallets = snapshot.data.wallets.map(deserializeWallet);
    const transactions = snapshot.data.transactions.map(deserializeTransaction);
    const categories = snapshot.data.categories.map(deserializeCategory);
    const budgets = snapshot.data.budgets.map(deserializeBudget);

    const db = getDb();

    try {
        await db.runInTransaction(async () => {
            for (const table of SNAPSHOT_TABLES) {
                await db.execute(`DELETE FROM ${table}`);
            }

            // Categories first: transactions and budgets reference them.
            for (const c of categories) {
                await sqlInsert(db, categoryMapper, c);
            }

            for (const w of wallets) {
                validateWallet(w);

                const ledgerSum = transactions
                    .filter((t) => t.walletId === w.id)
                    .reduce((sum, t) => sum + ledgerEffect(t), 0);
                const openingBalance = w.balance - ledgerSum;

                await db.execute(
                    `INSERT INTO wallets
                        (id, name, balance, opening_balance, type, color, created_at)
                     VALUES (?, ?, ?, ?, ?, ?, ?)`,
                    [
                        w.id,
                        w.name,
                        w.balance,
                        openingBalance,
                        w.type,
                        w.color ?? null,
                        w.createdAt.toISOString(),
                    ],
                );
            }

            // validateTransaction is the same function TransactionRepository
            // calls; it rejects an unknown type, and an amount that is not a
            // finite, non-negative integer. Without it a negative expense enters
            // the ledger as a credit and stays invisible to every later check,
            // because the opening_balance derived above consumed the same bad
            // value through the same ledgerEffect.
            for (const t of transactions) {
                validateTransaction(t);
                await sqlInsert(db, transactionMapper, t);
            }

            // Categories and budgets have no domain validator to call. Their
            // referential integrity is checked in validateSnapshot; their own
            // field invariants are not enforced on this path.
            for (const b of budgets) {
                await sqlInsert(db, budgetMapper, b);
            }
        });
    } catch (writeError) {
        console.error('[Backup] Restore failed, transaction rolled back:', writeError);

        // A refused entity is not a write failure, and must not be reported as
        // one: the rollback is identical, but the user needs to know the file is
        // bad rather than that their disk is.
        if (writeError instanceof ValidationError) {
            throw new Error(
                `Restore refused: the backup contains an invalid ${writeError.entity.toLowerCase()} ` +
                `(${writeError.field}). Your previous data has been preserved.`,
            );
        }

        throw new Error('Restore failed while writing data. Your previous data has been preserved.');
    }

    // A snapshot is allowed to be empty: an all-empty file is structurally
    // valid, every referential check in validateSnapshot is satisfied vacuously
    // by zero rows, and refusing it would refuse a legitimate backup of an app
    // whose ledger the user had cleared. What must not happen is the restore
    // LANDING on an install with no wallet or no category, which the clear above
    // guarantees whenever the snapshot carried none.
    //
    // So the terminal state is asserted here rather than in validateSnapshot -
    // outside the transaction, because the restored ledger has already committed
    // correctly and a failure to materialize a default wallet is not a reason to
    // roll it back. Idempotent: a snapshot that carried wallets and categories
    // leaves this a no-op.
    await ensureUsableState();

    // Settings live in key-value storage, outside the SQLite transaction above.
    // Written only after the ledger has committed, so a failed restore can never
    // leave the new snapshot's settings sitting on top of the old data.
    if (snapshot.data.settings) {
        await saveSettings(snapshot.data.settings);
    }

    // Reconcile the daily reminder with the restored preference. A backup can carry
    // notificationsEnabled: true from a device where the permission was granted;
    // this device may not have it, and saveSettings above wrote the value verbatim
    // without asking anyone. scheduleDailyReminder is the single choke point: it
    // reads the permission (never requests), schedules when granted, and persists
    // false when it is not - so a restore can never leave the user a session with
    // the toggle reading "on" and nothing scheduled behind it.
    //
    // Deliberately outside the write try/catch above, with its own catch: a reminder
    // that fails to schedule is not a restore failure and must not roll back
    // successfully restored data.
    try {
        await scheduleDailyReminder();
    } catch (reminderError) {
        console.warn('[notifications] Reminder reconcile after restore failed:', reminderError);
    }

    // Trigger full reactive refresh across the app
    dataEvents.emitMultiple(['wallets', 'transactions', 'categories', 'budgets']);
}

/**
 * Strip UTF-8 BOM (Byte Order Mark) if present at the start of content.
 */
function stripBOM(content: string): string {
    return content.charCodeAt(0) === 0xFEFF ? content.slice(1) : content;
}

/**
 * Pick a backup JSON file from device storage, validate, and restore.
 * Uses expo-document-picker for file selection.
 *
 * @returns true if restore was successful, false if user cancelled
 * @throws Error on validation failure or corrupted file
 */
export async function pickAndRestoreBackup(): Promise<boolean> {
    const result = await DocumentPicker.getDocumentAsync({
        type: 'application/json',
        copyToCacheDirectory: true,
    });

    if (result.canceled) {
        return false;
    }

    const asset = result.assets[0];
    const fileUri = asset.uri;
    console.log('[Backup] Selected file:', { uri: fileUri, name: asset.name, size: asset.size, mimeType: asset.mimeType });

    // --- Pre-parse validation ---
    const file = new ExpoFile(fileUri);

    if (!file.exists) {
        throw new Error('The selected file could not be accessed. Please try again.');
    }

    if (file.size === 0) {
        throw new Error('The selected file is empty. Please choose a valid Valto backup file.');
    }

    // --- Read file content (text() returns Promise<string> in expo-file-system v19) ---
    let content: string;
    try {
        content = await file.text();
    } catch (readError) {
        console.error('[Backup] Failed to read file:', readError);
        throw new Error('Could not read the selected file. It may be corrupted or inaccessible.');
    }

    console.log('[Backup] File read:', { contentLength: content.length, first200: content.substring(0, 200) });

    if (!content || content.trim().length === 0) {
        throw new Error('The selected file is empty. Please choose a valid Valto backup file.');
    }

    // --- Strip BOM and parse ---
    const cleanContent = stripBOM(content.trim());

    let parsed: unknown;
    try {
        parsed = JSON.parse(cleanContent);
    } catch (parseError) {
        console.error('[Backup] JSON parse failed:', parseError, { contentLength: cleanContent.length, first200: cleanContent.substring(0, 200) });
        throw new Error('The selected file contains invalid JSON. Please choose a valid Valto backup file.');
    }

    // --- Structural validation before restore ---
    if (typeof parsed !== 'object' || parsed === null) {
        throw new Error('The selected file does not contain a valid backup structure.');
    }

    await restoreFromSnapshot(parsed as BackupSnapshot);
    return true;
}
