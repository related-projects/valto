/**
 * V-128 control: a backup holding amounts above the cap still restores
 *
 * The cap on entered amounts (999 999 999 999 minor units) applies to entry
 * only. A file written before it - by a build that let a larger amount in -
 * restores as it is (REGISTRE V-128, Owner decision 1; policies 14 and 10;
 * V-127 decision 2). This is a control, not a regression test: the restore
 * took these values before the fix and must go on taking them after it.
 *
 * Every row is written by the production writers and backed up by
 * createAndShareBackup; the one hand-made step raises four amounts in that
 * file past the cap, the way an older build could have written them. All four
 * stay below Number.MAX_SAFE_INTEGER, so each is held exactly and the
 * comparison is exact.
 *
 * Real here: backupService, the use cases, the repositories, the recurring
 * engine and the migrations, over BetterSqliteDatabase. The file system is
 * tests/helpers/memoryFileSystem.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import * as DocumentPicker from 'expo-document-picker';
import * as Sharing from 'expo-sharing';
import { CAP_MINOR } from '../../../tests/helpers/amountCapCases';
import { BetterSqliteDatabase } from '../../../tests/helpers/BetterSqliteDatabase';
import { MemoryFile, memoryContents, memoryFiles } from '../../../tests/helpers/memoryFileSystem';
import { pinClock, restoreZoneClock } from '../../../tests/helpers/zoneClock';
import { container, getUseCaseDeps } from '../../core/di/container';
import { getCurrentMonth } from '../../domain/entities/Budget';
import { CategoryType } from '../../domain/entities/Category';
import { RecurrenceFrequency } from '../../domain/entities/RecurringTransaction';
import { TransactionType } from '../../domain/entities/Transaction';
import { WalletType } from '../../domain/entities/Wallet';
import { createTransaction } from '../../domain/useCases/createTransaction';
import { createWallet } from '../../domain/useCases/createWallet';
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

const PICKER_COPY = 'file:///cache/DocumentPicker/6c2f0d4e-1b7a-4e95-8f3c-9a0d2e5b7c14.json';

/** Mid-month, so the local day is the 15th in every zone the suite runs in. */
const NOW = Date.UTC(2026, 10, 15, 12, 0, 0);

/** Past the cap, below Number.MAX_SAFE_INTEGER. */
const OVER = CAP_MINOR + 1;
const FAR_OVER = 123_456_789_123_456;

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

describe('V-128 control: restore keeps accepting amounts above the cap', () => {
    it('control: a v2 file with a transaction, a wallet balance, a budget limit and a rule amount above the cap restores them exactly', async () => {
        const deps = getUseCaseDeps();
        const cash = await createWallet(deps, { name: 'Cash', balance: 100000, type: WalletType.CASH });
        const food = await deps.runInTransaction(() =>
            container.categoryRepository.create({ name: 'Food', type: CategoryType.EXPENSE }));
        const tx = await createTransaction(deps, {
            type: TransactionType.EXPENSE, amount: 1200, categoryId: food.id, walletId: cash.id,
            date: new Date(2026, 10, 2, 9, 0),
        });
        const budget = await deps.runInTransaction(() =>
            container.budgetRepository.create({ categoryId: food.id, month: getCurrentMonth(), limitAmount: 50000 }));
        // Starts in the future, so the post-restore catch-up generates nothing.
        const rule = await deps.runInTransaction(() => container.recurringTransactionRepository.create({
            type: TransactionType.EXPENSE, amount: 4500, walletId: cash.id, categoryId: food.id,
            startDate: new Date(2030, 0, 15), frequency: RecurrenceFrequency.MONTHLY, interval: 1,
        }));

        const snapshot = JSON.parse(await backUp()) as BackupSnapshot;
        expect(snapshot.version).toBe(2);
        snapshot.data.wallets[0].balance = FAR_OVER;
        snapshot.data.transactions[0].amount = OVER;
        snapshot.data.budgets[0].limitAmount = OVER;
        snapshot.data.recurringRules![0].amount = FAR_OVER;

        await openEmptyDatabase();
        const outcome = await restore(JSON.stringify(snapshot));

        expect(outcome).not.toBeNull();
        expect(outcome?.failedSteps).toEqual([]);
        expect(outcome?.rulesNotProcessed).toBe(0);
        expect(outcome?.catchUpGenerated).toBe(0);
        expect((await container.walletRepository.getById(cash.id))?.balance).toBe(FAR_OVER);
        expect((await container.transactionRepository.getById(tx.id))?.amount).toBe(OVER);
        expect((await container.budgetRepository.getById(budget.id))?.limitAmount).toBe(OVER);
        expect((await container.recurringTransactionRepository.getById(rule.id))?.amount).toBe(FAR_OVER);
        const audit = await container.walletRepository.auditBalances();
        expect(audit.map((a) => [a.walletId, a.drift])).toEqual([[cash.id, 0]]);
    });
});
