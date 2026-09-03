/**
 * Store Recovery Service Tests
 *
 * Proves the filesystem-level reset targets the CORRECT files (the db file and
 * its WAL/SHM siblings) regardless of whether op-sqlite's getDbPath() reports a
 * full file path or a bare directory - and never a directory or a `/..` path
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

// A REAL in-memory KV store, with `remove` wrapped in a spy. The spy keeps the
// "which pointers were cleared / kept" assertions below; the real store is what
// lets the financial-key assertions check the resulting STATE rather than the
// call, so a key that is never passed to `remove` cannot pass unnoticed.
jest.mock('../../storage', () => {
    const mem = new (require('../../../../tests/helpers/InMemoryStorage').InMemoryStorage)();
    const realRemove = mem.remove.bind(mem);
    mem.remove = jest.fn((key: string) => realRemove(key));
    (global as any).__recoveryKv = mem;
    const actualKeys = jest.requireActual('../../storage/StorageKeys');
    return {
        asyncStorageAdapter: mem,
        StorageKeys: actualKeys.StorageKeys,
        LEGACY_KV_FINANCIAL_KEYS: actualKeys.LEGACY_KV_FINANCIAL_KEYS,
    };
});

import { File } from 'expo-file-system';

import { deleteDatabaseFiles, resetCorruptedStore } from '../storeRecoveryService';
import { asyncStorageAdapter, LEGACY_KV_FINANCIAL_KEYS, StorageKeys } from '../../storage';

const FileMock = File as unknown as jest.Mock;
const remove = asyncStorageAdapter.remove as jest.Mock;
const kv = asyncStorageAdapter;

const LIBRARY = '/var/mobile/Containers/Data/Application/ABC/Library';

beforeEach(async () => {
    jest.clearAllMocks();
    mockFileExists = true;
    mockGetDbPath.mockReturnValue(`${LIBRARY}/valto.db`);
    await kv.clear();
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
        // `<parent-of-Library>/valto.db` - this asserts the corrected behaviour.
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
    /** Seed the full KV residue an install can be holding when the store dies. */
    async function seedKv() {
        await kv.set(StorageKeys.SCHEMA_VERSION, 5);
        await kv.set(StorageKeys.SEED_INITIALIZED, true);
        await kv.set(StorageKeys.WALLETS, [{ id: 'w-1', balance: 65000 }]);
        await kv.set(StorageKeys.TRANSACTIONS, [{ id: 't-1', amount: 15000 }]);
        await kv.set(StorageKeys.CATEGORIES, [{ id: 'food' }]);
        await kv.set(StorageKeys.BUDGETS, [{ id: 'b-1', limitAmount: 50000 }]);
        await kv.set(StorageKeys.RECURRING_RULES, [{ id: 'rr-1', amount: 30000 }]);
        await kv.set(StorageKeys.SETTINGS, { currency: 'XOF', language: 'fr' });
        await kv.set(StorageKeys.SECURITY_CONFIG, { pinHash: 'abc123' });
    }

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

    it('leaves no cleartext financial key behind, recurring rules included', async () => {
        await seedKv();

        await resetCorruptedStore();

        expect(await kv.get(StorageKeys.WALLETS)).toBeNull();
        expect(await kv.get(StorageKeys.TRANSACTIONS)).toBeNull();
        expect(await kv.get(StorageKeys.CATEGORIES)).toBeNull();
        expect(await kv.get(StorageKeys.BUDGETS)).toBeNull();
        expect(await kv.get(StorageKeys.RECURRING_RULES)).toBeNull();
    });

    // Driven by the shared constant rather than a literal list, so a key added
    // to LEGACY_KV_FINANCIAL_KEYS is demanded of this path automatically - the
    // same list migration v6 purges. See legacyKvKeyBinding.test.ts.
    it('removes every key in the shared legacy list', async () => {
        expect(LEGACY_KV_FINANCIAL_KEYS).toHaveLength(5);

        for (const key of LEGACY_KV_FINANCIAL_KEYS) {
            await kv.set(key, [{ id: 'seeded' }]);
        }

        await resetCorruptedStore();

        const survivors = [];
        for (const key of LEGACY_KV_FINANCIAL_KEYS) {
            if ((await kv.get(key)) !== null) survivors.push(key);
        }
        expect(survivors).toEqual([]);
    });

    it('clears the rebuild pointers and keeps the user keys, as state', async () => {
        await seedKv();

        await resetCorruptedStore();

        expect(await kv.get(StorageKeys.SCHEMA_VERSION)).toBeNull();
        expect(await kv.get(StorageKeys.SEED_INITIALIZED)).toBeNull();
        expect(await kv.get(StorageKeys.SETTINGS)).toEqual({ currency: 'XOF', language: 'fr' });
        expect(await kv.get(StorageKeys.SECURITY_CONFIG)).toEqual({ pinHash: 'abc123' });
    });
});
