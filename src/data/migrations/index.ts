/**
 * Migration Registry
 *
 * Central entry point for the migration system.
 * Add new migrations to the `migrations` array in version order.
 */

import { executeMigrations, type Migration } from './migrationRunner';
import { v1_initial } from './v1_initial';

// ─── Migration Registry ──────────────────────────────────────────────
// Add new migrations here, in ascending version order.

const migrations: Migration[] = [
    v1_initial,
];

// ─── Public API ──────────────────────────────────────────────────────

/**
 * Run all pending migrations.
 * Call this during app startup, before any data access.
 */
export async function runMigrations(): Promise<void> {
    const finalVersion = await executeMigrations(migrations);
    console.log(`[Migration] Schema at version ${finalVersion}`);
}
