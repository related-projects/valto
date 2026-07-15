/**
 * Reset Service
 *
 * Full app data reset with safe re-initialization.
 * Clears all storage, re-seeds default data, and triggers UI refresh.
 */

import { dataEvents } from '../../core/events';
import { initializeSeedData } from '../seed';
import { getDb } from '../storage/sql/database';
import { FINANCIAL_TABLES } from '../storage/sql/schema';
import { asyncStorageAdapter, StorageKeys } from '../storage';

/**
 * Reset all app data.
 *
 * 1. Wipes the financial data from SQLite (wallets, transactions, …)
 * 2. Removes any residual legacy key-value copies + settings + seed flag
 * 3. Re-runs seed to populate defaults
 * 4. Emits all data events for a full UI refresh
 *
 * Callers MUST require double confirmation before invoking this function.
 */
export async function resetAppData(): Promise<void> {
    // Financial data now lives in SQLite — clear every table.
    const db = getDb();
    for (const table of FINANCIAL_TABLES) {
        await db.execute(`DELETE FROM ${table}`);
    }

    // Remove residual legacy KV copies (cleartext) + KV-resident settings/seed flag.
    await Promise.all([
        asyncStorageAdapter.remove(StorageKeys.WALLETS),
        asyncStorageAdapter.remove(StorageKeys.TRANSACTIONS),
        asyncStorageAdapter.remove(StorageKeys.CATEGORIES),
        asyncStorageAdapter.remove(StorageKeys.BUDGETS),
        asyncStorageAdapter.remove(StorageKeys.SETTINGS),
        asyncStorageAdapter.remove(StorageKeys.SEED_INITIALIZED),
    ]);

    // Re-initialize seed data
    await initializeSeedData();

    // Trigger full reactive refresh
    dataEvents.emitMultiple(['wallets', 'transactions', 'categories', 'budgets']);
}
