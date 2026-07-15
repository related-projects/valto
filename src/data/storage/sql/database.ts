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
 * Test seam: inject an in-memory SqlDatabase (or reset to null). Production
 * code never calls this; it lets tests that exercise the real DI container or
 * boot path run against better-sqlite3 instead of op-sqlite.
 */
export function __setDatabaseForTests(db: SqlDatabase | null): void {
    instance = db;
}
