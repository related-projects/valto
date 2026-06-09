/**
 * Migration Runner Tests
 */

import { executeMigrations, getCurrentVersion, type Migration } from '../../../src/data/migrations/migrationRunner';
import { StorageKeys } from '../../../src/data/storage/StorageKeys';
import { InMemoryStorage } from '../../../tests/helpers/InMemoryStorage';

// Version-tracking tests only; these migrations don't touch SQLite, so a
// no-op stub satisfies the SqlDatabase parameter.
const stubDb: any = {
    execute: async () => ({ rows: [], rowsAffected: 0 }),
    runInTransaction: async (work: any) => work(),
};

describe('migrationRunner', () => {
    let storage: InMemoryStorage;

    beforeEach(() => {
        storage = new InMemoryStorage();
    });

    it('returns version 0 when no migrations have run', async () => {
        const version = await getCurrentVersion(storage);
        expect(version).toBe(0);
    });

    it('runs migrations in order', async () => {
        const executionOrder: number[] = [];

        const migrations: Migration[] = [
            {
                version: 2,
                name: 'second',
                up: async () => { executionOrder.push(2); },
            },
            {
                version: 1,
                name: 'first',
                up: async () => { executionOrder.push(1); },
            },
        ];

        await executeMigrations(migrations, storage, stubDb);
        expect(executionOrder).toEqual([1, 2]);
    });

    it('skips already-applied migrations', async () => {
        await storage.set(StorageKeys.SCHEMA_VERSION, 1);
        const executionOrder: number[] = [];

        const migrations: Migration[] = [
            {
                version: 1,
                name: 'first',
                up: async () => { executionOrder.push(1); },
            },
            {
                version: 2,
                name: 'second',
                up: async () => { executionOrder.push(2); },
            },
        ];

        await executeMigrations(migrations, storage, stubDb);
        expect(executionOrder).toEqual([2]);
    });

    it('updates schema version after each migration', async () => {
        const migrations: Migration[] = [
            {
                version: 1,
                name: 'first',
                up: async () => { },
            },
            {
                version: 2,
                name: 'second',
                up: async () => { },
            },
        ];

        const finalVersion = await executeMigrations(migrations, storage, stubDb);
        expect(finalVersion).toBe(2);
    });

    it('handles empty migration list', async () => {
        const finalVersion = await executeMigrations([], storage, stubDb);
        expect(finalVersion).toBe(0);
    });

    it('stops execution when a migration fails', async () => {
        const executionOrder: number[] = [];

        const migrations: Migration[] = [
            {
                version: 1,
                name: 'first',
                up: async () => { executionOrder.push(1); },
            },
            {
                version: 2,
                name: 'failing',
                up: async () => { throw new Error('migration failed'); },
            },
            {
                version: 3,
                name: 'third',
                up: async () => { executionOrder.push(3); },
            },
        ];

        await expect(executeMigrations(migrations, storage, stubDb)).rejects.toThrow('migration failed');
        expect(executionOrder).toEqual([1]);
        expect(await getCurrentVersion(storage)).toBe(1);
    });

    it('passes storage to migration up function', async () => {
        let receivedStorage: any = null;

        const migrations: Migration[] = [
            {
                version: 1,
                name: 'test',
                up: async ({ storage: s }) => { receivedStorage = s; },
            },
        ];

        await executeMigrations(migrations, storage, stubDb);
        expect(receivedStorage).toBe(storage);
    });
});
