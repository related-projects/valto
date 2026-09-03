/**
 * Backup Restore -> SQLite Tests
 *
 * The shipped restore wrote the snapshot's wallets/transactions/categories/budgets
 * to the legacy AsyncStorage keys. No repository reads AsyncStorage, so the ledger
 * was never touched: the user was told the restore succeeded and kept their old
 * data, while a cleartext copy of the backup was left in the unencrypted KV store.
 *
 * These tests assert the state AFTER a restore through the real repositories and
 * a real in-memory SQLite db - not that a call was made. The KV assertions are
 * the residue half: a restore must leave no financial key behind.
 */

import { createTestDb } from '../../../tests/helpers/createTestDb';
import { TransactionType, WalletType } from '../../domain/entities';
import { BudgetRepository } from '../repositories/BudgetRepository';
import { CategoryRepository } from '../repositories/CategoryRepository';
import { TransactionRepository } from '../repositories/TransactionRepository';
import { WalletRepository } from '../repositories/WalletRepository';
import type { SqlDatabase } from '../storage/sql/SqlDatabase';

jest.mock('expo-notifications', () => ({
    getPermissionsAsync: jest.fn().mockResolvedValue({ status: 'denied' }),
    requestPermissionsAsync: jest.fn(),
    scheduleNotificationAsync: jest.fn().mockResolvedValue('mock-id'),
    cancelAllScheduledNotificationsAsync: jest.fn().mockResolvedValue(undefined),
    cancelScheduledNotificationAsync: jest.fn().mockResolvedValue(undefined),
    setNotificationChannelAsync: jest.fn().mockResolvedValue(undefined),
    setNotificationHandler: jest.fn(),
    SchedulableTriggerInputTypes: { TIME_INTERVAL: 'timeInterval', DAILY: 'daily' },
    AndroidImportance: { HIGH: 6 },
}));

jest.mock('expo-document-picker', () => ({ getDocumentAsync: jest.fn() }));
jest.mock('expo-sharing', () => ({
    shareAsync: jest.fn().mockResolvedValue(undefined),
    isAvailableAsync: jest.fn().mockResolvedValue(true),
}));

// Silence the reactive event bus.
jest.mock('../../core/events', () => ({
    dataEvents: { emit: jest.fn(), emitMultiple: jest.fn() },
}));

import AsyncStorage from '@react-native-async-storage/async-storage';
import { CURRENT_SCHEMA_VERSION, restoreFromSnapshot, type BackupSnapshot } from '../services/backupService';
import { asyncStorageAdapter, StorageKeys } from '../storage';
import { __setDatabaseForTests } from '../storage/sql/database';

const ISO = '2026-01-01T00:00:00.000Z';

/**
 * Wallet balances already reflect their transactions, including both legs of a
 * double-entry transfer - the same shape v5's import fixture uses:
 *   Cash: 100000 - 15000 (expense) + 5000 (income) - 25000 (transfer-out) = 65000
 *   Bank: 0 + 25000 (transfer-in) = 25000
 */
const snapshot = (): BackupSnapshot => ({
    version: CURRENT_SCHEMA_VERSION,
    createdAt: ISO,
    appVersion: '1.0.0',
    data: {
        wallets: [
            { id: 'w-cash', name: 'Cash', balance: 65000, type: WalletType.CASH, color: '#111111', createdAt: ISO },
            { id: 'w-bank', name: 'Bank', balance: 25000, type: WalletType.BANK, createdAt: ISO },
        ],
        transactions: [
            { id: 't-exp', type: TransactionType.EXPENSE, amount: 15000, categoryId: 'food', walletId: 'w-cash', date: ISO, note: 'lunch', createdAt: ISO },
            { id: 't-inc', type: TransactionType.INCOME, amount: 5000, categoryId: 'salary', walletId: 'w-cash', date: ISO, createdAt: ISO },
            { id: 't-tout', type: TransactionType.TRANSFER, amount: 25000, categoryId: 'transfer-out', walletId: 'w-cash', date: ISO, createdAt: ISO },
            { id: 't-tin', type: TransactionType.TRANSFER, amount: 25000, categoryId: 'transfer-in', walletId: 'w-bank', date: ISO, createdAt: ISO },
        ],
        categories: [
            { id: 'food', name: 'Food', type: 'expense' as never, icon: 'cart', color: '#FF5722' },
            { id: 'salary', name: 'Salary', type: 'income' as never },
            { id: 'transfer-out', name: 'Transfer Out', type: 'expense' as never },
            { id: 'transfer-in', name: 'Transfer In', type: 'income' as never },
        ],
        budgets: [
            { id: 'b-food', categoryId: 'food', month: '2026-01', limitAmount: 50000, createdAt: ISO, updatedAt: ISO },
        ],
    },
});

/** Pre-restore ledger: one wallet, one category, one transaction, one budget. */
async function seedPreRestoreState(db: SqlDatabase) {
    await db.execute(
        `INSERT INTO wallets (id, name, balance, opening_balance, type, color, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        ['w-old', 'Old Wallet', 4200, 4200, 'cash', null, ISO],
    );
    await db.execute(
        `INSERT INTO categories (id, name, type) VALUES (?, ?, ?)`,
        ['cat-old', 'Old Category', 'expense'],
    );
    await db.execute(
        `INSERT INTO transactions (id, type, amount, category_id, wallet_id, date, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        ['tx-old', 'expense', 900, 'cat-old', 'w-old', ISO, ISO],
    );
    await db.execute(
        `INSERT INTO budgets (id, category_id, month, limit_amount, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
        ['b-old', 'cat-old', '2025-12', 1000, ISO, ISO],
    );
}

let db: SqlDatabase;

beforeEach(async () => {
    jest.clearAllMocks();
    await AsyncStorage.clear();
    db = await createTestDb();
    __setDatabaseForTests(db);
});

afterEach(() => {
    __setDatabaseForTests(null);
});

describe('restoreFromSnapshot writes the ledger to SQLite', () => {
    it('makes every restored record readable through the repositories', async () => {
        await restoreFromSnapshot(snapshot());

        const wallets = await new WalletRepository(db).getAll();
        expect(wallets.map((w) => w.id).sort()).toEqual(['w-bank', 'w-cash']);
        expect(wallets.find((w) => w.id === 'w-cash')!.balance).toBe(65000);
        expect(wallets.find((w) => w.id === 'w-cash')!.name).toBe('Cash');
        expect(wallets.find((w) => w.id === 'w-bank')!.balance).toBe(25000);

        const transactions = await new TransactionRepository(db).getAll();
        expect(transactions).toHaveLength(4);
        const expense = transactions.find((t) => t.id === 't-exp')!;
        expect(expense.amount).toBe(15000);
        expect(expense.note).toBe('lunch');

        const categories = await new CategoryRepository(db).getAll();
        expect(categories.map((c) => c.id).sort()).toEqual(['food', 'salary', 'transfer-in', 'transfer-out']);

        const budgets = await new BudgetRepository(db).getAll();
        expect(budgets).toHaveLength(1);
        expect(budgets[0].limitAmount).toBe(50000);
    });

    it('replaces the pre-restore ledger instead of merging into it', async () => {
        await seedPreRestoreState(db);

        await restoreFromSnapshot(snapshot());

        const wallets = await new WalletRepository(db).getAll();
        expect(wallets.some((w) => w.id === 'w-old')).toBe(false);
        const transactions = await new TransactionRepository(db).getAll();
        expect(transactions.some((t) => t.id === 'tx-old')).toBe(false);
        const categories = await new CategoryRepository(db).getAll();
        expect(categories.some((c) => c.id === 'cat-old')).toBe(false);
        const budgets = await new BudgetRepository(db).getAll();
        expect(budgets.some((b) => b.id === 'b-old')).toBe(false);
    });

    it('writes no financial key to the unencrypted key-value store', async () => {
        await restoreFromSnapshot(snapshot());

        expect(await asyncStorageAdapter.get(StorageKeys.WALLETS)).toBeNull();
        expect(await asyncStorageAdapter.get(StorageKeys.TRANSACTIONS)).toBeNull();
        expect(await asyncStorageAdapter.get(StorageKeys.CATEGORIES)).toBeNull();
        expect(await asyncStorageAdapter.get(StorageKeys.BUDGETS)).toBeNull();
        expect(await asyncStorageAdapter.get(StorageKeys.RECURRING_RULES)).toBeNull();
    });

    it('anchors opening_balance at balance - ledgerSum so no wallet reads as drifted', async () => {
        await restoreFromSnapshot(snapshot());

        const repo = new WalletRepository(db);

        // w-cash: 65000 - (-15000 + 5000 - 25000) = 100000
        // w-bank: 25000 - (25000)                 = 0
        const { rows } = await db.execute('SELECT id, opening_balance FROM wallets ORDER BY id');
        expect(rows).toEqual([
            { id: 'w-bank', opening_balance: 0 },
            { id: 'w-cash', opening_balance: 100000 },
        ]);

        for (const audit of await repo.auditBalances()) {
            expect(audit.drift).toBe(0);
            expect(audit.stored).toBe(audit.computed);
        }
    });

    it('leaves recurring rules alone - the snapshot cannot restore them', async () => {
        await db.execute(
            `INSERT INTO recurring_rules
                (id, type, amount, wallet_id, category_id, start_date, frequency, interval_count, last_generated_date, is_paused, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            ['rr-1', 'expense', 3000, 'w-old', 'cat-old', ISO, 'monthly', 1, ISO, 0, ISO],
        );

        await restoreFromSnapshot(snapshot());

        const { rows } = await db.execute('SELECT COUNT(*) AS c FROM recurring_rules');
        expect(Number(rows[0].c)).toBe(1);
    });
});

describe('restoreFromSnapshot atomicity', () => {
    it('rolls the whole restore back when a write fails part-way, leaving the previous data intact', async () => {
        await seedPreRestoreState(db);

        // Fault injection: the budget insert - the LAST write of the restore -
        // throws, so wallets, categories and transactions have already been
        // deleted and re-inserted inside the open transaction when it fires.
        // Only a real ROLLBACK can put the previous ledger back.
        const faulty: SqlDatabase = {
            execute: async (sql: string, params?: unknown[]) => {
                if (sql.includes('INSERT INTO budgets')) {
                    throw new Error('disk I/O error');
                }
                return db.execute(sql, params);
            },
            // The runner's own BEGIN/COMMIT/ROLLBACK still reach the real db.
            runInTransaction: db.runInTransaction.bind(db),
        };
        __setDatabaseForTests(faulty);

        await expect(restoreFromSnapshot(snapshot())).rejects.toThrow(
            'Restore failed while writing data. Your previous data has been preserved.',
        );

        // Every pre-restore row is back, and nothing from the snapshot landed.
        const wallets = await new WalletRepository(db).getAll();
        expect(wallets).toHaveLength(1);
        expect(wallets[0].id).toBe('w-old');
        expect(wallets[0].balance).toBe(4200);

        const transactions = await new TransactionRepository(db).getAll();
        expect(transactions).toHaveLength(1);
        expect(transactions[0].id).toBe('tx-old');

        const categories = await new CategoryRepository(db).getAll();
        expect(categories).toHaveLength(1);
        expect(categories[0].id).toBe('cat-old');

        const budgets = await new BudgetRepository(db).getAll();
        expect(budgets).toHaveLength(1);
        expect(budgets[0].id).toBe('b-old');
    });

    it('does not persist the snapshot settings when the ledger write fails', async () => {
        const faulty: SqlDatabase = {
            execute: async (sql: string, params?: unknown[]) => {
                if (sql.includes('INSERT INTO budgets')) {
                    throw new Error('disk I/O error');
                }
                return db.execute(sql, params);
            },
            runInTransaction: db.runInTransaction.bind(db),
        };
        __setDatabaseForTests(faulty);

        const withSettings = snapshot();
        withSettings.data.settings = {
            theme: 'dark',
            currency: 'EUR',
            currencyLocked: true,
            notificationsEnabled: false,
            language: 'fr',
            dateFormat: 'DD/MM/YYYY',
            firstDayOfWeek: 'monday',
            decimalSeparator: 'comma',
            onboardingCompleted: true,
        };

        await expect(restoreFromSnapshot(withSettings)).rejects.toThrow('Restore failed');

        expect(await asyncStorageAdapter.get(StorageKeys.SETTINGS)).toBeNull();
    });
});
