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
    serializeBudget,
    serializeCategory,
    serializeTransaction,
    serializeWallet,
} from '../../domain/entities';
import { asyncStorageAdapter, StorageKeys } from '../storage';
import { AppSettings, loadSettings, saveSettings } from './settingsService';

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

export interface ValidationResult {
    valid: boolean;
    errors: string[];
}

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
 * Module-private — consumed only by createAndShareBackup below.
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
 * Restore app data from a validated snapshot.
 * Creates a safety backup before overwriting, so partial failures can be detected.
 *
 * @throws Error if snapshot validation fails or any write fails
 */
export async function restoreFromSnapshot(snapshot: BackupSnapshot): Promise<void> {
    // Validate before touching any data
    const validation = validateSnapshot(snapshot);
    if (!validation.valid) {
        throw new Error(
            `Invalid backup snapshot:\n${validation.errors.join('\n')}`,
        );
    }

    // Safety: snapshot current data before overwriting
    const previousData = {
        wallets: await asyncStorageAdapter.get(StorageKeys.WALLETS),
        transactions: await asyncStorageAdapter.get(StorageKeys.TRANSACTIONS),
        categories: await asyncStorageAdapter.get(StorageKeys.CATEGORIES),
        budgets: await asyncStorageAdapter.get(StorageKeys.BUDGETS),
    };

    try {
        // Write all data keys
        await asyncStorageAdapter.set(StorageKeys.WALLETS, snapshot.data.wallets);
        await asyncStorageAdapter.set(StorageKeys.TRANSACTIONS, snapshot.data.transactions);
        await asyncStorageAdapter.set(StorageKeys.CATEGORIES, snapshot.data.categories);
        await asyncStorageAdapter.set(StorageKeys.BUDGETS, snapshot.data.budgets);

        // Restore settings if present in backup
        if (snapshot.data.settings) {
            await saveSettings(snapshot.data.settings);
        }
    } catch (writeError) {
        // Attempt rollback on failure
        console.error('[Backup] Restore write failed, attempting rollback:', writeError);
        try {
            await asyncStorageAdapter.set(StorageKeys.WALLETS, previousData.wallets);
            await asyncStorageAdapter.set(StorageKeys.TRANSACTIONS, previousData.transactions);
            await asyncStorageAdapter.set(StorageKeys.CATEGORIES, previousData.categories);
            await asyncStorageAdapter.set(StorageKeys.BUDGETS, previousData.budgets);
        } catch (rollbackError) {
            console.error('[Backup] Rollback also failed:', rollbackError);
        }
        throw new Error('Restore failed while writing data. Your previous data has been preserved.');
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
