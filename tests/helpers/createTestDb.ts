/**
 * createTestDb (test-only)
 *
 * Returns a fresh in-memory SqlDatabase with the financial schema applied,
 * ready to back repositories. Replaces the old key-value InMemoryStorage for
 * repository / use-case / hook tests, so they exercise real SQLite.
 *
 * `applySchema` is async; tests await `createTestDb()` in `beforeEach`.
 */

import { applySchema } from '../../src/data/storage/sql/schema';
import { SqlDatabase } from '../../src/data/storage/sql/SqlDatabase';
import { BetterSqliteDatabase } from './BetterSqliteDatabase';

export async function createTestDb(): Promise<SqlDatabase> {
    const db = new BetterSqliteDatabase();
    await applySchema(db);
    return db;
}
