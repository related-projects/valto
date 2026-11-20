/**
 * The month start day travels in the settings blob of a backup (REGISTRE C20
 * step 2, pass 98 item 1; policies 10 and 14).
 *
 * The field rides in data.settings, the blob createAndShareBackup already
 * writes and pickAndRestoreBackup already writes back verbatim: no format
 * change, no version bump. A file from before the field restores as before and
 * the install loads start day 1; a malformed value restores too, loaded as 1.
 * "Delete financial data" keeps the setting with the rest of the blob.
 *
 * Each case is read through useBudgets on 25 November 2026: with start day 20
 * its current period is 2026-12 (20 Nov - 19 Dec), with 1 it is 2026-11.
 *
 * Nothing is hand-built (register V-41): the file is written by
 * createAndShareBackup and read back by pickAndRestoreBackup. Fixtures use the
 * local constructor and pinClock, so the file holds under TZ=UTC,
 * Africa/Lagos and America/New_York.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { renderHook, waitFor } from '@testing-library/react-native';
import * as DocumentPicker from 'expo-document-picker';
import { BetterSqliteDatabase } from '../../../tests/helpers/BetterSqliteDatabase';
import { pinClock, restoreZoneClock } from '../../../tests/helpers/zoneClock';
import { container } from '../../core/di/container';
import { CategoryType } from '../../domain/entities/Category';
import { WalletType } from '../../domain/entities/Wallet';
import { createWallet } from '../../domain/useCases/createWallet';
import { useBudgets } from '../../hooks/useBudgets';
import '../../localization/i18n';
import { runMigrations } from '../migrations';
import { CategoryRepository } from '../repositories/CategoryRepository';
import { type BackupSnapshot, createAndShareBackup, pickAndRestoreBackup } from '../services/backupService';
import { resetAppData } from '../services/resetService';
import { loadSettings } from '../services/settingsService';
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
    Directory: jest.fn().mockImplementation(() => ({ exists: false, list: () => [] })),
    Paths: { cache: '/mock/cache' },
}));

jest.mock('expo-sharing', () => ({
    shareAsync: jest.fn().mockResolvedValue(undefined),
    isAvailableAsync: jest.fn().mockResolvedValue(true),
}));

jest.mock('../../core/events', () => ({
    dataEvents: { emit: jest.fn(), emitMultiple: jest.fn(), subscribe: () => () => undefined },
}));

const BLOB = {
    theme: 'system',
    currency: 'USD',
    currencyLocked: true,
    notificationsEnabled: false,
    language: 'en',
    dateFormat: 'YYYY-MM-DD',
    firstDayOfWeek: 'monday',
    decimalSeparator: 'dot',
    onboardingCompleted: true,
    dateFormatLocaleApplied: true,
};

let db: BetterSqliteDatabase;

function writerDeps() {
    return {
        walletRepo: container.walletRepository,
        transactionRepo: container.transactionRepository,
        eventBus: { emit: jest.fn(), emitMultiple: jest.fn() },
        runInTransaction: <T>(work: () => Promise<T>) => db.runInTransaction(work),
    };
}

/** A migrated install with one wallet and one category, settings `blob`. */
async function seedInstall(blob: Record<string, unknown>): Promise<void> {
    for (const statement of SCHEMA_STATEMENTS) {
        await db.execute(statement);
    }
    await asyncStorageAdapter.set(StorageKeys.SCHEMA_VERSION, 6);
    await runMigrations();
    await createWallet(writerDeps(), { name: 'Bank', balance: 100000, type: WalletType.BANK });
    await db.runInTransaction(() => new CategoryRepository(db).create({ name: 'Bills', type: CategoryType.EXPENSE }));
    await AsyncStorage.setItem(StorageKeys.SETTINGS, JSON.stringify(blob));
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

/** The current period useBudgets settles on. */
async function currentPeriodSeenByBudgets(expected: string): Promise<void> {
    const { result, unmount } = renderHook(() => useBudgets());
    await waitFor(() => {
        expect(result.current.loading).toBe(false);
        expect(result.current.currentMonth).toBe(expected);
    });
    unmount();
}

beforeEach(async () => {
    jest.clearAllMocks();
    mockWrittenBackups.length = 0;
    mockPickedContent = '';
    await AsyncStorage.clear();
    db = new BetterSqliteDatabase();
    __setDatabaseForTests(db);
    container.reset();
    pinClock(new Date(2026, 10, 25, 12, 0).getTime());
});

afterEach(() => {
    restoreZoneClock();
    __setDatabaseForTests(null);
});

describe('pass 98 item 1. backup and restore of the month start day (process zone)', () => {
    it('pass 98 item 1. a file carrying 20 restores onto an install on 1, and the budgets follow day 20', async () => {
        await seedInstall({ ...BLOB, monthStartDay: 20 });
        const file = await writeBackup();
        expect((file.data.settings as unknown as Record<string, unknown>).monthStartDay).toBe(20);

        // Another install, on the default.
        await AsyncStorage.setItem(StorageKeys.SETTINGS, JSON.stringify(BLOB));
        const outcome = await restoreFile(file);

        expect(outcome.failedSteps).toEqual([]);
        await currentPeriodSeenByBudgets('2026-12');
    });

    it('pass 98 item 1. a file from before the field restores, and the install loads day 1', async () => {
        await seedInstall({ ...BLOB, monthStartDay: 20 });
        const file = await writeBackup();
        delete (file.data.settings as unknown as Record<string, unknown>).monthStartDay;
        expect(JSON.stringify(file)).not.toMatch(/monthStartDay/);

        const outcome = await restoreFile(file);

        expect(outcome.failedSteps).toEqual([]);
        expect((await loadSettings()).monthStartDay).toBe(1);
        await currentPeriodSeenByBudgets('2026-11');
    });

    it('pass 98 item 1. a malformed value restores, and the install loads day 1', async () => {
        await seedInstall({ ...BLOB, monthStartDay: 20 });
        const file = await writeBackup();
        (file.data.settings as unknown as Record<string, unknown>).monthStartDay = 'twenty';

        const outcome = await restoreFile(file);

        expect(outcome.failedSteps).toEqual([]);
        expect((await loadSettings()).monthStartDay).toBe(1);
    });
});

describe('pass 98 item 1. delete financial data keeps the month start day', () => {
    it('pass 98 item 1. after the reset the budgets still follow day 20', async () => {
        await seedInstall({ ...BLOB, monthStartDay: 20 });

        await resetAppData();

        await currentPeriodSeenByBudgets('2026-12');
    });
});
