/**
 * v6 Purge Tests
 *
 * v5 imports the legacy key-value copies into encrypted SQLite and deliberately
 * leaves the source in place. v6 removes that source, but ONLY once v5's import
 * flag proves the import completed - the flag is written after every insert, so
 * an absent flag means the data may exist nowhere else.
 *
 * Backed by a real in-memory KV store: these tests assert which keys are present
 * afterwards, not that `remove` was called with a key.
 */

import { InMemoryStorage } from '../../../tests/helpers/InMemoryStorage';
import { v6_purge_imported_kv } from '../migrations/v6_purge_imported_kv';
import { StorageKeys } from '../storage/StorageKeys';
import type { SqlDatabase } from '../storage/sql/SqlDatabase';

const IMPORT_FLAG = '@valto:sqlite_imported';

// v6 touches no SQL; a stub satisfies the MigrationContext.
const stubDb: SqlDatabase = {
    execute: async () => ({ rows: [], rowsAffected: 0 }),
    runInTransaction: async (work) => work(),
};

const FINANCIAL_KEYS = [
    StorageKeys.WALLETS,
    StorageKeys.TRANSACTIONS,
    StorageKeys.CATEGORIES,
    StorageKeys.BUDGETS,
    StorageKeys.RECURRING_RULES,
];

let storage: InMemoryStorage;

/** A migrated install's full key-value residue, financial and non-financial. */
async function seedResidue(withFlag: boolean | undefined) {
    await storage.set(StorageKeys.WALLETS, [{ id: 'w-1', name: 'Cash', balance: 65000 }]);
    await storage.set(StorageKeys.TRANSACTIONS, [{ id: 't-1', amount: 15000 }]);
    await storage.set(StorageKeys.CATEGORIES, [{ id: 'food', name: 'Food' }]);
    await storage.set(StorageKeys.BUDGETS, [{ id: 'b-1', limitAmount: 50000 }]);
    await storage.set(StorageKeys.RECURRING_RULES, [{ id: 'rr-1', amount: 3000 }]);

    await storage.set(StorageKeys.SETTINGS, { currency: 'XOF', language: 'fr' });
    await storage.set(StorageKeys.SECURITY_CONFIG, { pinHash: 'abc123', biometricsEnabled: true });
    await storage.set(StorageKeys.SEED_INITIALIZED, true);
    await storage.set(StorageKeys.SCHEMA_VERSION, 5);

    if (withFlag !== undefined) {
        await storage.set(IMPORT_FLAG, withFlag);
    }
}

beforeEach(() => {
    storage = new InMemoryStorage();
});

describe('v6 purge_imported_kv', () => {
    it('removes all five imported keys when the import flag is true', async () => {
        await seedResidue(true);

        await v6_purge_imported_kv.up({ storage, db: stubDb });

        for (const key of FINANCIAL_KEYS) {
            expect(await storage.get(key)).toBeNull();
        }
    });

    it('keeps settings, security config, seed flag, schema version and the import flag', async () => {
        await seedResidue(true);

        await v6_purge_imported_kv.up({ storage, db: stubDb });

        expect(await storage.get(StorageKeys.SETTINGS)).toEqual({ currency: 'XOF', language: 'fr' });
        expect(await storage.get(StorageKeys.SECURITY_CONFIG)).toEqual({
            pinHash: 'abc123',
            biometricsEnabled: true,
        });
        expect(await storage.get(StorageKeys.SEED_INITIALIZED)).toBe(true);
        expect(await storage.get(StorageKeys.SCHEMA_VERSION)).toBe(5);
        // Kept on purpose: it is what keeps v5 a no-op on every later boot.
        expect(await storage.get(IMPORT_FLAG)).toBe(true);
    });

    it('deletes nothing when the import flag is absent - the import is unproven', async () => {
        await seedResidue(undefined);

        await v6_purge_imported_kv.up({ storage, db: stubDb });

        for (const key of FINANCIAL_KEYS) {
            expect(await storage.get(key)).not.toBeNull();
        }
        expect(await storage.get(StorageKeys.WALLETS)).toEqual([
            { id: 'w-1', name: 'Cash', balance: 65000 },
        ]);
    });

    it('deletes nothing when the import flag is false', async () => {
        await seedResidue(false);

        await v6_purge_imported_kv.up({ storage, db: stubDb });

        for (const key of FINANCIAL_KEYS) {
            expect(await storage.get(key)).not.toBeNull();
        }
    });

    it('is idempotent: running it twice changes nothing', async () => {
        await seedResidue(true);

        await v6_purge_imported_kv.up({ storage, db: stubDb });
        const afterFirst = (await storage.getAllKeys()).sort();

        await v6_purge_imported_kv.up({ storage, db: stubDb });
        const afterSecond = (await storage.getAllKeys()).sort();

        expect(afterSecond).toEqual(afterFirst);
        expect(afterSecond).toEqual(
            [
                IMPORT_FLAG,
                StorageKeys.SCHEMA_VERSION,
                StorageKeys.SECURITY_CONFIG,
                StorageKeys.SEED_INITIALIZED,
                StorageKeys.SETTINGS,
            ].sort(),
        );
    });

    it('is registered in the migration list at version 6', async () => {
        expect(v6_purge_imported_kv.version).toBe(6);
        expect(v6_purge_imported_kv.name).toBe('purge_imported_kv');
    });
});
