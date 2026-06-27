/**
 * Database Singleton
 *
 * One shared encrypted SqlDatabase connection for the whole app. The single
 * shared connection is what makes cross-repository atomicity possible: every
 * repository the DI container builds receives THIS instance, so a use case can
 * wrap several repo calls in one `runInTransaction`.
 *
 * `initDatabase()` must run once at boot (the migration runner does this)
 * before any repository is used; `getDb()` then returns it synchronously.
 */

import { OpSQLiteDatabase } from './OpSQLiteDatabase';
import type { SqlDatabase } from './SqlDatabase';

let instance: SqlDatabase | null = null;

/** Open (once) the encrypted production database. Idempotent. */
export async function initDatabase(): Promise<SqlDatabase> {
    if (!instance) {
        instance = await OpSQLiteDatabase.create();
    }
    return instance;
}

/** Return the initialised database, or throw if boot hasn't run yet. */
export function getDb(): SqlDatabase {
    if (!instance) {
        throw new Error(
            'Database not initialised. Call initDatabase() at app boot before accessing repositories.',
        );
    }
    return instance;
}

/**
 * Close the live connection (releasing native file locks) and drop the cached
 * singleton so the next `initDatabase()` re-opens a fresh handle. Used by the
 * corrupted-store recovery flow before the DB file is deleted on disk.
 * Production-safe and idempotent — a no-op when nothing is open.
 */
export function closeDatabase(): void {
    instance?.close?.();
    instance = null;
}

/**
 * Fast boot health probe. A corrupted/undecryptable SQLCipher file can still
 * pass `PRAGMA cipher_version` and let init + migrations succeed, only failing
 * later as repeated read errors inside the data hooks (retry → OOM). This runs
 * ONE trivial read against a core table during boot so an unreadable store is
 * caught immediately and surfaced as a recoverable boot failure. Throws if the
 * store cannot be read.
 */
export async function assertStoreReadable(): Promise<void> {
    await getDb().execute('SELECT count(*) FROM wallets LIMIT 1');
}

/**
 * Test seam: inject an in-memory SqlDatabase (or reset to null). Production
 * code never calls this; it lets tests that exercise the real DI container or
 * boot path run against better-sqlite3 instead of op-sqlite.
 */
export function __setDatabaseForTests(db: SqlDatabase | null): void {
    instance = db;
}
