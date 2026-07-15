/**
 * Store Recovery Service Tests
 *
 * Proves the filesystem-level reset targets the CORRECT files (the db file and
 * its WAL/SHM siblings) regardless of whether op-sqlite's getDbPath() reports a
 * full file path or a bare directory — and never a directory or a `/..` path
 * (the on-device ERR_FILE_NOT_WRITABLE regression). Also: clears the rebuild
 * pointers while keeping user settings.
 */

// Modern File API: each `new File(uri)` records the URI it was constructed with
// and exposes a `delete()` spy. `exists` defaults to true (overridable per test).
const mockFileDelete = jest.fn();
let mockFileExists = true;
jest.mock('expo-file-system', () => ({
    File: jest.fn().mockImplementation((uri: string) => ({
        uri,
        get exists() {
            return mockFileExists;
        },
        delete: mockFileDelete,
    })),
}));

// getDbPath is reconfigured per test to exercise both shapes op-sqlite returns.
const mockGetDbPath = jest.fn();
const mockCloseDatabase = jest.fn();
jest.mock('../../storage/sql/database', () => ({
    getDb: () => ({ getDbPath: () => mockGetDbPath() }),
    closeDatabase: () => mockCloseDatabase(),
}));

jest.mock('../../storage', () => ({
    asyncStorageAdapter: { remove: jest.fn().mockResolvedValue(undefined) },
    StorageKeys: jest.requireActual('../../storage/StorageKeys').StorageKeys,
}));

import { File } from 'expo-file-system';

import { deleteDatabaseFiles, resetCorruptedStore } from '../storeRecoveryService';
import { asyncStorageAdapter, StorageKeys } from '../../storage';

const FileMock = File as unknown as jest.Mock;
const remove = asyncStorageAdapter.remove as jest.Mock;

const LIBRARY = '/var/mobile/Containers/Data/Application/ABC/Library';

beforeEach(() => {
    jest.clearAllMocks();
    mockFileExists = true;
    mockGetDbPath.mockReturnValue(`${LIBRARY}/valto.db`);
});

// The `file://` URIs each `File` was constructed with, in call order.
const constructedUris = () => FileMock.mock.calls.map((c) => c[0] as string);

describe('deleteDatabaseFiles — target paths', () => {
    it('Case A: getDbPath() returns the FULL FILE PATH → deletes db + wal + shm in place', async () => {
        mockGetDbPath.mockReturnValue(`${LIBRARY}/valto.db`);

        await deleteDatabaseFiles();

        expect(constructedUris()).toEqual([
            `file://${LIBRARY}/valto.db`,
            `file://${LIBRARY}/valto.db-wal`,
            `file://${LIBRARY}/valto.db-shm`,
        ]);
        expect(mockFileDelete).toHaveBeenCalledTimes(3);
    });

    it('Case B: getDbPath() returns a DIRECTORY → still targets <dir>/valto.db (regression)', async () => {
        // The old derivation sliced off the last segment and produced
        // `<parent-of-Library>/valto.db` — this asserts the corrected behaviour.
        mockGetDbPath.mockReturnValue(LIBRARY);

        await deleteDatabaseFiles();

        expect(constructedUris()).toEqual([
            `file://${LIBRARY}/valto.db`,
            `file://${LIBRARY}/valto.db-wal`,
            `file://${LIBRARY}/valto.db-shm`,
        ]);
    });

    it('never deletes a directory or a `/..` traversal path', async () => {
        await deleteDatabaseFiles();

        for (const uri of constructedUris()) {
            expect(uri).not.toContain('/..');
            expect(uri).toMatch(/\/valto\.db(-wal|-shm)?$/);
        }
        // None of the targets is the bare directory.
        expect(constructedUris()).not.toContain(`file://${LIBRARY}`);
    });

    it('aborts (throws, constructs/deletes nothing) for a `/..` traversal path — the device regression', async () => {
        // The shape behind the on-device ERR_FILE_NOT_WRITABLE: a path that
        // resolves to `.../valto.db/..` (the db's PARENT directory).
        mockGetDbPath.mockReturnValue(`${LIBRARY}/valto.db/..`);

        await expect(deleteDatabaseFiles()).rejects.toThrow(/refusing to delete/);
        expect(FileMock).not.toHaveBeenCalled();
        expect(mockFileDelete).not.toHaveBeenCalled();
    });

    it('idempotent: skips delete() for files that do not exist', async () => {
        mockFileExists = false;

        await deleteDatabaseFiles();

        // All three targets are still constructed, but none is deleted.
        expect(constructedUris()).toHaveLength(3);
        expect(mockFileDelete).not.toHaveBeenCalled();
    });
});

describe('resetCorruptedStore', () => {
    it('closes the handle, deletes the files, then clears rebuild-blocking pointers', async () => {
        await resetCorruptedStore();

        expect(mockCloseDatabase).toHaveBeenCalledTimes(1);
        expect(mockFileDelete).toHaveBeenCalledTimes(3);

        // Pointers that MUST be cleared so the fresh DB re-migrates + re-seeds.
        expect(remove).toHaveBeenCalledWith(StorageKeys.SCHEMA_VERSION);
        expect(remove).toHaveBeenCalledWith(StorageKeys.SEED_INITIALIZED);
    });

    it('keeps user SETTINGS (language/theme/onboarding) and the security config', async () => {
        await resetCorruptedStore();

        expect(remove).not.toHaveBeenCalledWith(StorageKeys.SETTINGS);
        expect(remove).not.toHaveBeenCalledWith(StorageKeys.SECURITY_CONFIG);
    });
});
