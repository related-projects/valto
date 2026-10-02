/**
 * V-119 b: a backup made while a restore is in flight.
 *
 * The audited path (pass 74): createBackupSnapshot read the five tables with
 * plain SELECTs, outside any transaction and outside the runner queue, on the
 * one shared connection. A backup started while restoreFromSnapshot held its
 * transaction open read the restore's uncommitted rows; when the restore was
 * then refused and rolled back, the backup file held rows the database no
 * longer had, and none of the ledger it did have.
 *
 * A backup must reflect one committed state of the database: here, the ledger
 * as it stands after the rollback.
 *
 * Deterministic: better-sqlite3 resolves each statement immediately, and the
 * restore is held by a GatedDatabase on its first transaction insert, so the
 * backup always starts while the restore's transaction is open.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { GatedDatabase } from '../../../tests/helpers/GatedDatabase';
import { createTestDb } from '../../../tests/helpers/createTestDb';
import { container } from '../../core/di/container';
import {
    type Budget,
    type Category,
    CategoryType,
    RecurrenceFrequency,
    type RecurringTransaction,
    type Transaction,
    TransactionType,
    type Wallet,
    WalletType,
    serializeBudget,
    serializeCategory,
    serializeRecurringTransaction,
    serializeTransaction,
    serializeWallet,
} from '../../domain/entities';
import { BudgetRepository } from '../repositories/BudgetRepository';
import { CategoryRepository } from '../repositories/CategoryRepository';
import { RecurringTransactionRepository } from '../repositories/RecurringTransactionRepository';
import { TransactionRepository } from '../repositories/TransactionRepository';
import { WalletRepository } from '../repositories/WalletRepository';
import {
    type BackupSnapshot,
    CURRENT_SCHEMA_VERSION,
    createAndShareBackup,
    restoreFromSnapshot,
} from '../services/backupService';
import { getDefaultSettings, loadSettings } from '../services/settingsService';
import { __setDatabaseForTests } from '../storage/sql/database';
import type { SqlDatabase } from '../storage/sql/SqlDatabase';

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

/** Every JSON body createAndShareBackup wrote, newest last. */
const mockWrittenBackups: string[] = [];

jest.mock('expo-file-system', () => ({
    File: jest.fn().mockImplementation(() => ({
        uri: 'file:///mock/cache/backup.json',
        write: (content: string) => {
            mockWrittenBackups.push(content);
        },
    })),
    Paths: { cache: '/mock/cache' },
}));

jest.mock('expo-sharing', () => ({
    shareAsync: jest.fn().mockResolvedValue(undefined),
    isAvailableAsync: jest.fn().mockResolvedValue(true),
}));

jest.mock('../../core/events', () => ({
    dataEvents: { emit: jest.fn(), emitMultiple: jest.fn() },
}));

const ISO = '2026-01-01T00:00:00.000Z';
const WALLET_ID = 'w-cash';

// --- The live ledger ---

const WALLET: Wallet = {
    id: WALLET_ID,
    name: 'Cash',
    balance: 50000,
    type: WalletType.CASH,
    createdAt: new Date(ISO),
};

const CATEGORIES: Category[] = [
    { id: 'food', name: 'Food', type: CategoryType.EXPENSE },
    { id: 'salary', name: 'Salary', type: CategoryType.INCOME },
];

const TRANSACTION: Transaction = {
    id: 't-live',
    type: TransactionType.EXPENSE,
    amount: 2500,
    categoryId: 'food',
    walletId: WALLET_ID,
    date: new Date(ISO),
    note: 'live',
    createdAt: new Date(ISO),
};

const BUDGET: Budget = {
    id: 'b-live',
    categoryId: 'food',
    month: '2026-01',
    limitAmount: 30000,
    createdAt: new Date(ISO),
    updatedAt: new Date(ISO),
};

/** Starts in 2030, so the suite never has an occurrence of it due. */
const RULE: RecurringTransaction = {
    id: 'rr-live',
    type: TransactionType.EXPENSE,
    amount: 4500,
    walletId: WALLET_ID,
    categoryId: 'food',
    description: 'Gym',
    startDate: new Date('2030-01-15T00:00:00.000Z'),
    frequency: RecurrenceFrequency.MONTHLY,
    interval: 1,
    lastGeneratedDate: new Date('2029-12-15T00:00:00.000Z'),
    lastGeneratedIndex: -1,
    scheduleVersion: 0,
    isPaused: false,
    createdAt: new Date(ISO),
};

async function seedLedger(db: SqlDatabase): Promise<void> {
    await db.runInTransaction(async () => {
        await new WalletRepository(db).save(WALLET);
        for (const c of CATEGORIES) {
            await new CategoryRepository(db).save(c);
        }
        await new TransactionRepository(db).save(TRANSACTION);
        await new BudgetRepository(db).save(BUDGET);
        await new RecurringTransactionRepository(db).save(RULE);
    });
}

// --- The file the restore refuses mid-way ---

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
        categories: [{ id: 'food', name: 'Food', type: CategoryType.EXPENSE }],
        budgets: [],
        recurringRules: [],
        settings: getDefaultSettings(),
    },
});

// --- Helpers ---

const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

/** What the file carries for `value`, as JSON would give it back. */
const asJson = <T>(value: T): unknown => JSON.parse(JSON.stringify(value));

/** The ledger a database holds, in the shape a backup file carries it. */
async function ledgerOf(db: SqlDatabase) {
    return asJson({
        wallets: (await new WalletRepository(db).getAll()).map(serializeWallet),
        transactions: (await new TransactionRepository(db).getAll()).map(serializeTransaction),
        categories: (await new CategoryRepository(db).getAll()).map(serializeCategory),
        budgets: (await new BudgetRepository(db).getAll()).map(serializeBudget),
        recurringRules: (await new RecurringTransactionRepository(db).getAll()).map(serializeRecurringTransaction),
    });
}

/** The ledger part of the last backup file written. */
function lastBackupLedger() {
    const file = JSON.parse(mockWrittenBackups[mockWrittenBackups.length - 1]) as BackupSnapshot;
    const { wallets, transactions, categories, budgets, recurringRules } = file.data;
    return { file, ledger: { wallets, transactions, categories, budgets, recurringRules } };
}

let inner: SqlDatabase;

beforeEach(async () => {
    jest.clearAllMocks();
    mockWrittenBackups.length = 0;
    await AsyncStorage.clear();
    inner = await createTestDb({ writeGuard: true });
    await seedLedger(inner);
});

afterEach(() => {
    __setDatabaseForTests(null);
    container.reset();
});

describe('V-119 b. a backup made while a restore is in flight', () => {
    it('V-119 b: a backup started while a restore is held open, the restore then refused, carries the ledger as it is after the rollback', async () => {
        const gated = new GatedDatabase(inner, /^\s*INSERT INTO transactions/i);
        __setDatabaseForTests(gated);
        container.reset();

        // The restore opens its transaction, clears the tables, inserts the
        // file's category and wallet, and is held on its first transaction
        // insert.
        const restore = Promise.allSettled([restoreFromSnapshot(snapshotRefusedMidway())]);
        await gated.reached;

        // The user backs up while the restore's transaction is open.
        const backup = Promise.allSettled([createAndShareBackup()]);
        for (let i = 0; i < 5; i++) await flush();

        gated.release();
        const [restoreResult] = await restore;
        expect(restoreResult.status).toBe('rejected');
        expect(String((restoreResult as PromiseRejectedResult).reason)).toMatch(/Restore refused/);

        const [backupResult] = await backup;
        expect(backupResult.status).toBe('fulfilled');
        expect(mockWrittenBackups).toHaveLength(1);

        const { ledger } = lastBackupLedger();
        expect(ledger).toEqual(await ledgerOf(inner));
    });
});

describe('V-119 b control: a backup with no restore running', () => {
    it('control: a backup with no restore running carries exactly the live ledger and the stored settings', async () => {
        __setDatabaseForTests(inner);
        container.reset();

        await createAndShareBackup();

        expect(mockWrittenBackups).toHaveLength(1);
        const { file, ledger } = lastBackupLedger();
        expect(file.version).toBe(CURRENT_SCHEMA_VERSION);
        expect(ledger).toEqual(
            asJson({
                wallets: [serializeWallet(WALLET)],
                transactions: [serializeTransaction(TRANSACTION)],
                categories: CATEGORIES.map(serializeCategory),
                budgets: [serializeBudget(BUDGET)],
                recurringRules: [serializeRecurringTransaction(RULE)],
            }),
        );
        expect(file.data.settings).toEqual(asJson(await loadSettings()));
    });
});
