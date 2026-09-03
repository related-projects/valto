/**
 * Reset Service Tests
 *
 * resetAppData deletes every financial record, re-seeds the default categories
 * and leaves the user exactly one empty wallet - while preserving the settings
 * blob (currency, language, theme, notification preference) and the security
 * config that keeps the app lock enabled.
 *
 * Backed by a real in-memory SQLite db and a real in-memory KV store: these
 * tests assert the state AFTER the reset, not that a call was made. The previous
 * revision mocked the storage adapter and the db layer wholesale, so it could
 * only prove that `remove` had been invoked with a key - never that anything was
 * cleared, nor that anything was kept.
 */

import { createTestDb } from '../../../tests/helpers/createTestDb';
import { CategoryType, WalletType } from '../../domain/entities';
import { CategoryRepository } from '../repositories/CategoryRepository';
import { WalletRepository } from '../repositories/WalletRepository';
import type { SqlDatabase } from '../storage/sql/SqlDatabase';

// Settings, security config and the legacy KV copies live in KV - back them with
// a shared in-memory store so preservation is observable.
jest.mock('../storage/AsyncStorageAdapter', () => {
    const mem = new (require('../../../tests/helpers/InMemoryStorage').InMemoryStorage)();
    (global as any).__kv = mem;
    return { __esModule: true, AsyncStorageAdapter: jest.fn(), asyncStorageAdapter: mem };
});

// The re-seed and the initial wallet pull repos from the DI container - back
// them with the raw test db.
jest.mock('../../core/di', () => ({
    getWalletRepository: () => new (require('../repositories/WalletRepository').WalletRepository)((global as any).__testDb),
    getCategoryRepository: () => new (require('../repositories/CategoryRepository').CategoryRepository)((global as any).__testDb),
    getTransactionRepository: () => ({ getAll: jest.fn().mockResolvedValue([]) }),
}));

// The wipe reads the db via getDb().
jest.mock('../storage/sql/database', () => ({
    getDb: () => (global as any).__resetDb,
}));

// Silence the reactive event bus.
jest.mock('../../core/events', () => ({
    dataEvents: { emitMultiple: jest.fn(), emit: jest.fn() },
}));

// resetService must never touch the scheduled reminder. These spies are what
// makes "nothing was cancelled" an assertion rather than an assumption: they
// catch a cancel reached through any transitive import, not just a direct one.
const mockCancelAllNotifications = jest.fn().mockResolvedValue(undefined);
const mockCancelScheduledNotification = jest.fn().mockResolvedValue(undefined);
jest.mock('expo-notifications', () => ({
    cancelAllScheduledNotificationsAsync: () => mockCancelAllNotifications(),
    cancelScheduledNotificationAsync: (...args: any[]) => mockCancelScheduledNotification(...args),
    scheduleNotificationAsync: jest.fn().mockResolvedValue('mock-id'),
    getPermissionsAsync: jest.fn().mockResolvedValue({ status: 'granted' }),
    setNotificationChannelAsync: jest.fn().mockResolvedValue(undefined),
    SchedulableTriggerInputTypes: { DAILY: 'daily' },
    AndroidImportance: { HIGH: 6 },
}));

import { resetAppData } from '../services/resetService';
import { loadSettings, selectAndLockCurrency, updateSetting } from '../services/settingsService';
import { defaultCategories } from '../seed/seedData';
import { asyncStorageAdapter, StorageKeys } from '../storage';

/**
 * The seed creates categories only - the reset adds the single empty wallet.
 *
 * Derived from the seed itself rather than hand-copied: this asserts "the reset
 * re-seeds the whole default set", which is the invariant, and stays true when
 * the set changes.
 */
const DEFAULT_CATEGORY_COUNT = defaultCategories.length;
const WALLET_COUNT_AFTER_RESET = 1;

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

describe('resetAppData', () => {
    beforeEach(async () => {
        jest.clearAllMocks();
        const db = await createTestDb();
        (global as any).__testDb = db;
        (global as any).__resetDb = db;
        await (global as any).__kv.clear();
    });

    it('deletes every pre-existing financial record', async () => {
        const db = (global as any).__testDb as SqlDatabase;
        const { wallet, category } = await seedFinancialData(db);

        await resetAppData();

        // The three tables the reset leaves empty.
        expect(await countRows(db, 'transactions')).toBe(0);
        expect(await countRows(db, 'budgets')).toBe(0);
        expect(await countRows(db, 'recurring_rules')).toBe(0);

        // wallets and categories are emptied too, then re-populated by the
        // re-seed and the initial wallet - so assert the OLD rows are gone.
        const wallets = await new WalletRepository(db).getAll();
        expect(wallets.some(w => w.id === wallet.id)).toBe(false);
        const categories = await new CategoryRepository(db).getAll();
        expect(categories.some(c => c.id === category.id)).toBe(false);
    });

    it('preserves the settings blob byte for byte, currency included', async () => {
        await selectAndLockCurrency('XOF');
        await updateSetting('language', 'fr');
        await updateSetting('theme', 'dark');
        await updateSetting('onboardingCompleted', true);
        await updateSetting('decimalSeparator', 'comma');
        const before = await asyncStorageAdapter.get(StorageKeys.SETTINGS);

        await resetAppData();

        expect(await asyncStorageAdapter.get(StorageKeys.SETTINGS)).toEqual(before);

        const settings = await loadSettings();
        expect(settings.currency).toBe('XOF');
        expect(settings.currencyLocked).toBe(true);
        expect(settings.language).toBe('fr');
        expect(settings.theme).toBe('dark');
        expect(settings.onboardingCompleted).toBe(true);
        expect(settings.decimalSeparator).toBe('comma');
    });

    it('preserves the security config so the app lock survives', async () => {
        const security = { pinHash: 'abc123', biometricsEnabled: true, autoLockTimeout: 60 };
        await asyncStorageAdapter.set(StorageKeys.SECURITY_CONFIG, security);

        await resetAppData();

        expect(await asyncStorageAdapter.get(StorageKeys.SECURITY_CONFIG)).toEqual(security);
    });

    it('removes the legacy recurring-rules KV copy alongside its siblings', async () => {
        await asyncStorageAdapter.set(StorageKeys.RECURRING_RULES, [{ id: 'rr-legacy' }]);
        await asyncStorageAdapter.set(StorageKeys.WALLETS, [{ id: 'w-legacy' }]);
        await asyncStorageAdapter.set(StorageKeys.TRANSACTIONS, [{ id: 't-legacy', amount: 15000 }]);
        await asyncStorageAdapter.set(StorageKeys.CATEGORIES, [{ id: 'c-legacy' }]);
        await asyncStorageAdapter.set(StorageKeys.BUDGETS, [{ id: 'b-legacy', limitAmount: 50000 }]);

        await resetAppData();

        expect(await asyncStorageAdapter.get(StorageKeys.RECURRING_RULES)).toBeNull();
        expect(await asyncStorageAdapter.get(StorageKeys.WALLETS)).toBeNull();
        expect(await asyncStorageAdapter.get(StorageKeys.TRANSACTIONS)).toBeNull();
        expect(await asyncStorageAdapter.get(StorageKeys.CATEGORIES)).toBeNull();
        expect(await asyncStorageAdapter.get(StorageKeys.BUDGETS)).toBeNull();
    });

    it('leaves exactly one wallet with a zero balance', async () => {
        const db = (global as any).__testDb as SqlDatabase;
        await seedFinancialData(db);

        await resetAppData();

        const wallets = await new WalletRepository(db).getAll();
        expect(wallets).toHaveLength(WALLET_COUNT_AFTER_RESET);
        expect(wallets[0].balance).toBe(0);

        const res = await db.execute('SELECT opening_balance FROM wallets');
        expect(Number((res.rows[0] as { opening_balance: number }).opening_balance)).toBe(0);
    });

    it('re-runs the seed so the default categories are back', async () => {
        const db = (global as any).__testDb as SqlDatabase;
        await seedFinancialData(db);

        await resetAppData();

        const categories = await new CategoryRepository(db).getAll();
        expect(categories).toHaveLength(DEFAULT_CATEGORY_COUNT);
        expect(await asyncStorageAdapter.get(StorageKeys.SEED_INITIALIZED)).toBe(true);
    });

    it('keeps the notification preference on and cancels nothing', async () => {
        await updateSetting('notificationsEnabled', true);

        await resetAppData();

        const settings = await loadSettings();
        expect(settings.notificationsEnabled).toBe(true);
        expect(mockCancelScheduledNotification).not.toHaveBeenCalled();
        expect(mockCancelAllNotifications).not.toHaveBeenCalled();
    });
});
