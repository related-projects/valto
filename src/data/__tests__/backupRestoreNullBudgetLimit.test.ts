/**
 * A backup whose budget limit is null restores, the budget kept at the cap
 *
 * 1.1.3 let a budget limit be Infinity. JSON has no Infinity, so the backup
 * that build wrote carries the limit as null. Pass 88 measured the restore of
 * such a file: the null reached `limit_amount INTEGER NOT NULL`, the insert
 * failed, the whole restore rolled back and the user read "Could not restore
 * from backup". The app wrote the file, so it must restore (policy 14; V-127,
 * decision 2). Owner decision 04/11: the budget is kept, its limit set to the
 * largest amount the app accepts, MAX_ENTRY_AMOUNT_MINOR.
 *
 * Every row is written by the production writers and backed up by
 * createAndShareBackup; the one hand-made step writes one budget's limit the
 * way 1.1.3 wrote it. Everything else in the file must come back exactly.
 *
 * Real here: backupService, the use cases, the repositories, the recurring
 * engine and the migrations, over BetterSqliteDatabase. The file system is
 * tests/helpers/memoryFileSystem.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import * as DocumentPicker from 'expo-document-picker';
import * as Sharing from 'expo-sharing';
import { BetterSqliteDatabase } from '../../../tests/helpers/BetterSqliteDatabase';
import { MemoryFile, memoryContents, memoryFiles } from '../../../tests/helpers/memoryFileSystem';
import { pinClock, restoreZoneClock } from '../../../tests/helpers/zoneClock';
import { container, getUseCaseDeps } from '../../core/di/container';
import { MAX_ENTRY_AMOUNT_MINOR } from '../../domain/constants/amounts';
import { getCurrentMonth, serializeBudget } from '../../domain/entities/Budget';
import { CategoryType } from '../../domain/entities/Category';
import { RecurrenceFrequency, serializeRecurringTransaction } from '../../domain/entities/RecurringTransaction';
import { TransactionType, serializeTransaction } from '../../domain/entities/Transaction';
import { WalletType, serializeWallet } from '../../domain/entities/Wallet';
import { createTransaction } from '../../domain/useCases/createTransaction';
import { createWallet } from '../../domain/useCases/createWallet';
import { transferFunds } from '../../domain/useCases/transferFunds';
import { runMigrations } from '../migrations';
import { createAndShareBackup, pickAndRestoreBackup, type BackupSnapshot } from '../services/backupService';
import { asyncStorageAdapter, StorageKeys } from '../storage';
import { __setDatabaseForTests } from '../storage/sql/database';
import { SCHEMA_STATEMENTS } from '../storage/sql/schema';

jest.mock('expo-application', () => ({
    nativeApplicationVersion: '1.1.4',
    nativeBuildVersion: '1',
}));

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

jest.mock('expo-file-system', () =>
    jest.requireActual('../../../tests/helpers/memoryFileSystem').memoryFileSystemModule());

jest.mock('expo-sharing', () => ({
    shareAsync: jest.fn().mockResolvedValue(undefined),
    isAvailableAsync: jest.fn().mockResolvedValue(true),
}));

jest.mock('../../core/events', () => ({
    dataEvents: { emit: jest.fn(), emitMultiple: jest.fn(), subscribe: () => () => undefined },
}));

const PICKER_COPY = 'file:///cache/DocumentPicker/3e8b1f60-9d2c-4a75-b0e4-7c5a2d9f1e83.json';

/** Mid-month, so the local day is the 15th in every zone the suite runs in. */
const NOW = Date.UTC(2026, 10, 15, 12, 0, 0);

const shareAsync = Sharing.shareAsync as jest.Mock;
const getDocumentAsync = DocumentPicker.getDocumentAsync as jest.Mock;

/** A connection with the current schema and nothing in it. */
async function openEmptyDatabase(): Promise<void> {
    const db = new BetterSqliteDatabase();
    __setDatabaseForTests(db);
    container.reset();
    for (const statement of SCHEMA_STATEMENTS) {
        await db.execute(statement);
    }
    await asyncStorageAdapter.set(StorageKeys.SCHEMA_VERSION, 6);
    await runMigrations();
}

/** Back up the way the app does, and return the file it shared. */
async function backUp(): Promise<string> {
    await createAndShareBackup();
    const uri = shareAsync.mock.calls[shareAsync.mock.calls.length - 1][0] as string;
    const content = memoryContents.get(uri);
    expect(content).toBeDefined();
    return content as string;
}

/** Pick `content` as the user would, and restore it. */
async function restore(content: string) {
    new MemoryFile(PICKER_COPY).write(content);
    getDocumentAsync.mockResolvedValue({
        canceled: false,
        assets: [{
            uri: PICKER_COPY,
            name: 'valto-backup.json',
            size: content.length,
            mimeType: 'application/json',
        }],
    });
    return pickAndRestoreBackup();
}

beforeEach(async () => {
    jest.clearAllMocks();
    memoryFiles.clear();
    memoryContents.clear();
    jest.spyOn(console, 'log').mockImplementation(() => undefined);
    jest.spyOn(console, 'info').mockImplementation(() => undefined);
    await AsyncStorage.clear();
    pinClock(NOW);
    await openEmptyDatabase();
});

afterEach(() => {
    jest.restoreAllMocks();
    restoreZoneClock();
    __setDatabaseForTests(null);
});

const byId = <T extends { id: string }>(rows: T[]): T[] =>
    [...rows].sort((a, b) => a.id.localeCompare(b.id));

/** Every table the file carries, serialized as the file would carry it. */
async function ledger() {
    return {
        wallets: byId((await container.walletRepository.getAll()).map(serializeWallet)),
        transactions: byId((await container.transactionRepository.getAll()).map(serializeTransaction)),
        categories: byId(await container.categoryRepository.getAll()),
        budgets: byId((await container.budgetRepository.getAll()).map(serializeBudget)),
        rules: byId((await container.recurringTransactionRepository.getAll()).map(serializeRecurringTransaction)),
    };
}

describe('V-128 a null budget limit in a backup', () => {
    it('V-128 88b. a v2 file with one null-limit budget restores, that budget at MAX_ENTRY_AMOUNT_MINOR, every other row as it was', async () => {
        const deps = getUseCaseDeps();
        const cash = await createWallet(deps, { name: 'Cash', balance: 100000, type: WalletType.CASH });
        const bank = await createWallet(deps, { name: 'Bank', balance: 50000, type: WalletType.BANK });
        const food = await deps.runInTransaction(() =>
            container.categoryRepository.create({ name: 'Food', type: CategoryType.EXPENSE }));
        const rent = await deps.runInTransaction(() =>
            container.categoryRepository.create({ name: 'Rent', type: CategoryType.EXPENSE }));
        const salary = await deps.runInTransaction(() =>
            container.categoryRepository.create({ name: 'Salary', type: CategoryType.INCOME }));
        await createTransaction(deps, {
            type: TransactionType.EXPENSE, amount: 1200, categoryId: food.id, walletId: cash.id,
            date: new Date(2026, 10, 2, 9, 0),
        });
        await createTransaction(deps, {
            type: TransactionType.INCOME, amount: 70000, categoryId: salary.id, walletId: bank.id,
            date: new Date(2026, 10, 5, 9, 0), note: 'Salary',
        });
        await transferFunds(deps, { fromWalletId: cash.id, toWalletId: bank.id, amount: 25000 });
        await deps.runInTransaction(() =>
            container.budgetRepository.create({ categoryId: food.id, month: getCurrentMonth(), limitAmount: 50000 }));
        const rentBudget = await deps.runInTransaction(() =>
            container.budgetRepository.create({ categoryId: rent.id, month: getCurrentMonth(), limitAmount: 80000 }));
        // Starts in the future, so the post-restore catch-up generates nothing.
        await deps.runInTransaction(() => container.recurringTransactionRepository.create({
            type: TransactionType.EXPENSE, amount: 4500, walletId: bank.id, categoryId: rent.id,
            description: 'Gym', startDate: new Date(2030, 0, 15), frequency: RecurrenceFrequency.MONTHLY,
            interval: 1,
        }));
        const before = await ledger();

        // The Rent limit as 1.1.3 wrote an Infinity one: JSON.stringify turns it into null.
        const snapshot = JSON.parse(await backUp()) as BackupSnapshot;
        expect(snapshot.version).toBe(2);
        const index = snapshot.data.budgets.findIndex((b) => b.id === rentBudget.id);
        snapshot.data.budgets[index] = JSON.parse(
            JSON.stringify({ ...snapshot.data.budgets[index], limitAmount: Infinity }),
        );
        const file = JSON.stringify(snapshot);
        // Precondition on the forcing: the file holds a null limit for Rent, and only for Rent.
        expect((JSON.parse(file) as BackupSnapshot).data.budgets.map((b) => [b.id, b.limitAmount]))
            .toEqual(byId(before.budgets).map((b) => [b.id, b.id === rentBudget.id ? null : b.limitAmount]));

        // Restored onto an install that holds none of it.
        await openEmptyDatabase();
        const outcome = await restore(file);

        expect(outcome).not.toBeNull();
        expect(outcome?.failedSteps).toEqual([]);
        expect(outcome?.rulesNotProcessed).toBe(0);
        expect(outcome?.catchUpGenerated).toBe(0);

        const after = await ledger();
        expect(after.budgets).toEqual(before.budgets.map((b) =>
            b.id === rentBudget.id ? { ...b, limitAmount: MAX_ENTRY_AMOUNT_MINOR } : b));
        expect(after.wallets).toEqual(before.wallets);
        expect(after.transactions).toEqual(before.transactions);
        expect(after.categories).toEqual(before.categories);
        expect(after.rules).toEqual(before.rules);
        const audit = await container.walletRepository.auditBalances();
        expect(byId(audit.map((a) => ({ id: a.walletId, drift: a.drift }))))
            .toEqual(byId([{ id: cash.id, drift: 0 }, { id: bank.id, drift: 0 }]));
    });
});
