/**
 * Migration Runner
 *
 * Sequential migration system for storage schema evolution.
 * Tracks the current schema version and runs pending migrations in order.
 *
 * Each migration receives a context exposing BOTH stores:
 *  - `storage`: the legacy key-value store (AsyncStorage) — still home to
 *    settings/security/seed flags and the schema-version pointer, and the
 *    source for the one-time SQLite import.
 *  - `db`: the relational SqlDatabase (SQLite/SQLCipher) — home to all
 *    financial entities.
 *
 * Rules:
 * - Migrations must be idempotent
 * - Migrations must not delete user data
 * - Migrations run sequentially in version order
 * - Each migration's version is recorded after successful execution
 */

import type { SqlDatabase } from '../storage/sql/SqlDatabase';
import { IStorage } from '../storage/IStorage';
import { StorageKeys } from '../storage/StorageKeys';

// ─── Types ────────────────────────────────────────────────────────────

/** Both stores a migration may touch. */
export interface MigrationContext {
    storage: IStorage;
    db: SqlDatabase;
}

export interface Migration {
    /** Sequential version number (1, 2, 3, …) */
    version: number;
    /** Human-readable migration name */
    name: string;
    /** Migration function — must be idempotent. */
    up: (ctx: MigrationContext) => Promise<void>;
}

// ─── Runner ───────────────────────────────────────────────────────────

/**
 * Reads the current schema version from storage.
 * Returns 0 if no version has been set yet.
 */
export async function getCurrentVersion(storage: IStorage): Promise<number> {
    try {
        const raw = await storage.get<number>(StorageKeys.SCHEMA_VERSION);
        if (raw === null || raw === undefined) return 0;
        const version = typeof raw === 'number' ? raw : parseInt(String(raw), 10);
        return isNaN(version) ? 0 : version;
    } catch {
        return 0;
    }
}

/**
 * Persists the schema version after a successful migration.
 */
async function setVersion(storage: IStorage, version: number): Promise<void> {
    await storage.set(StorageKeys.SCHEMA_VERSION, version);
}

/**
 * Executes all pending migrations in sequential order.
 *
 * @param migrations — ordered list of migrations to apply
 * @param storage — legacy key-value store (also holds the version pointer)
 * @param db — relational SqlDatabase passed to each migration
 * @returns the final schema version after running all applicable migrations
 */
export async function executeMigrations(
    migrations: Migration[],
    storage: IStorage,
    db: SqlDatabase,
): Promise<number> {
    const currentVersion = await getCurrentVersion(storage);

    // Sort by version to guarantee order
    const sorted = [...migrations].sort((a, b) => a.version - b.version);

    for (const migration of sorted) {
        if (migration.version <= currentVersion) {
            continue; // Already applied
        }

        console.log(`[Migration] Migrating schema from v${migration.version - 1} to v${migration.version}: ${migration.name}...`);

        try {
            await migration.up({ storage, db });
            await setVersion(storage, migration.version);
            console.log(`[Migration] v${migration.version} complete`);
        } catch (error) {
            console.error(`[Migration] v${migration.version} failed:`, error);
            throw error; // Stop execution on failure
        }
    }

    return await getCurrentVersion(storage);
}
