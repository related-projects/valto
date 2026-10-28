/**
 * Backup and restore remove the backup copies in the cache (pass 84, items 1 b
 * and 1 d)
 *
 * createAndShareBackup writes the whole ledger, unencrypted, to
 * valto-backup-<time>.json in the cache root and leaves it there: the share
 * sheet returns before the receiving app has necessarily read it, so the file
 * cannot go when the share returns. It goes when the next backup is written.
 *
 * pickAndRestoreBackup asks expo-document-picker for a copy of the picked file,
 * which lands as DocumentPicker/<uuid>.<extension> in the cache. The restore
 * reads it whole into memory, and the copy goes as soon as the read is over,
 * whether the restore then succeeds or is refused.
 *
 * Neither path may fail because of the cleanup: a delete that throws leaves the
 * backup shared as before.
 *
 * Real here: backupService, the repositories, migrations and the cleanup, over
 * BetterSqliteDatabase. The file system is tests/helpers/memoryFileSystem.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import * as DocumentPicker from 'expo-document-picker';
import * as Sharing from 'expo-sharing';
import { BetterSqliteDatabase } from '../../../tests/helpers/BetterSqliteDatabase';
import { MemoryFile, memoryContents, memoryFiles } from '../../../tests/helpers/memoryFileSystem';
import { pinClock, restoreZoneClock } from '../../../tests/helpers/zoneClock';
import { container } from '../../core/di/container';
import { runMigrations } from '../migrations';
import { createAndShareBackup, pickAndRestoreBackup } from '../services/backupService';
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

const LEFTOVER_BACKUP = 'file:///cache/valto-backup-2026-10-27T09-15-00-000Z.json';
const OTHER_IN_CACHE = 'file:///cache/valto_transactions_2026-10-27.csv';
const PICKER_COPY = 'file:///cache/DocumentPicker/3f2b8c1e-9a4d-4c6b-8e21-5d7f0a9b1c3e.json';
const OTHER_IN_PICKER = 'file:///cache/DocumentPicker/notes.txt';

const shareAsync = Sharing.shareAsync as jest.Mock;
const getDocumentAsync = DocumentPicker.getDocumentAsync as jest.Mock;

let db: BetterSqliteDatabase;

/** Put a file where its writer would, with `content` in it. */
function place(uri: string, content = '{}'): void {
    new MemoryFile(uri).write(content);
}

/** The uri the latest share handed to the share sheet. */
function sharedUri(): string {
    return shareAsync.mock.calls[shareAsync.mock.calls.length - 1][0] as string;
}

/** The picker returns PICKER_COPY, as it does with copyToCacheDirectory. */
function pickerReturnsCopy(): void {
    getDocumentAsync.mockResolvedValue({
        canceled: false,
        assets: [{
            uri: PICKER_COPY,
            name: 'valto-backup-2026-10-27T09-15-00-000Z.json',
            size: memoryContents.get(PICKER_COPY)?.length ?? 0,
            mimeType: 'application/json',
        }],
    });
}

beforeEach(async () => {
    jest.clearAllMocks();
    memoryFiles.clear();
    memoryContents.clear();
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
    jest.restoreAllMocks();
    restoreZoneClock();
    __setDatabaseForTests(null);
});

describe('pass 84 item 1 b. before a new backup is written', () => {
    it('pass 84 item 1 b. removes the leftover backup and restore copy, keeps the other files', async () => {
        place(LEFTOVER_BACKUP);
        place(OTHER_IN_CACHE);
        place(PICKER_COPY);
        place(OTHER_IN_PICKER);
        expect(memoryFiles.has(LEFTOVER_BACKUP)).toBe(true);
        expect(memoryFiles.has(PICKER_COPY)).toBe(true);

        await createAndShareBackup();

        expect(shareAsync).toHaveBeenCalledTimes(1);
        expect(sharedUri()).not.toBe(LEFTOVER_BACKUP);
        expect(memoryFiles.has(sharedUri())).toBe(true);
        expect(memoryFiles.has(LEFTOVER_BACKUP)).toBe(false);
        expect(memoryFiles.has(PICKER_COPY)).toBe(false);
        expect(memoryFiles.has(OTHER_IN_CACHE)).toBe(true);
        expect(memoryFiles.has(OTHER_IN_PICKER)).toBe(true);
    });

    it('pass 84 item 1 b. the next backup removes the file the previous one shared', async () => {
        pinClock(Date.UTC(2026, 9, 28, 10, 0, 0));
        await createAndShareBackup();
        const first = sharedUri();
        expect(memoryFiles.has(first)).toBe(true);

        jest.setSystemTime(Date.UTC(2026, 9, 28, 10, 0, 1));
        await createAndShareBackup();
        const second = sharedUri();

        expect(second).not.toBe(first);
        expect(memoryFiles.has(first)).toBe(false);
        expect(memoryFiles.has(second)).toBe(true);
    });

    it('pass 84 item 1 b. a delete that throws does not stop the backup and logs nothing', async () => {
        place(LEFTOVER_BACKUP);
        const deleteSpy = jest.spyOn(MemoryFile.prototype, 'delete').mockImplementation(() => {
            throw new Error('ERR_FILE_NOT_WRITABLE');
        });
        const warn = jest.spyOn(console, 'warn');
        const error = jest.spyOn(console, 'error');

        await expect(createAndShareBackup()).resolves.toBeUndefined();

        expect(deleteSpy).toHaveBeenCalled();
        expect(shareAsync).toHaveBeenCalledTimes(1);
        expect(memoryFiles.has(sharedUri())).toBe(true);
        expect(warn).not.toHaveBeenCalled();
        expect(error).not.toHaveBeenCalled();
    });
});

describe('pass 84 item 1 d. after a restore has read its file', () => {
    beforeEach(() => {
        // pickAndRestoreBackup logs what it read; keep the run quiet.
        jest.spyOn(console, 'log').mockImplementation(() => undefined);
        jest.spyOn(console, 'error').mockImplementation(() => undefined);
    });

    it('pass 84 item 1 d. a restore that succeeds leaves no copy, keeps the other files', async () => {
        await createAndShareBackup();
        const backup = memoryContents.get(sharedUri());
        expect(backup).toBeDefined();
        place(PICKER_COPY, backup);
        place(OTHER_IN_CACHE);
        place(OTHER_IN_PICKER);
        pickerReturnsCopy();
        expect(memoryFiles.has(PICKER_COPY)).toBe(true);

        const outcome = await pickAndRestoreBackup();

        expect(outcome).not.toBeNull();
        expect(memoryFiles.has(PICKER_COPY)).toBe(false);
        expect(memoryFiles.has(OTHER_IN_CACHE)).toBe(true);
        expect(memoryFiles.has(OTHER_IN_PICKER)).toBe(true);
    });

    it('pass 84 item 1 d. a restore refused after the read leaves no copy, keeps the other files', async () => {
        place(PICKER_COPY, 'not a backup');
        place(OTHER_IN_CACHE);
        place(OTHER_IN_PICKER);
        pickerReturnsCopy();
        expect(memoryFiles.has(PICKER_COPY)).toBe(true);

        await expect(pickAndRestoreBackup()).rejects.toThrow('invalid JSON');

        expect(memoryFiles.has(PICKER_COPY)).toBe(false);
        expect(memoryFiles.has(OTHER_IN_CACHE)).toBe(true);
        expect(memoryFiles.has(OTHER_IN_PICKER)).toBe(true);
    });

    it('pass 84 item 1 d. a picked file refused as empty leaves no copy', async () => {
        place(PICKER_COPY, '');
        place(OTHER_IN_PICKER);
        pickerReturnsCopy();
        expect(memoryFiles.has(PICKER_COPY)).toBe(true);

        await expect(pickAndRestoreBackup()).rejects.toThrow('empty');

        expect(memoryFiles.has(PICKER_COPY)).toBe(false);
        expect(memoryFiles.has(OTHER_IN_PICKER)).toBe(true);
    });
});
