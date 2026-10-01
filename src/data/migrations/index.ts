/**
 * Migration Registry
 *
 * Central entry point for the migration system.
 * Add new migrations to the `migrations` array in version order.
 */

import { asyncStorageAdapter } from '../storage';
import { initDatabase } from '../storage/sql/database';
import { executeMigrations, type Migration } from './migrationRunner';
import { v1_initial } from './v1_initial';
import { v2_backfill_timestamps } from './v2_backfill_timestamps';
import { v3_normalize_amounts } from './v3_normalize_amounts';
import { v4_create_sqlite_schema } from './v4_create_sqlite_schema';
import { v5_import_from_asyncstorage } from './v5_import_from_asyncstorage';
import { v6_purge_imported_kv } from './v6_purge_imported_kv';
import { v7_recurring_occurrence_key } from './v7_recurring_occurrence_key';
import { v8_recurring_end_occurrence_index } from './v8_recurring_end_occurrence_index';

// ─── Migration Registry ──────────────────────────────────────────────
// Add new migrations here, in ascending version order.

const migrations: Migration[] = [
    v1_initial,
    v2_backfill_timestamps,
    v3_normalize_amounts,
    v4_create_sqlite_schema,
    v5_import_from_asyncstorage,
    v6_purge_imported_kv,
    v7_recurring_occurrence_key,
    v8_recurring_end_occurrence_index,
];

// ─── Public API ──────────────────────────────────────────────────────

/**
 * Run all pending migrations.
 * Call this during app startup, before any data access. Initialises the
 * shared encrypted SQLite connection first, then applies migrations against
 * both the legacy KV store and SQLite.
 */
export async function runMigrations(): Promise<void> {
    const db = await initDatabase();
    const finalVersion = await executeMigrations(migrations, asyncStorageAdapter, db);
    console.log(`[Migration] Schema at version ${finalVersion}`);
    // From here on every SQL write must run inside runInTransaction (REGISTRE
    // V-109). The migrations above run before the UI renders and write outside
    // the runner by design, so the guard is armed only once they have all
    // completed; a failed migration throws before this line. Verified by
    // writeGuard.test.ts - "V-109 d1" and "control: the boot migrations write
    // outside the runner and complete".
    db.armWriteGuard?.();
}
