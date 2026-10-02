/**
 * V-110: no repository built on a closed connection is handed out again.
 *
 * The audited path (pass 74): the DI container builds each repository once,
 * over whichever connection getDb() returned at that moment, and keeps it.
 * resetCorruptedStore closes that connection (closeDatabase) and the next boot
 * opens a new one, but nothing emptied the container: every repository kept
 * the closed connection while getUseCaseDeps().runInTransaction went to the
 * new one. The boot repair after a recovery reset then read and wrote through
 * the closed connection.
 *
 * Better-sqlite3 stands in for op-sqlite: these tests show where the
 * repositories send their statements, not what a closed op-sqlite handle does
 * on a device.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { createTestDb } from '../../../tests/helpers/createTestDb';
import { container, getUseCaseDeps } from '../../core/di/container';
import { defaultCategories } from '../seed/seedData';
import { resetCorruptedStore } from '../services/storeRecoveryService';
import { ensureUsableState } from '../services/usableStateService';
import { __setDatabaseForTests, closeDatabase } from '../storage/sql/database';
import type { SqlDatabase } from '../storage/sql/SqlDatabase';

// jest.mock calls are hoisted above the imports by babel-jest.
// resetCorruptedStore deletes the database files through this API; none
// exists here, so nothing is deleted.
jest.mock('expo-file-system', () => ({
    File: jest.fn().mockImplementation((uri: string) => ({
        uri,
        exists: false,
        delete: jest.fn(),
    })),
}));

jest.mock('../../core/events', () => ({
    dataEvents: { emit: jest.fn(), emitMultiple: jest.fn() },
}));

/** Where A reports its file to be, as op-sqlite's getDbPath() does. */
const DB_PATH = '/data/user/0/app/databases/valto.db';

/** Rows of `table` in `db`. */
async function count(db: SqlDatabase, table: string): Promise<number> {
    const { rows } = await db.execute(`SELECT COUNT(*) AS n FROM ${table}`);
    return Number(rows[0].n);
}

let a: SqlDatabase;
let b: SqlDatabase;

beforeEach(async () => {
    jest.clearAllMocks();
    await AsyncStorage.clear();
    a = await createTestDb({ writeGuard: true });
    a.getDbPath = () => DB_PATH;
    b = await createTestDb({ writeGuard: true });
    __setDatabaseForTests(a);
    container.reset();
});

afterEach(() => {
    __setDatabaseForTests(null);
    container.reset();
    b.close?.();
});

describe('V-110. the container after the database is closed', () => {
    it('V-110: container filled on A, closeDatabase, B installed: the boot repair writes the default categories and a wallet into B', async () => {
        // A boot that got as far as the recurring engine: every repository
        // built over A.
        getUseCaseDeps();

        closeDatabase();
        // The next boot's initDatabase installs a fresh connection.
        __setDatabaseForTests(b);

        const [repair] = await Promise.allSettled([ensureUsableState()]);

        expect(await count(b, 'categories')).toBe(defaultCategories.length);
        expect(await count(b, 'wallets')).toBe(1);
        expect(repair.status).toBe('fulfilled');
    });

    it('V-110 (recovery reset): container filled on A, resetCorruptedStore, B installed: the boot repair writes the default categories and a wallet into B', async () => {
        getUseCaseDeps();

        // The production path to closeDatabase: the recovery screen's reset.
        await resetCorruptedStore();
        __setDatabaseForTests(b);

        const [repair] = await Promise.allSettled([ensureUsableState()]);

        expect(await count(b, 'categories')).toBe(defaultCategories.length);
        expect(await count(b, 'wallets')).toBe(1);
        expect(repair.status).toBe('fulfilled');
    });
});

describe('V-110 control: a boot that failed before the container was filled', () => {
    it('control: the recovery reset after a boot that failed before the container was filled still works', async () => {
        // Nothing asked the container for a repository before the reset.
        await resetCorruptedStore();
        __setDatabaseForTests(b);

        await ensureUsableState();

        expect(await count(b, 'categories')).toBe(defaultCategories.length);
        expect(await count(b, 'wallets')).toBe(1);
    });
});
