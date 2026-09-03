/**
 * v6 - Purge the imported AsyncStorage source copies
 *
 * v5 moved the financial data into encrypted SQLite but deliberately left the
 * legacy key-value copies in place (read-only source, and the migration runner
 * forbids a migration from deleting user data while the import is unproven).
 * Those copies are cleartext: on Android AsyncStorage is a plain, unencrypted
 * SQLiteOpenHelper database (`RKStorage`) in the app data directory, a different
 * file from the encrypted `valto.db`. Leaving them there means the app's
 * "financial data lives in an encrypted database" guarantee holds for the live
 * store while a full plaintext copy of the same ledger sits next to it.
 *
 * Guard: the purge runs ONLY when v5's IMPORT_FLAG is true. That flag is written
 * at the very end of v5, after every insert has succeeded, so a true flag is the
 * proof that the data reached SQLite. If the flag is absent or false - a clean
 * install that never had KV data, or an import that failed part-way - v6 deletes
 * nothing and returns. An incomplete import must never have its source removed.
 *
 * Idempotent: `remove` on an absent key is a no-op, so a second run does nothing.
 *
 * The flag itself is kept: it is what keeps v5 a no-op on later boots. SETTINGS,
 * SECURITY_CONFIG, SEED_INITIALIZED and SCHEMA_VERSION are untouched - they are
 * live keys, not import residue.
 *
 * The purged list is LEGACY_KV_FINANCIAL_KEYS, shared with resetCorruptedStore
 * rather than copied: the two paths must remove the same keys, and a local
 * literal here is exactly how they would silently drift apart.
 */

import { LEGACY_KV_FINANCIAL_KEYS } from '../storage/StorageKeys';
import type { Migration } from './migrationRunner';

/** Must match the flag v5 writes at the end of a successful import. */
const IMPORT_FLAG = '@valto:sqlite_imported';

export const v6_purge_imported_kv: Migration = {
    version: 6,
    name: 'purge_imported_kv',
    up: async ({ storage }) => {
        const imported = await storage.get<boolean>(IMPORT_FLAG);
        if (imported !== true) {
            console.log(
                '[Migration v6] Import flag not set - leaving the legacy key-value copies in place',
            );
            return;
        }

        for (const key of LEGACY_KV_FINANCIAL_KEYS) {
            await storage.remove(key);
        }

        console.log(
            `[Migration v6] Purged ${LEGACY_KV_FINANCIAL_KEYS.length} imported key-value copies`,
        );
    },
};
