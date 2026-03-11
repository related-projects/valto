/**
 * Migration Registry
 *
 * Central entry point for the migration system.
 * Add new migrations to the `migrations` array in version order.
 */

import { asyncStorageAdapter } from '../storage';
import { executeMigrations, type Migration } from './migrationRunner';
import { v1_initial } from './v1_initial';
import { v2_backfill_timestamps } from './v2_backfill_timestamps';
import { v3_normalize_amounts } from './v3_normalize_amounts';

// ─── Migration Registry ──────────────────────────────────────────────
// Add new migrations here, in ascending version order.

const migrations: Migration[] = [
    v1_initial,
    v2_backfill_timestamps,
    v3_normalize_amounts,
];

// ─── Public API ──────────────────────────────────────────────────────

/**
 * Run all pending migrations.
 * Call this during app startup, before any data access.
 */
export async function runMigrations(): Promise<void> {
    const finalVersion = await executeMigrations(migrations, asyncStorageAdapter);
    console.log(`[Migration] Schema at version ${finalVersion}`);
}
