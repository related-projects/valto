/**
 * Reset Service
 *
 * Full app data reset with safe re-initialization.
 * Clears all storage, re-seeds default data, and triggers UI refresh.
 */

import { dataEvents } from '../../core/events';
import { initializeSeedData } from '../seed';
import { asyncStorageAdapter, StorageKeys } from '../storage';

/**
 * Reset all app data.
 *
 * 1. Clears all known storage keys (wallets, transactions, categories, budgets, settings)
 * 2. Resets the seed initialization flag
 * 3. Re-runs seed to populate defaults
 * 4. Emits all data events for a full UI refresh
 *
 * Callers MUST require double confirmation before invoking this function.
 */
export async function resetAppData(): Promise<void> {
    // Clear all data keys individually (safer than full AsyncStorage.clear())
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
