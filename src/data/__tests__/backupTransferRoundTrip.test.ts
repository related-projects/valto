/**
 * Backup Round-Trip: the file the app writes is the file the app restores
 *
 * Every fixture in the suite that put a transfer through backup and restore
 * invented `transfer-out` / `transfer-in` as real Category rows. Production
 * never creates them: `transferFunds` writes those two ids straight onto the
 * ledger as pseudo-categories, and every Category the app makes carries a uuid.
 * So the categories array in a real snapshot cannot resolve a transfer leg, and
 * `validateSnapshot`'s referential check refused the file - a user who had ever
 * moved money between two wallets could not restore their own backup.
 *
 * Nothing here is hand-built. The ledger is written through the production
 * writers, the file is produced by `createAndShareBackup` (the only caller of
 * the snapshot builder) and read back through `JSON.parse`, which is the exact
 * round trip a real backup makes on disk. A fixture that spells its own
 * categories array cannot see this class of defect, which is why there is no
 * fixture here.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { createTestDb } from '../../../tests/helpers/createTestDb';
import { container } from '../../core/di/container';
import { CategoryType } from '../../domain/entities/Category';
import { RecurrenceFrequency } from '../../domain/entities/RecurringTransaction';
import { TransactionType } from '../../domain/entities/Transaction';
import { WalletType } from '../../domain/entities/Wallet';
import { createTransaction } from '../../domain/useCases/createTransaction';
import { createWallet } from '../../domain/useCases/createWallet';
import { transferFunds } from '../../domain/useCases/transferFunds';
import { BudgetRepository } from '../repositories/BudgetRepository';
import { CategoryRepository } from '../repositories/CategoryRepository';
import { RecurringTransactionRepository } from '../repositories/RecurringTransactionRepository';
import { WalletRepository } from '../repositories/WalletRepository';
import {
    createAndShareBackup,
    restoreFromSnapshot,
    validateSnapshot,
    type BackupSnapshot,
} from '../services/backupService';
import { __setDatabaseForTests } from '../storage/sql/database';
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

// Silence the reactive event bus.
jest.mock('../../core/events', () => ({
    dataEvents: { emit: jest.fn(), emitMultiple: jest.fn() },
}));

let db: SqlDatabase;

/** The deps every use case below takes, over the live test connection. */
function deps() {
    return {
        walletRepo: container.walletRepository,
        transactionRepo: container.transactionRepository,
        eventBus: { emit: jest.fn(), emitMultiple: jest.fn() },
        runInTransaction: <T>(work: () => Promise<T>) => db.runInTransaction(work),
    };
}

/**
 * Write the file the way the app writes it, then read it the way the app reads
 * it. `createAndShareBackup` is the only caller of the snapshot builder, and it
 * is what serializes the snapshot to JSON - so this is the real disk round trip
 * and not a structuredClone of an in-memory object.
 */
async function backupAndReadBack(): Promise<BackupSnapshot> {
    await createAndShareBackup();
    expect(mockWrittenBackups).toHaveLength(1);
    return JSON.parse(mockWrittenBackups[0]) as BackupSnapshot;
}

beforeEach(async () => {
    jest.clearAllMocks();
    mockWrittenBackups.length = 0;
    await AsyncStorage.clear();
    db = await createTestDb();
    __setDatabaseForTests(db);
    // The backup producer, the restore and the post-restore catch-up all reach
    // their repositories through the DI container, which caches one over
    // whichever connection was live when it was first asked. Without this they
    // would read the previous test's database.
    container.reset();
});

describe('a backup carrying a transfer', () => {
    /**
     * Two wallets, one category, one transfer - all through the production
     * writers, so the categories array in the file is whatever the app would
     * really have put there.
     */
    async function seedTransferLedger() {
        const source = await createWallet(deps(), {
            name: 'Cash',
            balance: 100000,
            type: WalletType.CASH,
        });
        const destination = await createWallet(deps(), {
            name: 'Bank',
            balance: 50000,
            type: WalletType.BANK,
        });

        await new CategoryRepository(db).create({ name: 'Food', type: CategoryType.EXPENSE });

        await transferFunds(deps(), {
            fromWalletId: source.id,
            toWalletId: destination.id,
            amount: 25000,
        });

        return { source, destination };
    }

    it('is accepted by validateSnapshot, whose categories cannot resolve a transfer leg', async () => {
        await seedTransferLedger();

        const file = await backupAndReadBack();

        // The premise of the whole test: the file really does carry two legs
        // whose category ids match no row in its own categories array.
        const legs = file.data.transactions.filter((t) => t.type === TransactionType.TRANSFER);
        expect(legs).toHaveLength(2);
        const categoryIds = new Set(file.data.categories.map((c) => c.id));
        for (const leg of legs) {
            expect(categoryIds.has(leg.categoryId)).toBe(false);
        }

        const result = validateSnapshot(file);

        expect(result.errors).toEqual([]);
        expect(result.valid).toBe(true);
    });

    it('restores, and both wallets audit clean afterwards', async () => {
        const { source, destination } = await seedTransferLedger();

        const file = await backupAndReadBack();

        await expect(restoreFromSnapshot(file)).resolves.toBeDefined();

        const wallets = new WalletRepository(db);
        expect((await wallets.getById(source.id))!.balance).toBe(75000);
        expect((await wallets.getById(destination.id))!.balance).toBe(75000);

        // The stored balance alone would also pass if the legs had been dropped
        // on the way in; the audit is what proves they came back.
        for (const audit of await wallets.auditBalances()) {
            expect(audit.drift).toBe(0);
        }
    });

    /**
     * The reserved ids are admitted BECAUSE the transaction is a transfer, not
     * because of how they are spelled. A snapshot that puts one on an expense
     * is a snapshot the app could not have written, and it stays refused.
     */
    it('still refuses a reserved id on a transaction that is not a transfer', async () => {
        await seedTransferLedger();

        const file = await backupAndReadBack();
        const leg = file.data.transactions.find((t) => t.type === TransactionType.TRANSFER)!;
        leg.type = TransactionType.EXPENSE;

        const result = validateSnapshot(file);

        expect(result.valid).toBe(false);
        expect(result.errors.join('\n')).toContain('references non-existent category');
    });

    /** An id that designates nothing is still an unresolvable reference. */
    it('still refuses an unknown category id on a transfer', async () => {
        await seedTransferLedger();

        const file = await backupAndReadBack();
        const leg = file.data.transactions.find((t) => t.type === TransactionType.TRANSFER)!;
        leg.categoryId = 'not-a-category';

        const result = validateSnapshot(file);

        expect(result.valid).toBe(false);
        expect(result.errors.join('\n')).toContain('references non-existent category');
    });
});

describe('every file the app writes, the app restores', () => {
    it('round-trips a ledger built through every production writer', async () => {
        // -- Wallets and categories, through the paths the UI uses ----------
        const cash = await createWallet(deps(), {
            name: 'Cash',
            balance: 100000,
            type: WalletType.CASH,
        });
        const bank = await createWallet(deps(), {
            name: 'Bank',
            balance: 50000,
            type: WalletType.BANK,
        });

        const categories = new CategoryRepository(db);
        const food = await categories.create({ name: 'Food', type: CategoryType.EXPENSE });
        const salary = await categories.create({ name: 'Salary', type: CategoryType.INCOME });

        // -- One of every transaction shape the app can record --------------
        await createTransaction(deps(), {
            type: TransactionType.EXPENSE,
            amount: 15000,
            categoryId: food.id,
            walletId: cash.id,
            date: new Date('2026-03-01T00:00:00.000Z'),
        });
        await createTransaction(deps(), {
            type: TransactionType.INCOME,
            amount: 5000,
            categoryId: salary.id,
            walletId: cash.id,
            date: new Date('2026-03-02T00:00:00.000Z'),
        });
        await transferFunds(deps(), {
            fromWalletId: cash.id,
            toWalletId: bank.id,
            amount: 25000,
        });

        // -- A budget and a standing order ----------------------------------
        await new BudgetRepository(db).create({
            categoryId: food.id,
            month: '2026-03',
            limitAmount: 60000,
        });
        // Starts in 2030 so the post-restore catch-up has nothing due: this
        // test is about the format, not about the recurring engine.
        await new RecurringTransactionRepository(db).create({
            type: TransactionType.EXPENSE,
            amount: 4500,
            walletId: cash.id,
            categoryId: food.id,
            description: 'Gym membership',
            startDate: new Date('2030-01-15T00:00:00.000Z'),
            frequency: RecurrenceFrequency.MONTHLY,
            interval: 1,
        });

        const wallets = new WalletRepository(db);
        const before = await wallets.auditBalances();

        // -- Write it, read it back, restore it -----------------------------
        const file = await backupAndReadBack();

        expect(validateSnapshot(file).errors).toEqual([]);
        await expect(restoreFromSnapshot(file)).resolves.toBeDefined();

        // -- Every wallet still agrees with its own ledger ------------------
        const after = await wallets.auditBalances();
        expect(after).toHaveLength(before.length);
        for (const audit of after) {
            expect(audit.drift).toBe(0);
        }
        expect(after.map((a) => a.stored).sort((x, y) => x - y)).toEqual(
            before.map((a) => a.stored).sort((x, y) => x - y),
        );
    });
});
