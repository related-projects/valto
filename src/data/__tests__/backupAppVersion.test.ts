/**
 * A backup file states the version of the app that wrote it (pass 83, item 8)
 *
 * The file's `appVersion` was the literal '1.0.0' whatever build wrote it. It
 * is now the version of the installed app, read from expo-application at the
 * time of the backup - the source the About and Settings screens show - and
 * 'unknown' when the platform reports none. Nothing reads the field back, so
 * the format, its schema version and the restore path are unchanged.
 *
 * The file is produced by createAndShareBackup, the only writer of a backup
 * file (register V-41), against an empty migrated store. expo-application is
 * driven through getters, as in src/screens/__tests__/AboutScreen.version.test.tsx.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { BetterSqliteDatabase } from '../../../tests/helpers/BetterSqliteDatabase';
import { container } from '../../core/di/container';
import { runMigrations } from '../migrations';
import { type BackupSnapshot, createAndShareBackup } from '../services/backupService';
import { asyncStorageAdapter, StorageKeys } from '../storage';
import { __setDatabaseForTests } from '../storage/sql/database';
import { SCHEMA_STATEMENTS } from '../storage/sql/schema';

let mockApplicationVersion: string | null = null;

jest.mock('expo-application', () => ({
    get nativeApplicationVersion() { return mockApplicationVersion; },
    get nativeBuildVersion() { return '1'; },
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
    dataEvents: { emit: jest.fn(), emitMultiple: jest.fn(), subscribe: () => () => undefined },
}));

let db: BetterSqliteDatabase;

/** Write the file the way the app writes it; return its parsed body. */
async function writeBackup(): Promise<BackupSnapshot> {
    await createAndShareBackup();
    expect(mockWrittenBackups).toHaveLength(1);
    return JSON.parse(mockWrittenBackups[0]) as BackupSnapshot;
}

beforeEach(async () => {
    jest.clearAllMocks();
    mockWrittenBackups.length = 0;
    await AsyncStorage.clear();
    db = new BetterSqliteDatabase();
    __setDatabaseForTests(db);
    container.reset();
    for (const statement of SCHEMA_STATEMENTS) {
        await db.execute(statement);
    }
    await asyncStorageAdapter.set(StorageKeys.SCHEMA_VERSION, 6);
    await runMigrations();
});

afterEach(() => {
    __setDatabaseForTests(null);
});

describe('pass 83 item 8. the version a backup file states', () => {
    it('pass 83 item 8 a. carries the version the installed app reports', async () => {
        mockApplicationVersion = '9.8.7';

        const file = await writeBackup();

        expect(file.appVersion).toBe('9.8.7');
    });

    it('pass 83 item 8 b. says unknown when the platform reports no version', async () => {
        mockApplicationVersion = null;

        const file = await writeBackup();

        expect(file.appVersion).toBe('unknown');
    });
});
