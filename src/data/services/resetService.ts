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
import { type AppSettings, unlockAndResetCurrency } from './settingsService';

/**
 * Wipe every financial record and re-seed the defaults, WITHOUT touching the
 * settings blob (language, theme, onboarding flag, currency), the security
 * config, or the keystore key.
 *
 * The SQLite deletes run inside a single transaction so the five tables are
 * cleared all-or-nothing; a failure rolls back and leaves the old data intact.
 * The seed re-population mirrors a fresh install exactly.
 *
 * Shared by resetAppData (full reset) and resetFinancialDataForCurrencyReset.
 */
async function wipeFinancialData(): Promise<void> {
    // Financial data lives in SQLite — clear every table atomically.
    const db = getDb();
    await db.runInTransaction(async () => {
        for (const table of FINANCIAL_TABLES) {
            await db.execute(`DELETE FROM ${table}`);
        }
    });

    // Remove residual legacy KV copies (cleartext) + the seed flag so re-seed runs.
    await Promise.all([
        asyncStorageAdapter.remove(StorageKeys.WALLETS),
        asyncStorageAdapter.remove(StorageKeys.TRANSACTIONS),
        asyncStorageAdapter.remove(StorageKeys.CATEGORIES),
        asyncStorageAdapter.remove(StorageKeys.BUDGETS),
        asyncStorageAdapter.remove(StorageKeys.SEED_INITIALIZED),
    ]);

    // Re-initialize seed data (defaults land the user on a working app).
    await initializeSeedData();
}

/**
 * Reset all app data.
 *
 * 1. Removes the settings blob (language, theme, onboarding, currency)
 * 2. Wipes financial data from SQLite + legacy KV copies and re-seeds defaults
 * 3. Emits all data events for a full UI refresh
 *
 * Callers MUST require double confirmation before invoking this function.
 */
export async function resetAppData(): Promise<void> {
    // Settings are wiped only by the FULL reset — remove before the shared wipe.
    await asyncStorageAdapter.remove(StorageKeys.SETTINGS);
    await wipeFinancialData();

    // Trigger full reactive refresh
    dataEvents.emitMultiple(['wallets', 'transactions', 'categories', 'budgets']);
}

/**
 * Reset the base currency, erasing all financial data.
 *
 * Changing the base currency cannot convert stored amounts (integer minor units
 * whose meaning is per-currency, and there is no exchange-rate backend), so the
 * data is wiped and defaults are re-seeded. Language, theme, onboarding flag,
 * security config and the keystore key are preserved.
 *
 * Ordering is deliberate: the financial data is wiped and re-seeded FIRST, then
 * the currency is written LAST. Settings live in KV and the ledger in SQLite, so
 * no cross-store transaction is possible; sequencing this way guarantees the only
 * observable failure states are "old currency + old data" (SQLite rollback) or
 * "old currency + freshly-seeded 0-balance data" — never "new currency + old
 * amounts".
 *
 * Callers MUST require explicit destructive confirmation before invoking this.
 */
export async function resetFinancialDataForCurrencyReset(newCode: string): Promise<AppSettings> {
    await wipeFinancialData();
    const updated = await unlockAndResetCurrency(newCode);
    dataEvents.emitMultiple(['wallets', 'transactions', 'categories', 'budgets', 'settings']);
    return updated;
}
