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

// ─── Migration Registry ──────────────────────────────────────────────
// Add new migrations here, in ascending version order.

const migrations: Migration[] = [
    v1_initial,
    v2_backfill_timestamps,
    v3_normalize_amounts,
    v4_create_sqlite_schema,
    v5_import_from_asyncstorage,
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
}
