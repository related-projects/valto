/**
 * V-103: the end day a user chose travels in the backup file, and a file
 * written before it existed still restores, each rule with an end getting the
 * local day of its end date in the zone the restore runs in (Owner decision
 * D11, pass 75; the format gains an optional field without a version bump, as
 * for V-98 and V-114).
 *
 * Nothing is hand-built (register V-41). The file is produced by
 * createAndShareBackup, the only writer of a backup file, and read back by
 * pickAndRestoreBackup, the only reader; the rule comes from
 * RecurringTransactionRepository.create and the recurring engine.
 *
 * Zones (register policy no. 9): fixtures use the LOCAL Date constructor and
 * the clock is pinned with pinClock, so the suite holds in whatever zone the
 * process runs in. CI runs it under TZ=UTC, Africa/Lagos and America/New_York.
 * A restore on a device 6 h west of the writer is simulated in the file: every
 * instant on the rule and its rows is moved 6 h earlier, which is how those
 * instants read from there. Not proved by this: a real zone switch, or
 * anything on a device.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import * as DocumentPicker from 'expo-document-picker';
import { BetterSqliteDatabase } from '../../../tests/helpers/BetterSqliteDatabase';
import { pinClock, restoreZoneClock } from '../../../tests/helpers/zoneClock';
import { container } from '../../core/di/container';
import { CategoryType } from '../../domain/entities/Category';
import { RecurrenceFrequency } from '../../domain/entities/RecurringTransaction';
import { TransactionType } from '../../domain/entities/Transaction';
import { WalletType } from '../../domain/entities/Wallet';
import { createWallet } from '../../domain/useCases/createWallet';
import { runMigrations } from '../migrations';
import { CategoryRepository } from '../repositories/CategoryRepository';
import { processRecurringRules } from '../services/RecurringTransactionEngine';
import { type BackupSnapshot, createAndShareBackup, pickAndRestoreBackup } from '../services/backupService';
import { asyncStorageAdapter, StorageKeys } from '../storage';
import { __setDatabaseForTests } from '../storage/sql/database';
import { SCHEMA_STATEMENTS } from '../storage/sql/schema';

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
/** What the file the user picks for a restore contains. */
let mockPickedContent = '';

jest.mock('expo-file-system', () => ({
    File: jest.fn().mockImplementation(() => ({
        uri: 'file:///mock/cache/backup.json',
        write: (content: string) => {
            mockWrittenBackups.push(content);
        },
        exists: true,
        get size() {
            return mockPickedContent.length;
        },
        text: async () => mockPickedContent,
    })),
    Paths: { cache: '/mock/cache' },
}));

jest.mock('expo-sharing', () => ({
    shareAsync: jest.fn().mockResolvedValue(undefined),
    isAvailableAsync: jest.fn().mockResolvedValue(true),
}));

jest.mock('../../core/events', () => ({
    dataEvents: { emit: jest.fn(), emitMultiple: jest.fn(), subscribe: () => () => undefined },
}));

const SIX_HOURS_MS = 6 * 60 * 60 * 1000;
const NOTE = 'Rent';

let db: BetterSqliteDatabase;

function writerDeps() {
    return {
        walletRepo: container.walletRepository,
        transactionRepo: container.transactionRepository,
        eventBus: { emit: jest.fn(), emitMultiple: jest.fn() },
        runInTransaction: <T>(work: () => Promise<T>) => db.runInTransaction(work),
    };
}

function engineDeps() {
    return {
        recurringRepo: container.recurringTransactionRepository,
        transactionRepo: container.transactionRepository,
        walletRepo: container.walletRepository,
        categoryRepo: container.categoryRepository,
        eventBus: { emit: jest.fn(), emitMultiple: jest.fn() },
        runInTransaction: <T>(work: () => Promise<T>) => db.runInTransaction(work),
    };
}

/**
 * A v6 install migrated to the current schema, then one monthly rule created
 * on 15 Sep 2026 12:00 through the repository and caught up by the engine.
 */
async function seedRule(endDate?: Date): Promise<void> {
    pinClock(new Date(2026, 8, 15, 12, 0).getTime());
    for (const statement of SCHEMA_STATEMENTS) {
        await db.execute(statement);
    }
    await asyncStorageAdapter.set(StorageKeys.SCHEMA_VERSION, 6);
    await runMigrations();

    const bank = await createWallet(writerDeps(), { name: 'Bank', balance: 5000000, type: WalletType.BANK });
    const bills = await db.runInTransaction(() =>
        new CategoryRepository(db).create({ name: 'Bills', type: CategoryType.EXPENSE }),
    );
    await db.runInTransaction(() => container.recurringTransactionRepository.create({
        type: TransactionType.EXPENSE,
        amount: 2500,
        walletId: bank.id,
        categoryId: bills.id,
        description: NOTE,
        startDate: new Date(2026, 8, 15, 12, 0),
        endDate,
        frequency: RecurrenceFrequency.MONTHLY,
        interval: 1,
    }));
    const generated = await processRecurringRules(engineDeps());
    expect(generated.errors).toEqual([]);
}

/** Write the file the way the app writes it; return its parsed body. */
async function writeBackup(): Promise<BackupSnapshot> {
    await createAndShareBackup();
    expect(mockWrittenBackups).toHaveLength(1);
    return JSON.parse(mockWrittenBackups[0]) as BackupSnapshot;
}

/** Hand `file` to the app the way a user picks it, and restore it. */
async function restoreFile(file: BackupSnapshot) {
    mockPickedContent = JSON.stringify(file, null, 2);
    (DocumentPicker.getDocumentAsync as jest.Mock).mockResolvedValue({
        canceled: false,
        assets: [{ uri: 'file:///mock/picked.json', name: 'valto-backup.json', size: 1, mimeType: 'application/json' }],
    });
    const outcome = await pickAndRestoreBackup();
    expect(outcome).not.toBeNull();
    return outcome!;
}

/** Seen from a device 6 h west of the writer: every instant in the file reads 6 h earlier. */
function moveFileWest(file: BackupSnapshot): void {
    const shift = (iso: string) => new Date(new Date(iso).getTime() - SIX_HOURS_MS).toISOString();
    for (const r of file.data.recurringRules) {
        r.startDate = shift(r.startDate);
        r.endDate = r.endDate === undefined ? undefined : shift(r.endDate);
        r.lastGeneratedDate = shift(r.lastGeneratedDate);
    }
    for (const t of file.data.transactions) {
        if (t.note === NOTE) {
            t.date = shift(t.date);
        }
    }
}

/** The end day of the one restored rule, read through the repository. */
async function storedEndDay(): Promise<unknown> {
    const rules = await container.recurringTransactionRepository.getAll();
    expect(rules).toHaveLength(1);
    return (rules[0] as unknown as Record<string, unknown>).endDay;
}

beforeEach(async () => {
    jest.clearAllMocks();
    mockWrittenBackups.length = 0;
    mockPickedContent = '';
    await AsyncStorage.clear();
    db = new BetterSqliteDatabase();
    __setDatabaseForTests(db);
    container.reset();
});

afterEach(() => {
    restoreZoneClock();
    __setDatabaseForTests(null);
});

describe('V-103 backup of the end day (process zone; CI: UTC, Africa/Lagos, America/New_York)', () => {
    it('V-103 A4 a. the file carries the end day chosen, and a restore 6 h west keeps it', async () => {
        // Ends 24 Nov 00:30 writer time; seen from 6 h west, 23 Nov 18:30.
        await seedRule(new Date(2026, 10, 24, 0, 30));
        const file = await writeBackup();
        const fileDay = (file.data.recurringRules[0] as unknown as Record<string, unknown>).endDay;

        moveFileWest(file);
        await restoreFile(file);

        expect({ fileDay, storedDay: await storedEndDay() }).toEqual({
            fileDay: '2026-11-24',
            storedDay: '2026-11-24',
        });
    });

    it('V-103 A4 b. a file without the end day restores, the day derived from the end date in the restoring zone', async () => {
        await seedRule(new Date(2026, 10, 24, 0, 30));

        // What a 1.1.2 install writes: its serializer spreads a rule that has no such field.
        const file = await writeBackup();
        for (const r of file.data.recurringRules as unknown as Record<string, unknown>[]) {
            delete r.endDay;
        }
        expect(JSON.stringify(file)).not.toMatch(/endDay/);

        moveFileWest(file);
        await restoreFile(file);

        // The end reads 23 Nov 18:30 in the restoring zone.
        expect(await storedEndDay()).toBe('2026-11-23');
    });

    it('control: a rule without an end restores with no end day', async () => {
        await seedRule();
        const file = await writeBackup();

        await restoreFile(file);

        expect(await storedEndDay()).toBeUndefined();
    });
});
