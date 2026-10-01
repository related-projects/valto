/**
 * V-109: the write guard on the production database wrapper.
 *
 * Once the boot migrations have completed, a SQL write issued while no
 * transaction is open on the connection is refused in development and tests,
 * and goes through untouched when __DEV__ is false (a release build).
 *
 * Exercised through the production path: runMigrations() opens the real
 * OpSQLiteDatabase and runs the real migrations. Only the native op-sqlite
 * module is replaced, by an in-memory better-sqlite3 connection that also
 * answers the SQLCipher boot probe.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { BetterSqliteDatabase } from '../../../tests/helpers/BetterSqliteDatabase';
import { runMigrations } from '../migrations';
import { closeDatabase, getDb, initDatabase } from '../storage/sql/database';
import { applySchema } from '../storage/sql/schema';

let mockBacking: BetterSqliteDatabase;

jest.mock('@op-engineering/op-sqlite', () => ({
    open: jest.fn(() => ({
        execute: async (sql: string, params?: unknown[]) =>
            /^\s*PRAGMA cipher_version/i.test(sql)
                ? { rows: [{ cipher_version: '4.6.1 community' }], rowsAffected: 0 }
                : mockBacking.execute(sql, params ?? []),
        close: jest.fn(),
        getDbPath: () => null,
    })),
}));

jest.mock('expo-crypto', () => ({
    getRandomBytesAsync: jest.fn(async (n: number) => new Uint8Array(n)),
}));

const INSERT_CATEGORY = `INSERT INTO categories (id, name, type) VALUES (?, ?, ?)`;
const ROW = ['c-1', 'One', 'expense'];

const settle = (p: Promise<unknown>): Promise<unknown> => p.then(() => null, (error: unknown) => error);

async function categoryIds(): Promise<unknown[]> {
    const { rows } = await getDb().execute('SELECT id FROM categories ORDER BY id');
    return rows.map((r) => r.id);
}

const globalWithDev = global as unknown as { __DEV__: boolean };

beforeEach(async () => {
    await AsyncStorage.clear();
    closeDatabase();
    // Never armed: the guard under test is the one on the production wrapper.
    mockBacking = new BetterSqliteDatabase();
});

afterEach(() => {
    globalWithDev.__DEV__ = true;
    closeDatabase();
    mockBacking.close();
});

describe('V-109 d. after the boot migrations, a write with no transaction open is refused', () => {
    it('V-109 d1: an INSERT with no transaction open throws WriteOutsideTransactionError and writes nothing', async () => {
        await runMigrations();

        const error = (await settle(getDb().execute(INSERT_CATEGORY, ROW))) as Error | null;

        expect(error).not.toBeNull();
        expect(error?.name).toBe('WriteOutsideTransactionError');
        expect(error?.message).toMatch(/REGISTRE V-109/);
        expect(error?.message).toMatch(/runInTransaction/);
        // A typed error: the class the guard module exports. Loaded here, after
        // the assertions above, so a build without the guard fails on them.
        const { WriteOutsideTransactionError } =
            jest.requireActual<typeof import('../storage/sql/writeGuard')>('../storage/sql/writeGuard');
        expect(error).toBeInstanceOf(WriteOutsideTransactionError);
        expect(await categoryIds()).toEqual([]);
    });

    it.each([
        ['UPDATE', `UPDATE categories SET name = 'Two' WHERE id = 'c-1'`],
        ['DELETE', `DELETE FROM categories WHERE id = 'c-1'`],
        ['REPLACE', `REPLACE INTO categories (id, name, type) VALUES ('c-1', 'Two', 'expense')`],
        ['CREATE', `CREATE TABLE scratch (id TEXT)`],
        ['ALTER', `ALTER TABLE categories ADD COLUMN scratch TEXT`],
        ['DROP', `DROP TABLE IF EXISTS scratch`],
    ])('V-109 d2: %s with no transaction open is refused the same way', async (_verb, sql) => {
        await runMigrations();
        await getDb().runInTransaction(() => getDb().execute(INSERT_CATEGORY, ROW));

        const error = (await settle(getDb().execute(sql))) as Error | null;

        expect(error?.name).toBe('WriteOutsideTransactionError');
        const { rows } = await getDb().execute('SELECT name FROM categories');
        expect(rows).toEqual([{ name: 'One' }]);
    });
});

describe('V-109 control: what the guard lets through', () => {
    it('control: the boot migrations write outside the runner and complete', async () => {
        await expect(runMigrations()).resolves.toBeUndefined();
        expect(await categoryIds()).toEqual([]);
    });

    it('control: before the boot migrations have completed, a write with no transaction open goes through', async () => {
        await initDatabase();
        // The schema, written outside the runner as migration v4 writes it.
        await applySchema(getDb());

        await expect(getDb().execute(INSERT_CATEGORY, ROW)).resolves.toBeDefined();
        expect(await categoryIds()).toEqual(['c-1']);
    });

    it('control: after the boot migrations, a write inside runInTransaction commits', async () => {
        await runMigrations();

        await getDb().runInTransaction(() => getDb().execute(INSERT_CATEGORY, ROW));

        expect(await categoryIds()).toEqual(['c-1']);
    });

    it('control: after the boot migrations, a read with no transaction open is allowed', async () => {
        await runMigrations();

        await expect(getDb().execute('SELECT count(*) AS n FROM wallets')).resolves.toEqual({
            rows: [{ n: 0 }],
            rowsAffected: 0,
        });
    });

    it('control (limit): a write from another chain while a transaction is open is not refused - routing prevents it, the guard does not', async () => {
        await runMigrations();
        let release!: () => void;
        const held = new Promise<void>((resolve) => {
            release = resolve;
        });
        const open = getDb().runInTransaction(async () => {
            await getDb().execute('SELECT 1');
            await held;
        });
        await new Promise<void>((resolve) => setTimeout(resolve, 0));

        // Another chain, while that transaction is open: the guard sees an
        // open transaction and cannot tell the two apart.
        await expect(getDb().execute(INSERT_CATEGORY, ROW)).resolves.toBeDefined();

        release();
        await open;
        expect(await categoryIds()).toEqual(['c-1']);
    });
});

describe('V-109 e. production builds', () => {
    it('V-109 e (control): with __DEV__ false, the same write with no transaction open is not refused', async () => {
        await runMigrations();
        globalWithDev.__DEV__ = false;

        await expect(getDb().execute(INSERT_CATEGORY, ROW)).resolves.toBeDefined();

        globalWithDev.__DEV__ = true;
        expect(await categoryIds()).toEqual(['c-1']);
    });
});
