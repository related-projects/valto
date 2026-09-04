/**
 * Reset Service
 *
 * Deletion of the financial data, with safe re-initialization.
 * Clears the ledger, re-seeds the defaults, and triggers a UI refresh.
 */

import { dataEvents } from '../../core/events';
import { getDb } from '../storage/sql/database';
import { FINANCIAL_TABLES } from '../storage/sql/schema';
import { asyncStorageAdapter, StorageKeys } from '../storage';
import { type AppSettings, unlockAndResetCurrency } from './settingsService';
import { ensureUsableState } from './usableStateService';

/**
 * Wipe every financial record and re-seed the defaults, WITHOUT touching the
 * settings blob (language, theme, onboarding flag, currency), the security
 * config, or the keystore key.
 *
 * The SQLite deletes run inside a single transaction so the five tables are
 * cleared all-or-nothing; a failure rolls back and leaves the old data intact.
 * The seed re-population mirrors a fresh install exactly.
 *
 * Shared by resetAppData and resetFinancialDataForCurrencyReset. Neither caller
 * removes the settings blob any more, so the guarantee in the first paragraph
 * now holds for the whole operation and not just for this helper.
 *
 * Leaves the tables empty. Re-populating them is ensureUsableState's job, and
 * both callers invoke it - this helper deliberately materializes nothing, so
 * there is only one definition of what a reset leaves behind.
 */
async function wipeFinancialData(): Promise<void> {
    // Financial data lives in SQLite - clear every table atomically.
    const db = getDb();
    await db.runInTransaction(async () => {
        for (const table of FINANCIAL_TABLES) {
            await db.execute(`DELETE FROM ${table}`);
        }
    });

    // Remove residual legacy KV copies (cleartext) + the seed flag so re-seed runs.
    // RECURRING_RULES belongs here with its four siblings: the recurring_rules
    // TABLE is cleared above, so leaving its legacy KV copy behind kept deleted
    // rules readable in cleartext after a wipe that claimed to remove them.
    await Promise.all([
        asyncStorageAdapter.remove(StorageKeys.WALLETS),
        asyncStorageAdapter.remove(StorageKeys.TRANSACTIONS),
        asyncStorageAdapter.remove(StorageKeys.CATEGORIES),
        asyncStorageAdapter.remove(StorageKeys.BUDGETS),
        asyncStorageAdapter.remove(StorageKeys.RECURRING_RULES),
        asyncStorageAdapter.remove(StorageKeys.SEED_INITIALIZED),
    ]);
}

/**
 * Delete every financial record and start the ledger over.
 *
 * 1. Wipes financial data from SQLite + legacy KV copies
 * 2. Materializes the terminal state: the seeded categories, and the one empty
 *    wallet the user needs to record anything again
 * 3. Emits all data events for a full UI refresh
 *
 * This deletes DATA, not the app. The settings blob is deliberately untouched -
 * currency, currencyLocked, language, theme, dateFormat, firstDayOfWeek,
 * decimalSeparator, onboardingCompleted and notificationsEnabled all survive, as
 * does the security config that keeps the app lock on. Removing the blob was the
 * old behaviour and it was wrong in three separate ways: the base currency
 * silently became USD, an explicit number-format choice was re-derived from the
 * device locale, and notificationsEnabled dropped to false while the OS kept
 * firing the reminder it had already been granted. Keeping the preference is
 * also what keeps that reminder correct here, which is why this path schedules
 * and cancels nothing: the preference and the OS grant both still hold.
 *
 * onboardingCompleted staying true is intentional - the user has onboarded, and
 * this is not a factory reset. Nothing here re-runs onboarding, which is why the
 * terminal state below has to be materialized on this path.
 *
 * Callers MUST require double confirmation before invoking this function.
 */
export async function resetAppData(): Promise<void> {
    await wipeFinancialData();
    await ensureUsableState();

    // Trigger full reactive refresh. 'recurringRules' belongs here: the wipe
    // above clears recurring_rules along with its four siblings, so a rules
    // screen left mounted across the reset kept rendering rows that no longer
    // exist until something else happened to refresh it.
    dataEvents.emitMultiple(['wallets', 'transactions', 'categories', 'budgets', 'recurringRules']);
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
 * "old currency + freshly-seeded 0-balance data" - never "new currency + old
 * amounts".
 *
 * The terminal state is materialized through the same helper resetAppData uses,
 * and BEFORE the currency is written: the wallet this creates has a zero balance
 * and no transactions, so it carries no amount that could be read under the
 * wrong unit whichever of the two failure states above occurs.
 *
 * Callers MUST require explicit destructive confirmation before invoking this.
 */
export async function resetFinancialDataForCurrencyReset(newCode: string): Promise<AppSettings> {
    await wipeFinancialData();
    await ensureUsableState();
    const updated = await unlockAndResetCurrency(newCode);
    // 'recurringRules' for the same reason as resetAppData above.
    dataEvents.emitMultiple([
        'wallets', 'transactions', 'categories', 'budgets', 'recurringRules', 'settings',
    ]);
    return updated;
}
