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
 */
export async function createBackupSnapshot(): Promise<BackupSnapshot> {
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
 * Atomically replaces all local data and triggers a full reactive refresh.
 *
 * @throws Error if snapshot validation fails
 */
export async function restoreFromSnapshot(snapshot: BackupSnapshot): Promise<void> {
    // Validate before touching any data
    const validation = validateSnapshot(snapshot);
    if (!validation.valid) {
        throw new Error(
            `Invalid backup snapshot:\n${validation.errors.join('\n')}`,
        );
    }

    // Write all data keys
    await asyncStorageAdapter.set(StorageKeys.WALLETS, snapshot.data.wallets);
    await asyncStorageAdapter.set(StorageKeys.TRANSACTIONS, snapshot.data.transactions);
    await asyncStorageAdapter.set(StorageKeys.CATEGORIES, snapshot.data.categories);
    await asyncStorageAdapter.set(StorageKeys.BUDGETS, snapshot.data.budgets);

    // Restore settings if present in backup
    if (snapshot.data.settings) {
        await saveSettings(snapshot.data.settings);
    }

    // Trigger full reactive refresh across the app
    dataEvents.emitMultiple(['wallets', 'transactions', 'categories', 'budgets']);
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

    const fileUri = result.assets[0].uri;
    const file = new ExpoFile(fileUri);
    const content = file.text();

    let parsed: unknown;
    try {
        parsed = JSON.parse(content);
    } catch {
        throw new Error('The selected file is not valid JSON. Please choose a valid Valto backup file.');
    }

    await restoreFromSnapshot(parsed as BackupSnapshot);
    return true;
}
