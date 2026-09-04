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
    container,
    getBudgetRepository,
    getCategoryRepository,
    getRecurringTransactionRepository,
    getTransactionRepository,
    getWalletRepository,
} from '../../core/di';
import { dataEvents } from '../../core/events';
import {
    SerializableBudget,
    SerializableCategory,
    SerializableRecurringTransaction,
    SerializableTransaction,
    SerializableWallet,
    deserializeBudget,
    deserializeCategory,
    deserializeRecurringTransaction,
    deserializeTransaction,
    deserializeWallet,
    serializeBudget,
    serializeCategory,
    serializeRecurringTransaction,
    serializeTransaction,
    serializeWallet,
} from '../../domain/entities';
import { getCurrencyByCode } from '../../domain/constants/currencies';
import { ledgerEffect } from '../../domain/ledger/ledgerEffect';
import {
    ValidationError,
    validateRecurringTransaction,
    validateTransaction,
    validateWallet,
} from '../../domain/validators';
import { getDb } from '../storage/sql/database';
import {
    budgetMapper,
    categoryMapper,
    recurringMapper,
    sqlInsert,
    transactionMapper,
} from '../storage/sql/mappers';
import { processRecurringRules } from './RecurringTransactionEngine';
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
        /** Standing orders. Present from schema version 2; absent in v1 files. */
        recurringRules: SerializableRecurringTransaction[];
        settings?: AppSettings;
    };
}

/** Current schema version */
export const CURRENT_SCHEMA_VERSION = 2;

/**
 * The version at which recurring rules joined the file.
 *
 * A v1 file has no `recurringRules` key at all and is still accepted by the
 * range check in validateSnapshot, so every read of the file has to ask what
 * the file carries rather than what this build knows how to write.
 */
const RULES_SCHEMA_VERSION = 2;

/**
 * The tables a snapshot of `version` covers, in the order the restore clears
 * them: rows are dropped before the rows they reference.
 *
 * Derived from the file's own version, deliberately NOT from FINANCIAL_TABLES.
 * A restore replaces what the file carries and leaves alone what it does not,
 * and those are the same list: clearing a table the file cannot repopulate is
 * not a restore, it is a deletion. Merging this into FINANCIAL_TABLES would
 * clear `recurring_rules` for a v1 file too, which carries none - every
 * standing order on the device would go, silently, the first time a user
 * restored an older backup.
 *
 * The insert sequence in restoreFromSnapshot derives from this same call, so
 * the two can never disagree about which tables a file owns.
 *
 * Verified, not merely asserted here:
 *  - backupRestoreRecurringRules.test.ts, "a v1 file does not delete the live
 *    recurring rules", restores a version:1 file over live rules and reads them
 *    back;
 *  - backupRestoreSqlite.test.ts, "replaces every table the v2 file carries"
 *    and "leaves recurring rules alone when the file is a v1 snapshot".
 */
export function snapshotTables(version: number): readonly string[] {
    return version >= RULES_SCHEMA_VERSION
        ? (['transactions', 'budgets', 'recurring_rules', 'wallets', 'categories'] as const)
        : (['transactions', 'budgets', 'wallets', 'categories'] as const);
}

/**
 * What a restore left behind, for the caller to report to the user.
 *
 * The restore itself either succeeded or threw; nothing here is a failure of
 * the restore. These are counts of work the catch-up did or could not do.
 */
export interface RestoreOutcome {
    /** Transactions the recurring engine generated to catch up after the restore. */
    catchUpGenerated: number;
    /**
     * Rules that did not execute: the engine's per-rule failures plus every rule
     * left pointing at a wallet or category the restore did not put back. Each
     * rule counted once, however many ways it failed.
     */
    rulesNotProcessed: number;
    /** True when the catch-up run itself failed. The restore still succeeded. */
    catchUpFailed: boolean;
}

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

    // Recurring rules joined the file at v2. A v1 file has no such key and stays
    // valid - it is accepted by the range check above and its restore leaves the
    // rules table alone. From v2 on the array is REQUIRED rather than optional:
    // a truncated v2 file would otherwise read as "this user had no standing
    // orders" and the restore would clear the table on the strength of it.
    const carriesRules =
        typeof snapshot.version === 'number' && snapshot.version >= RULES_SCHEMA_VERSION;

    if (carriesRules && !Array.isArray(snapshotData.recurringRules)) {
        errors.push('data.recurringRules must be an array');
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

    // A rule is checked harder than a transaction is, for the same reason
    // deleteWallet and deleteCategory refuse to orphan one: a transaction is a
    // past fact that stays true without its wallet, a rule is a future
    // instruction that cannot execute without one. Refusing the file here is
    // what lets the restore clear and repopulate the table at all - a rule that
    // arrives pointing nowhere would be written, look armed on the rules screen,
    // and fail on every run.
    if (carriesRules) {
        for (const r of snapshotData.recurringRules as SerializableRecurringTransaction[]) {
            if (!walletIds.has(r.walletId)) {
                errors.push(`Recurring rule ${r.id} references non-existent wallet ${r.walletId}`);
            }
            if (!categoryIds.has(r.categoryId)) {
                errors.push(`Recurring rule ${r.id} references non-existent category ${r.categoryId}`);
            }
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
    const [wallets, transactions, categories, budgets, recurringRules, settings] = await Promise.all([
        getWalletRepository().getAll(),
        getTransactionRepository().getAll(),
        getCategoryRepository().getAll(),
        getBudgetRepository().getAll(),
        getRecurringTransactionRepository().getAll(),
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
            // Every rule, paused and expired ones included: `is_paused` records
            // when a rule runs, not whether it exists, and a backup that dropped
            // paused rules would lose them on the next restore.
            recurringRules: recurringRules.map(serializeRecurringTransaction),
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
 * Readable names for the entity a ValidationError names.
 *
 * `entity` is the domain class name, and the refusal below used to lowercase it
 * verbatim - which was fine for Wallet and Transaction and produced "an invalid
 * recurringtransaction" for a rule.
 */
const ENTITY_LABELS: Record<string, string> = {
    Wallet: 'wallet',
    Transaction: 'transaction',
    RecurringTransaction: 'recurring rule',
    Settings: 'setting',
};

const entityLabel = (entity: string): string => ENTITY_LABELS[entity] ?? entity.toLowerCase();

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
 * Which tables that covers comes from snapshotTables(snapshot.version), so a v1
 * file - which carries no recurring rules - clears and rewrites four tables and
 * leaves the fifth exactly as it found it.
 *
 * @returns counts from the post-restore catch-up, for the caller to report
 * @throws SnapshotRejectedError if snapshot validation fails
 * @throws Error if any entity fails its domain invariants, or any write fails
 */
export async function restoreFromSnapshot(snapshot: BackupSnapshot): Promise<RestoreOutcome> {
    // Validate before touching any data
    const validation = validateSnapshot(snapshot);
    if (!validation.valid) {
        throw new SnapshotRejectedError(
            `Invalid backup snapshot:\n${validation.errors.join('\n')}`,
            validation.reason,
        );
    }

    const tables = snapshotTables(snapshot.version);
    const carriesRules = tables.includes('recurring_rules');

    const wallets = snapshot.data.wallets.map(deserializeWallet);
    const transactions = snapshot.data.transactions.map(deserializeTransaction);
    const categories = snapshot.data.categories.map(deserializeCategory);
    const budgets = snapshot.data.budgets.map(deserializeBudget);
    const recurringRules = carriesRules
        ? snapshot.data.recurringRules.map(deserializeRecurringTransaction)
        : [];

    const db = getDb();

    try {
        await db.runInTransaction(async () => {
            for (const table of tables) {
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

            // Rules last: they reference both wallets and categories, and
            // `recurringRules` is empty unless snapshotTables said this file
            // owns the table, so a v1 restore never reaches this loop.
            // validateRecurringTransaction is the same function
            // RecurringTransactionRepository calls on save and update.
            for (const r of recurringRules) {
                validateRecurringTransaction(r);
                await sqlInsert(db, recurringMapper, r);
            }
        });
    } catch (writeError) {
        console.error('[Backup] Restore failed, transaction rolled back:', writeError);

        // A refused entity is not a write failure, and must not be reported as
        // one: the rollback is identical, but the user needs to know the file is
        // bad rather than that their disk is.
        if (writeError instanceof ValidationError) {
            throw new Error(
                `Restore refused: the backup contains an invalid ${entityLabel(writeError.entity)} ` +
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

    const outcome = await runPostRestoreCatchUp();

    // Trigger full reactive refresh across the app. 'recurringRules' belongs
    // here for the same reason it belongs on the reset paths: a v2 restore
    // replaces the whole table, and the catch-up above moved every watermark it
    // touched, so a rules screen left mounted across the restore would keep
    // rendering rows that no longer exist.
    dataEvents.emitMultiple([
        'wallets', 'transactions', 'categories', 'budgets', 'recurringRules',
    ]);

    return outcome;
}

/**
 * Bring the restored standing orders up to date, and count what could not run.
 *
 * A restored file is as old as the backup, so every occurrence between a rule's
 * watermark and today is still due. Running the engine here rather than waiting
 * for the next cold boot is what makes the restored ledger the one the user
 * expects to see. The watermark travels in the file, so nothing generated here
 * duplicates a row the same file already carried.
 *
 * Once, no retry: a rule that fails now fails again on the next boot, where
 * app/_layout already reports it, and retrying inside a restore would only make
 * the same failure take longer to surface.
 *
 * Deliberately after the commit and outside every rollback. The ledger is
 * already correct; a standing order that cannot execute is something to tell the
 * user about, never a reason to undo a good restore. A v2 file cannot leave a
 * broken reference behind because validateSnapshot refuses one, but a v1 file
 * carries no rules at all, so the live ones can outlive the wallet or category
 * the restore just replaced - findWithMissingReferences is what finds those.
 */
async function runPostRestoreCatchUp(): Promise<RestoreOutcome> {
    try {
        const engineResult = await processRecurringRules({
            recurringRepo: container.recurringTransactionRepository,
            transactionRepo: container.transactionRepository,
            walletRepo: container.walletRepository,
            categoryRepo: container.categoryRepository,
            eventBus: dataEvents,
            runInTransaction: (work) => getDb().runInTransaction(work),
        });

        // One rule can both fail in the engine and point at a missing wallet.
        // The user is being told how many standing orders did not run, not how
        // many ways each one failed, so the ids are unioned before counting.
        const notProcessed = new Set(engineResult.errors.map((e) => e.ruleId));
        const unresolved = await container.recurringTransactionRepository.findWithMissingReferences();
        for (const rule of unresolved) {
            notProcessed.add(rule.id);
        }

        return {
            catchUpGenerated: engineResult.transactionsGenerated,
            rulesNotProcessed: notProcessed.size,
            catchUpFailed: false,
        };
    } catch (catchUpError) {
        console.warn('[Backup] Post-restore recurring catch-up failed:', catchUpError);
        return { catchUpGenerated: 0, rulesNotProcessed: 0, catchUpFailed: true };
    }
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
 * @returns the restore outcome, or null if the user cancelled the picker
 * @throws Error on validation failure or corrupted file
 */
export async function pickAndRestoreBackup(): Promise<RestoreOutcome | null> {
    const result = await DocumentPicker.getDocumentAsync({
        type: 'application/json',
        copyToCacheDirectory: true,
    });

    if (result.canceled) {
        return null;
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

    return restoreFromSnapshot(parsed as BackupSnapshot);
}
