/**
 * Currency Reset Tests
 *
 * resetFinancialDataForCurrencyReset wipes all financial data, re-seeds the
 * defaults, and switches the base currency - while preserving the settings
 * blob, security config, and keystore key. Uses a real in-memory SQLite db so
 * the wipe + reseed + rollback are exercised end-to-end.
 */

import { createTestDb } from '../../../tests/helpers/createTestDb';
import { FaultInjectingDatabase } from '../../../tests/helpers/FaultInjectingDatabase';
import { CategoryType, WalletType } from '../../domain/entities';
import type { SqlDatabase } from '../storage/sql/SqlDatabase';
import { CategoryRepository } from '../repositories/CategoryRepository';
import { WalletRepository } from '../repositories/WalletRepository';

// Settings + seed flag live in KV - back them with a shared in-memory store.
jest.mock('../storage/AsyncStorageAdapter', () => {
    const mem = new (require('../../../tests/helpers/InMemoryStorage').InMemoryStorage)();
    (global as any).__kv = mem;
    return { __esModule: true, AsyncStorageAdapter: jest.fn(), asyncStorageAdapter: mem };
});

// Seed re-population pulls repos from the DI container - back them with the raw db.
jest.mock('../../core/di', () => ({
    getWalletRepository: () => new (require('../repositories/WalletRepository').WalletRepository)((global as any).__testDb),
    getCategoryRepository: () => new (require('../repositories/CategoryRepository').CategoryRepository)((global as any).__testDb),
    getTransactionRepository: () => ({ getAll: jest.fn().mockResolvedValue([]) }),
}));

// The wipe reads the db via getDb() - swap in the (optionally fault-wrapped) db.
jest.mock('../storage/sql/database', () => ({
    getDb: () => (global as any).__resetDb,
}));

// Silence the reactive event bus.
jest.mock('../../core/events', () => ({
    dataEvents: { emitMultiple: jest.fn(), emit: jest.fn() },
}));

import { resetFinancialDataForCurrencyReset } from '../services/resetService';
import { loadSettings, selectAndLockCurrency, updateSetting } from '../services/settingsService';
import { defaultCategories } from '../seed/seedData';
import { asyncStorageAdapter, StorageKeys } from '../storage';

// The seed still creates no wallets, but the reset no longer stops at the seed:
// both reset paths now converge on ensureUsableState, which leaves the one empty
// wallet an already-onboarded user needs to record anything again. This used to
// be 0 - onboarding is the only other source of a first wallet, and it never runs
// again after a currency change, so the old terminal state was an install where
// no transaction could be entered.
const DEFAULT_WALLET_COUNT = 1;
// Derived from the seed itself rather than hand-copied: the invariant under test
// is "the reset re-seeds the whole default set", not any particular count.
const DEFAULT_CATEGORY_COUNT = defaultCategories.length;

async function countRows(db: SqlDatabase, table: string): Promise<number> {
    const res = await db.execute(`SELECT COUNT(*) AS c FROM ${table}`);
    return Number((res.rows[0] as { c: number }).c);
}

async function seedFinancialData(db: SqlDatabase) {
    const wallet = await new WalletRepository(db).create({
        name: 'Custom Wallet',
        balance: 5000,
        type: WalletType.CASH,
        color: '#111111',
    });
    const category = await new CategoryRepository(db).create({
        name: 'Custom Category',
        type: CategoryType.EXPENSE,
        icon: 'star',
        color: '#222222',
    });
    const now = new Date().toISOString();
    await db.execute(
        `INSERT INTO transactions (id, type, amount, category_id, wallet_id, date, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        ['tx-1', 'expense', 1200, category.id, wallet.id, now, now],
    );
    await db.execute(
        `INSERT INTO budgets (id, category_id, month, limit_amount, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
        ['bg-1', category.id, '2026-07', 50000, now, now],
    );
    await db.execute(
        `INSERT INTO recurring_rules
            (id, type, amount, wallet_id, category_id, start_date, frequency, interval_count, last_generated_date, is_paused, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        ['rr-1', 'expense', 3000, wallet.id, category.id, now, 'monthly', 1, now, 0, now],
    );
    return { wallet, category };
}

describe('resetFinancialDataForCurrencyReset', () => {
    beforeEach(async () => {
        const db = await createTestDb();
        (global as any).__testDb = db;
        (global as any).__resetDb = db;
        await (global as any).__kv.clear();
    });

    it('wipes every pre-existing record and re-seeds defaults + switches currency (DoD 1)', async () => {
        const db = (global as any).__testDb as SqlDatabase;
        await selectAndLockCurrency('USD');
        const { wallet, category } = await seedFinancialData(db);

        const updated = await resetFinancialDataForCurrencyReset('XOF');

        expect(updated.currency).toBe('XOF');
        expect(updated.currencyLocked).toBe(true);

        const wallets = await new WalletRepository(db).getAll();
        expect(wallets.some(w => w.id === wallet.id)).toBe(false);
        expect(wallets).toHaveLength(DEFAULT_WALLET_COUNT);

        const categories = await new CategoryRepository(db).getAll();
        expect(categories.some(c => c.id === category.id)).toBe(false);
        expect(categories).toHaveLength(DEFAULT_CATEGORY_COUNT);

        expect(await countRows(db, 'transactions')).toBe(0);
        expect(await countRows(db, 'budgets')).toBe(0);
        expect(await countRows(db, 'recurring_rules')).toBe(0);
    });

    /**
     * The terminal state, asserted as an invariant rather than as a count: a
     * currency change runs on an install that has already onboarded, so nothing
     * else will ever create a wallet for it. This is the assertion that fails if
     * the currency reset stops calling the shared helper and drifts away from
     * resetAppData again.
     */
    it('leaves an install that can still record a transaction', async () => {
        const db = (global as any).__testDb as SqlDatabase;
        await selectAndLockCurrency('USD');
        await seedFinancialData(db);

        await resetFinancialDataForCurrencyReset('XOF');

        const wallets = await new WalletRepository(db).getAll();
        expect(wallets.length).toBeGreaterThanOrEqual(1);
        expect(wallets[0].balance).toBe(0);

        const categories = await new CategoryRepository(db).getAll();
        expect(categories.length).toBeGreaterThan(0);
    });

    it('preserves language, theme, onboarding flag and security config (DoD 2)', async () => {
        await updateSetting('language', 'fr');
        await updateSetting('theme', 'dark');
        await updateSetting('onboardingCompleted', true);
        await selectAndLockCurrency('USD');
        const security = { pinHash: 'abc123', biometricsEnabled: true, autoLockTimeout: 60 };
        await asyncStorageAdapter.set(StorageKeys.SECURITY_CONFIG, security);

        await resetFinancialDataForCurrencyReset('EUR');

        const settings = await loadSettings();
        expect(settings.language).toBe('fr');
        expect(settings.theme).toBe('dark');
        expect(settings.onboardingCompleted).toBe(true);
        expect(settings.currency).toBe('EUR');
        expect(settings.currencyLocked).toBe(true);
        expect(await asyncStorageAdapter.get(StorageKeys.SECURITY_CONFIG)).toEqual(security);
    });

    it('leaves old currency + old data intact when the wipe fails mid-transaction (DoD 4)', async () => {
        const raw = (global as any).__testDb as SqlDatabase;
        await selectAndLockCurrency('USD');
        const { wallet } = await seedFinancialData(raw);

        // Fail the first DELETE inside the wipe transaction -> full rollback.
        (global as any).__resetDb = FaultInjectingDatabase.failOnNthMatch(raw, /DELETE FROM/i, 1);

        await expect(resetFinancialDataForCurrencyReset('XOF')).rejects.toThrow();

        // Currency never flipped (write happens only after a successful wipe).
        const settings = await loadSettings();
        expect(settings.currency).toBe('USD');
        expect(settings.currencyLocked).toBe(true);

        // Data rolled back - nothing lost.
        const wallets = await new WalletRepository(raw).getAll();
        expect(wallets.some(w => w.id === wallet.id)).toBe(true);
        expect(await countRows(raw, 'transactions')).toBe(1);
        expect(await countRows(raw, 'budgets')).toBe(1);
        expect(await countRows(raw, 'recurring_rules')).toBe(1);
    });
});
