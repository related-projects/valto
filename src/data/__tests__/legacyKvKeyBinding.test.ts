/**
 * Legacy KV Key List Binding Tests
 *
 * Two paths remove the cleartext key-value copies of the financial entities:
 * migration v6 (once the import flag proves the data reached SQLite) and
 * resetCorruptedStore (when the encrypted store is unreadable). They must remove
 * exactly the same keys. They used to hold a literal list each, identical by
 * coincidence and bound by nothing, so the next key added to one would be left
 * behind by the other - a plaintext copy of financial data surviving an
 * operation that claimed to remove it.
 *
 * The behavioural cases below are driven BY the shared constant, so a key added
 * to it is automatically demanded of both consumers. The source assertions are
 * what stop a local list being reintroduced alongside it.
 */

import { readFileSync } from 'fs';
import { join } from 'path';

import { InMemoryStorage } from '../../../tests/helpers/InMemoryStorage';
import { v6_purge_imported_kv } from '../migrations/v6_purge_imported_kv';
import { LEGACY_KV_FINANCIAL_KEYS, StorageKeys } from '../storage/StorageKeys';
import type { SqlDatabase } from '../storage/sql/SqlDatabase';

const IMPORT_FLAG = '@valto:sqlite_imported';
const SRC = join(__dirname, '..');

// v6 touches no SQL; a stub satisfies the MigrationContext.
const stubDb: SqlDatabase = {
    execute: async () => ({ rows: [], rowsAffected: 0 }),
    runInTransaction: async (work) => work(),
};

describe('LEGACY_KV_FINANCIAL_KEYS', () => {
    it('holds the five financial key-value copies SQLite now owns', () => {
        expect([...LEGACY_KV_FINANCIAL_KEYS]).toEqual([
            StorageKeys.WALLETS,
            StorageKeys.TRANSACTIONS,
            StorageKeys.CATEGORIES,
            StorageKeys.BUDGETS,
            StorageKeys.RECURRING_RULES,
        ]);
    });

    it('is the list migration v6 purges, not a copy of it', () => {
        const source = readFileSync(join(SRC, 'migrations/v6_purge_imported_kv.ts'), 'utf8');

        expect(source).toContain('LEGACY_KV_FINANCIAL_KEYS');
        // Naming an individual financial key here means a second list has been
        // reintroduced - the exact divergence this constant exists to prevent.
        expect(source).not.toContain('StorageKeys.WALLETS');
        expect(source).not.toContain('StorageKeys.RECURRING_RULES');
    });

    it('is the list resetCorruptedStore removes, not a copy of it', () => {
        const source = readFileSync(join(SRC, 'services/storeRecoveryService.ts'), 'utf8');

        expect(source).toContain('LEGACY_KV_FINANCIAL_KEYS');
        expect(source).not.toContain('StorageKeys.WALLETS');
        expect(source).not.toContain('StorageKeys.RECURRING_RULES');
    });
});

describe('migration v6 purges every key in the shared list', () => {
    // Driven by the constant rather than a literal list, so a key added to it is
    // demanded of v6 automatically. Iterated inside one test rather than through
    // it.each so the suite still loads - and reports which key survived - when
    // the constant is missing.
    it('leaves none of them behind once the import flag is set', async () => {
        expect(LEGACY_KV_FINANCIAL_KEYS).toHaveLength(5);

        const storage = new InMemoryStorage();
        for (const key of LEGACY_KV_FINANCIAL_KEYS) {
            await storage.set(key, [{ id: 'seeded' }]);
        }
        await storage.set(IMPORT_FLAG, true);

        await v6_purge_imported_kv.up({ storage, db: stubDb });

        const survivors = [];
        for (const key of LEGACY_KV_FINANCIAL_KEYS) {
            if ((await storage.get(key)) !== null) survivors.push(key);
        }
        expect(survivors).toEqual([]);
    });
});
