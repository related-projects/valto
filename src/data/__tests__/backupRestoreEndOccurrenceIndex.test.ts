/**
 * V-114 / V-103: the number of a rule's last occurrence travels in the backup
 * file, and a file written before it existed still restores, each rule getting
 * the number derived from its end date in the zone the restore runs in - as
 * the occurrence key already is (REGISTRE V-98).
 *
 * Nothing is hand-built (register V-41). The file is produced by
 * createAndShareBackup, the only writer of a backup file, and read back by
 * pickAndRestoreBackup, the only reader; the rules come from
 * RecurringTransactionRepository.create and the recurring engine.
 *
 * Zones (register policy no. 9): fixtures use the LOCAL Date constructor and
 * the clock is pinned with pinClock, so the suite holds in whatever zone the
 * process runs in. CI runs it under TZ=UTC, Africa/Lagos and America/New_York.
 * A restore on a device 7 h east of the writer is simulated in the file: every
 * instant on the rule and its rows is moved 7 h later, which is how those
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

const SEVEN_HOURS_MS = 7 * 60 * 60 * 1000;
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
async function seedRule(endDate: Date): Promise<void> {
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

async function storedEndIndex(): Promise<unknown> {
    const { rows } = await db.execute('SELECT end_occurrence_index FROM recurring_rules');
    expect(rows).toHaveLength(1);
    return rows[0].end_occurrence_index;
}

async function rentCount(): Promise<number> {
    return (await container.transactionRepository.getAll()).filter((t) => t.note === NOTE).length;
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

describe('V-114 / V-103 backup of the last occurrence number (process zone; CI: UTC, Africa/Lagos, America/New_York)', () => {
    it('backup: the file carries the number of the last occurrence and the restore keeps it', async () => {
        // 15 Sep (0), 15 Oct (1); 15 Nov is after the 19 Oct end.
        await seedRule(new Date(2026, 9, 19, 12, 0));

        const file = await writeBackup();
        expect(file.data.recurringRules.map((r) => r.endOccurrenceIndex)).toEqual([1]);

        await restoreFile(file);
        expect(await storedEndIndex()).toBe(1);
    });

    it('backup: a file without the number still restores, the number derived from the end date in the restoring zone', async () => {
        await seedRule(new Date(2026, 9, 19, 12, 0));

        // What a 1.1.2 install writes: its serializer spreads a rule that has no such field.
        const file = await writeBackup();
        for (const r of file.data.recurringRules as unknown as Record<string, unknown>[]) {
            delete r.endOccurrenceIndex;
        }
        expect(JSON.stringify(file)).not.toMatch(/endOccurrenceIndex/);

        await restoreFile(file);

        // By hand, in the process zone: start day 15 Sep, end day 19 Oct -> 15 Oct is number 1.
        expect(await storedEndIndex()).toBe(1);
    });

    it('V-103 restore: a file restored 7 h east of its writer keeps the last occurrence the writer fixed, and the catch-up adds nothing', async () => {
        // Start 15 Sep 12:00, end 14 Oct 23:30 writer time: one occurrence, 15 Sep.
        await seedRule(new Date(2026, 9, 14, 23, 30));
        expect(await rentCount()).toBe(1);
        const file = await writeBackup();

        // Seen from 7 h east, the start reads 15 Sep 19:00 and the end 15 Oct 06:30.
        const shift = (iso: string) => new Date(new Date(iso).getTime() + SEVEN_HOURS_MS).toISOString();
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

        pinClock(new Date(2026, 9, 15, 19, 0).getTime());
        const outcome = await restoreFile(file);

        expect(outcome.catchUpFailed).toBe(false);
        expect(outcome.catchUpGenerated).toBe(0);
        expect(await rentCount()).toBe(1);
    });
});
