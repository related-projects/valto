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

/** Called by closeDatabase once the connection is closed. See onDatabaseClosed. */
const closeListeners = new Set<() => void>();

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
 * Production-safe and idempotent - a no-op when nothing is open.
 *
 * Every listener registered with onDatabaseClosed runs afterwards, so whatever
 * holds an object built over the closed connection can drop it (REGISTRE
 * V-110).
 */
export function closeDatabase(): void {
    instance?.close?.();
    instance = null;
    for (const listener of closeListeners) {
        listener();
    }
}

/**
 * Run `listener` every time closeDatabase closes the connection. Returns the
 * unsubscribe.
 *
 * The DI container registers here to empty itself (REGISTRE V-110, Owner
 * decision 3, pass 74): it builds each repository once, over whichever
 * connection getDb() returned then, and a repository kept across a close sends
 * every statement to the closed connection while runInTransaction goes to the
 * next one. A listener rather than a call to the container: the container
 * imports this module, so calling it from here would be an import cycle.
 * Verified by containerResetOnClose.test.ts - "V-110" and "V-110 (recovery
 * reset)".
 */
export function onDatabaseClosed(listener: () => void): () => void {
    closeListeners.add(listener);
    return () => {
        closeListeners.delete(listener);
    };
}

/**
 * Fast boot health probe. A corrupted/undecryptable SQLCipher file can still
 * pass `PRAGMA cipher_version` and let init + migrations succeed, only failing
 * later as repeated read errors inside the data hooks (retry -> OOM). This runs
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
