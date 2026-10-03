/**
 * createTestDb (test-only)
 *
 * Returns a fresh in-memory SqlDatabase with the financial schema applied,
 * ready to back repositories. Replaces the old key-value InMemoryStorage for
 * repository / use-case / hook tests, so they exercise real SQLite.
 *
 * `applySchema` is async; tests await `createTestDb()` in `beforeEach`.
 *
 * `writeGuard: true` arms the write guard once the schema is in place, as
 * runMigrations arms it in the app (REGISTRE V-109): from then on a write with
 * no transaction open throws WriteOutsideTransactionError. A suite that opts in
 * writes its own fixtures inside db.runInTransaction. Off by default, so
 * fixture setup and repository unit tests, which call repository write methods
 * directly as the app never does, keep writing with no transaction open.
 */

import { applySchema } from '../../src/data/storage/sql/schema';
import { SqlDatabase } from '../../src/data/storage/sql/SqlDatabase';
import { BetterSqliteDatabase } from './BetterSqliteDatabase';

export async function createTestDb(options: { writeGuard?: boolean } = {}): Promise<SqlDatabase> {
    const db = new BetterSqliteDatabase();
    await applySchema(db);
    if (options.writeGuard) {
        db.armWriteGuard();
    }
    return db;
}
