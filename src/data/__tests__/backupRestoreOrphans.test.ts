/**
 * V-127: a backup holding rows whose wallet or category is gone restores
 *
 * The app can reach two states in which a row points at something the file
 * does not carry, and both end up in a backup:
 *  - deleteWallet keeps the transactions of the wallet it deletes ("Delete
 *    Anyway", deleteWallet.ts). The next backup exports them, wallet absent.
 *  - a v1 file carries no rules, so restoring one replaces the wallets and
 *    categories and leaves the live rules as they were. A rule can then point
 *    at a wallet or a category the restore did not put back, and the next
 *    backup exports it that way.
 * validateSnapshot refused both files, so the app could not restore a backup
 * it had written itself.
 *
 * Every state here is reached through the production writers, every file is
 * written by createAndShareBackup and read back by pickAndRestoreBackup. The
 * one hand-made step is turning the app's own file into a v1 file, which is
 * the same format without the rules (snapshotTables).
 *
 * The controls at the end are not regression tests: a reference that is
 * missing or not a string was refused before the fix and still is.
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
import { CategoryType } from '../../domain/entities/Category';
import { RecurrenceFrequency, serializeRecurringTransaction } from '../../domain/entities/RecurringTransaction';
import { TransactionType, serializeTransaction } from '../../domain/entities/Transaction';
import { WalletType, serializeWallet } from '../../domain/entities/Wallet';
import { createTransaction } from '../../domain/useCases/createTransaction';
import { createWallet } from '../../domain/useCases/createWallet';
import { deleteWallet } from '../../domain/useCases/deleteWallet';
import { transferFunds } from '../../domain/useCases/transferFunds';
import { runMigrations } from '../migrations';
import { processRecurringRules } from '../services/RecurringTransactionEngine';
import {
    createAndShareBackup,
    pickAndRestoreBackup,
    SnapshotRejectedError,
    type BackupSnapshot,
} from '../services/backupService';
import { asyncStorageAdapter, StorageKeys } from '../storage';
import { __setDatabaseForTests, getDb } from '../storage/sql/database';
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

const PICKER_COPY = 'file:///cache/DocumentPicker/0b6f4a52-7c1e-4d0a-9e3b-2f8d6c1a5e47.json';

/** Mid-month, so the local day is the 15th in every zone the suite runs in. */
const NOW = Date.UTC(2026, 9, 15, 12, 0, 0);

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

/** The app's own file as a build before v2 wrote it: the same, without the rules. */
function asV1File(content: string): string {
    const snapshot = JSON.parse(content) as BackupSnapshot;
    const { recurringRules: _rules, ...rest } = snapshot.data;
    return JSON.stringify({ ...snapshot, version: 1, data: rest });
}

const byId = <T extends { id: string }>(rows: T[]): T[] =>
    [...rows].sort((a, b) => a.id.localeCompare(b.id));

/** Every table the file carries, serialized as the file would carry it. */
async function ledger() {
    return {
        wallets: byId((await container.walletRepository.getAll()).map(serializeWallet)),
        transactions: byId((await container.transactionRepository.getAll()).map(serializeTransaction)),
        categories: byId(await container.categoryRepository.getAll()),
        rules: byId((await container.recurringTransactionRepository.getAll()).map(serializeRecurringTransaction)),
    };
}

async function missingReferenceIds(): Promise<string[]> {
    return (await container.recurringTransactionRepository.findWithMissingReferences()).map((r) => r.id);
}

beforeEach(async () => {
    jest.clearAllMocks();
    memoryFiles.clear();
    memoryContents.clear();
    // The migrations, pickAndRestoreBackup and the engine log what they did;
    // keep the run quiet.
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

describe('V-127 a. transactions whose wallet was deleted with "Delete Anyway"', () => {
    it('V-127 a. restore the file the app wrote, rows as they were, other balances unchanged', async () => {
        const deps = getUseCaseDeps();
        const cash = await createWallet(deps, { name: 'Cash', balance: 100000, type: WalletType.CASH });
        const bank = await createWallet(deps, { name: 'Bank', balance: 50000, type: WalletType.BANK });
        const food = await deps.runInTransaction(() =>
            container.categoryRepository.create({ name: 'Food', type: CategoryType.EXPENSE }));
        const salary = await deps.runInTransaction(() =>
            container.categoryRepository.create({ name: 'Salary', type: CategoryType.INCOME }));

        await createTransaction(deps, {
            type: TransactionType.EXPENSE, amount: 1200, categoryId: food.id, walletId: cash.id,
            date: new Date(2026, 9, 2, 9, 0),
        });
        await createTransaction(deps, {
            type: TransactionType.EXPENSE, amount: 3400, categoryId: food.id, walletId: bank.id,
            date: new Date(2026, 9, 3, 9, 0), note: 'Groceries',
        });
        await createTransaction(deps, {
            type: TransactionType.INCOME, amount: 70000, categoryId: salary.id, walletId: bank.id,
            date: new Date(2026, 9, 5, 9, 0),
        });
        await transferFunds(deps, { fromWalletId: cash.id, toWalletId: bank.id, amount: 25000 });

        // A standing order on Bank leaves an occurrence carrying the recurring
        // fields; the rule is then deleted, which deleteWallet requires.
        const rule = await deps.runInTransaction(() => container.recurringTransactionRepository.create({
            type: TransactionType.EXPENSE, amount: 999, walletId: bank.id, categoryId: food.id,
            description: 'Phone', startDate: new Date(2026, 9, 1), frequency: RecurrenceFrequency.MONTHLY,
            interval: 1,
        }));
        const run = await processRecurringRules({
            recurringRepo: container.recurringTransactionRepository,
            transactionRepo: container.transactionRepository,
            walletRepo: container.walletRepository,
            categoryRepo: container.categoryRepository,
            eventBus: deps.eventBus,
            runInTransaction: (work) => getDb().runInTransaction(work),
        });
        expect(run.transactionsGenerated).toBe(1);
        await deps.runInTransaction(() => container.recurringTransactionRepository.delete(rule.id));

        await deleteWallet(deps, bank.id);

        // Precondition, whatever validateSnapshot does: Bank is gone and its
        // four rows are still in the ledger, the occurrence among them.
        const before = await ledger();
        expect(before.wallets.map((w) => w.id)).toEqual([cash.id]);
        const orphans = before.transactions.filter((t) => t.walletId === bank.id);
        expect(orphans).toHaveLength(4);
        expect(orphans.filter((t) => t.recurringRuleId === rule.id && t.recurringOccurrenceIndex === 0)).toHaveLength(1);
        expect(orphans.filter((t) => t.note === 'Groceries')).toHaveLength(1);
        expect(orphans.filter((t) => t.type === TransactionType.TRANSFER)).toHaveLength(1);

        const file = await backUp();
        expect((JSON.parse(file) as BackupSnapshot).data.transactions.filter((t) => t.walletId === bank.id)).toHaveLength(4);

        // Restored onto an install that holds none of it.
        await openEmptyDatabase();
        const outcome = await restore(file);

        expect(outcome).not.toBeNull();
        expect(outcome?.failedSteps).toEqual([]);
        const after = await ledger();
        expect(after.transactions).toEqual(before.transactions);
        expect(after.wallets).toEqual(before.wallets);
        expect(after.categories).toEqual(before.categories);
        const audit = await container.walletRepository.auditBalances();
        expect(audit.map((a) => [a.walletId, a.drift])).toEqual([[cash.id, 0]]);
    });
});

describe('V-127 b. a rule a v1 restore left pointing at nothing', () => {
    it('V-127 b1. a rule whose wallet is gone is restored as it was', async () => {
        const deps = getUseCaseDeps();
        const cash = await createWallet(deps, { name: 'Cash', balance: 100000, type: WalletType.CASH });
        const food = await deps.runInTransaction(() =>
            container.categoryRepository.create({ name: 'Food', type: CategoryType.EXPENSE }));
        await createTransaction(deps, {
            type: TransactionType.EXPENSE, amount: 1200, categoryId: food.id, walletId: cash.id,
            date: new Date(2026, 9, 2, 9, 0),
        });
        // A backup from before Bank existed, in the format before rules joined it.
        const olderFile = asV1File(await backUp());

        const bank = await createWallet(deps, { name: 'Bank', balance: 50000, type: WalletType.BANK });
        const rule = await deps.runInTransaction(() => container.recurringTransactionRepository.create({
            type: TransactionType.EXPENSE, amount: 4500, walletId: bank.id, categoryId: food.id,
            description: 'Gym', startDate: new Date(2030, 0, 15), frequency: RecurrenceFrequency.MONTHLY,
            interval: 1,
        }));

        // Precondition, whatever validateSnapshot does: the v1 restore puts
        // Cash back and leaves the rule on a wallet that no longer exists.
        const v1Outcome = await restore(olderFile);
        expect(v1Outcome?.rulesNotProcessed).toBe(1);
        expect(await missingReferenceIds()).toEqual([rule.id]);
        const before = await ledger();
        expect(before.wallets.map((w) => w.id)).toEqual([cash.id]);
        expect(before.rules.map((r) => r.walletId)).toEqual([bank.id]);

        const file = await backUp();
        await openEmptyDatabase();
        const outcome = await restore(file);

        expect(outcome).not.toBeNull();
        expect(outcome?.rulesNotProcessed).toBe(1);
        expect(outcome?.catchUpGenerated).toBe(0);
        expect(await ledger()).toEqual(before);
        expect(await missingReferenceIds()).toEqual([rule.id]);
    });

    it('V-127 b2. a rule whose category is gone is restored as it was', async () => {
        const deps = getUseCaseDeps();
        const cash = await createWallet(deps, { name: 'Cash', balance: 100000, type: WalletType.CASH });
        const rent = await deps.runInTransaction(() =>
            container.categoryRepository.create({ name: 'Rent', type: CategoryType.EXPENSE }));
        await createTransaction(deps, {
            type: TransactionType.EXPENSE, amount: 30000, categoryId: rent.id, walletId: cash.id,
            date: new Date(2026, 9, 1, 9, 0),
        });
        // A backup from before Food existed, in the format before rules joined it.
        const olderFile = asV1File(await backUp());

        const food = await deps.runInTransaction(() =>
            container.categoryRepository.create({ name: 'Food', type: CategoryType.EXPENSE }));
        const rule = await deps.runInTransaction(() => container.recurringTransactionRepository.create({
            type: TransactionType.EXPENSE, amount: 4500, walletId: cash.id, categoryId: food.id,
            startDate: new Date(2030, 0, 15), frequency: RecurrenceFrequency.WEEKLY, interval: 2,
        }));

        // Precondition, whatever validateSnapshot does: the v1 restore puts
        // Rent back and leaves the rule on a category that no longer exists.
        const v1Outcome = await restore(olderFile);
        expect(v1Outcome?.rulesNotProcessed).toBe(1);
        expect(await missingReferenceIds()).toEqual([rule.id]);
        const before = await ledger();
        expect(before.categories.map((c) => c.id)).toEqual([rent.id]);
        expect(before.rules.map((r) => r.categoryId)).toEqual([food.id]);

        const file = await backUp();
        await openEmptyDatabase();
        const outcome = await restore(file);

        expect(outcome).not.toBeNull();
        expect(outcome?.rulesNotProcessed).toBe(1);
        expect(outcome?.catchUpGenerated).toBe(0);
        expect(await ledger()).toEqual(before);
        expect(await missingReferenceIds()).toEqual([rule.id]);
    });
});

describe('V-127 c. control: a reference that is missing or not a string is still refused', () => {
    type Patch = (row: Record<string, unknown>) => void;

    const drop = (field: string): Patch => (row) => {
        delete row[field];
    };
    const set = (field: string, value: unknown): Patch => (row) => {
        row[field] = value;
    };

    /** A ledger with one transaction and one rule, backed up the way the app does. */
    async function backedUpLedger(): Promise<string> {
        const deps = getUseCaseDeps();
        const cash = await createWallet(deps, { name: 'Cash', balance: 100000, type: WalletType.CASH });
        const food = await deps.runInTransaction(() =>
            container.categoryRepository.create({ name: 'Food', type: CategoryType.EXPENSE }));
        await createTransaction(deps, {
            type: TransactionType.EXPENSE, amount: 1200, categoryId: food.id, walletId: cash.id,
            date: new Date(2026, 9, 2, 9, 0),
        });
        await deps.runInTransaction(() => container.recurringTransactionRepository.create({
            type: TransactionType.EXPENSE, amount: 4500, walletId: cash.id, categoryId: food.id,
            startDate: new Date(2030, 0, 15), frequency: RecurrenceFrequency.MONTHLY, interval: 1,
        }));
        return backUp();
    }

    async function expectRefused(table: 'transactions' | 'recurringRules', patch: Patch) {
        const file = await backedUpLedger();
        const before = await ledger();
        const snapshot = JSON.parse(file) as { data: Record<string, Record<string, unknown>[]> };
        patch(snapshot.data[table][0]);

        await expect(restore(JSON.stringify(snapshot))).rejects.toThrow(SnapshotRejectedError);

        expect(await ledger()).toEqual(before);
    }

    it.each([
        ['missing', drop('walletId')],
        ['null', set('walletId', null)],
        ['a number', set('walletId', 42)],
        ['empty', set('walletId', '')],
        ['blank', set('walletId', '   ')],
    ])('V-127 c. a transaction whose wallet id is %s', async (_label, patch) => {
        await expectRefused('transactions', patch);
    });

    it.each([
        ['wallet id missing', drop('walletId')],
        ['wallet id a number', set('walletId', 42)],
        ['wallet id empty', set('walletId', '')],
        ['category id missing', drop('categoryId')],
        ['category id a number', set('categoryId', 42)],
        ['category id empty', set('categoryId', '')],
    ])('V-127 c. a rule whose %s', async (_label, patch) => {
        await expectRefused('recurringRules', patch);
    });
});
