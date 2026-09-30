/**
 * V-106 c: a transaction saved while a restore is in flight.
 *
 * The audited path, through production code: restoreFromSnapshot holds its
 * transaction open while it inserts the snapshot row by row, and the user saves
 * a transaction through the createTransaction use case in the meantime. The
 * snapshot carries an invalid transaction further down, so the restore is
 * refused and rolls back.
 *
 * Whatever the runner does, the user's write must never be reported as saved
 * and then lost: it is either durably in the ledger (with its balance change)
 * or the save is rejected with an error.
 *
 * Deterministic: better-sqlite3 resolves each statement immediately, and the
 * restore is held by an explicit gate on its first transaction insert, so the
 * user's save always starts while the restore's transaction is open.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { createTestDb } from '../../../tests/helpers/createTestDb';
import { TransactionType, WalletType } from '../../domain/entities';
import { createTransaction } from '../../domain/useCases/createTransaction';
import { TransactionRepository } from '../repositories/TransactionRepository';
import { WalletRepository } from '../repositories/WalletRepository';
import { CURRENT_SCHEMA_VERSION, restoreFromSnapshot, type BackupSnapshot } from '../services/backupService';
import { getDefaultSettings } from '../services/settingsService';
import { __setDatabaseForTests } from '../storage/sql/database';
import type { SqlDatabase, SqlQueryResult } from '../storage/sql/SqlDatabase';

// jest.mock calls are hoisted above the imports by babel-jest.
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

jest.mock('../../core/events', () => ({
    dataEvents: { emit: jest.fn(), emitMultiple: jest.fn() },
}));

const ISO = '2026-01-01T00:00:00.000Z';
const WALLET_ID = 'w-cash';
const OPENING_BALANCE = 50000;
const SAVED_AMOUNT = 1234;
const SAVED_NOTE = 'saved during restore';

/**
 * Holds the first statement matching `pattern` until release() is called.
 * Everything else, transaction control included, goes straight to the inner
 * connection, whose runner is reused so both chains share one lock.
 */
class GatedDatabase implements SqlDatabase {
    runInTransaction: <T>(work: () => Promise<T>) => Promise<T>;
    readonly reached: Promise<void>;
    private markReached!: () => void;
    private releaseGate!: () => void;
    private readonly gate: Promise<void>;
    private armed = true;

    constructor(
        private inner: SqlDatabase,
        private pattern: RegExp,
    ) {
        this.runInTransaction = inner.runInTransaction.bind(inner);
        this.reached = new Promise<void>((resolve) => {
            this.markReached = resolve;
        });
        this.gate = new Promise<void>((resolve) => {
            this.releaseGate = resolve;
        });
    }

    execute = async (sql: string, params: unknown[] = []): Promise<SqlQueryResult> => {
        if (this.armed && this.pattern.test(sql)) {
            this.armed = false;
            this.markReached();
            await this.gate;
        }
        return this.inner.execute(sql, params);
    };

    release(): void {
        this.releaseGate();
    }
}

/** One valid transaction first, then one the domain validator refuses. */
const snapshotRefusedMidway = (): BackupSnapshot => ({
    version: CURRENT_SCHEMA_VERSION,
    createdAt: ISO,
    appVersion: '1.0.0',
    data: {
        wallets: [{ id: WALLET_ID, name: 'Cash', balance: 85000, type: WalletType.CASH, createdAt: ISO }],
        transactions: [
            {
                id: 't-exp',
                type: TransactionType.EXPENSE,
                amount: 15000,
                categoryId: 'food',
                walletId: WALLET_ID,
                date: ISO,
                createdAt: ISO,
            },
            {
                id: 't-bad',
                type: TransactionType.EXPENSE,
                amount: -5000,
                categoryId: 'food',
                walletId: WALLET_ID,
                date: ISO,
                createdAt: ISO,
            },
        ],
        categories: [{ id: 'food', name: 'Food', type: 'expense' as never }],
        budgets: [],
        recurringRules: [],
        settings: getDefaultSettings(),
    },
});

const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

let inner: SqlDatabase;

beforeEach(async () => {
    jest.clearAllMocks();
    await AsyncStorage.clear();
    inner = await createTestDb();
    await inner.execute(
        `INSERT INTO wallets (id, name, balance, opening_balance, type, color, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [WALLET_ID, 'Cash', OPENING_BALANCE, OPENING_BALANCE, 'cash', null, ISO],
    );
    await inner.execute(`INSERT INTO categories (id, name, type) VALUES (?, ?, ?)`, ['food', 'Food', 'expense']);
});

afterEach(() => {
    __setDatabaseForTests(null);
});

describe('V-106 c. a save made while a restore is in flight', () => {
    it('V-106 c: a restore refused mid-way never takes with it a transaction the user was told was saved', async () => {
        const gated = new GatedDatabase(inner, /^\s*INSERT INTO transactions/i);
        __setDatabaseForTests(gated);

        // The restore opens its transaction, clears the tables, inserts the
        // category and the wallet, and is held on its first transaction insert.
        const restore = restoreFromSnapshot(snapshotRefusedMidway());
        const restoreOutcome = Promise.allSettled([restore]);
        await gated.reached;

        // The user saves through the production use case while the restore's
        // transaction is open.
        const save = createTransaction(
            {
                transactionRepo: new TransactionRepository(gated),
                walletRepo: new WalletRepository(gated),
                eventBus: { emit: jest.fn(), emitMultiple: jest.fn() },
                runInTransaction: gated.runInTransaction,
            },
            {
                type: TransactionType.EXPENSE,
                amount: SAVED_AMOUNT,
                walletId: WALLET_ID,
                categoryId: 'food',
                date: new Date(ISO),
                note: SAVED_NOTE,
            },
        );
        const saveOutcome = Promise.allSettled([save]);
        await flush();

        gated.release();
        const [restoreResult] = await restoreOutcome;
        expect(restoreResult.status).toBe('rejected');
        expect(String((restoreResult as PromiseRejectedResult).reason)).toMatch(/Restore refused/);

        const [saveResult] = await saveOutcome;
        const saved = await inner.execute('SELECT id FROM transactions WHERE note = ?', [SAVED_NOTE]);
        const wallet = await inner.execute('SELECT balance FROM wallets WHERE id = ?', [WALLET_ID]);

        const reportedSaved = saveResult.status === 'fulfilled';
        const durablyPresent =
            saved.rows.length === 1 && Number(wallet.rows[0]?.balance) === OPENING_BALANCE - SAVED_AMOUNT;

        // Either durably present, or rejected with an error - never reported as
        // saved and then lost.
        expect({ reportedSaved, durablyPresent }).not.toEqual({ reportedSaved: true, durablyPresent: false });
        expect(saveResult.status === 'fulfilled' || saveResult.reason instanceof Error).toBe(true);
    });
});
