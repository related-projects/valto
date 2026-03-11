/**
 * Migration Runner
 *
 * Sequential migration system for storage schema evolution.
 * Tracks the current schema version and runs pending migrations in order.
 *
 * Rules:
 * - Migrations must be idempotent
 * - Migrations must not delete user data
 * - Migrations run sequentially in version order
 * - Each migration's version is recorded after successful execution
 */

import { IStorage } from '../storage/IStorage';
import { StorageKeys } from '../storage/StorageKeys';

// ─── Types ────────────────────────────────────────────────────────────

export interface Migration {
    /** Sequential version number (1, 2, 3, …) */
    version: number;
    /** Human-readable migration name */
    name: string;
    /** Migration function — must be idempotent. Receives storage for data access. */
    up: (storage: IStorage) => Promise<void>;
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
 * @param storage — storage adapter for reading/writing data
 * @returns the final schema version after running all applicable migrations
 */
export async function executeMigrations(
    migrations: Migration[],
    storage: IStorage,
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
            await migration.up(storage);
            await setVersion(storage, migration.version);
            console.log(`[Migration] v${migration.version} complete`);
        } catch (error) {
            console.error(`[Migration] v${migration.version} failed:`, error);
            throw error; // Stop execution on failure
        }
    }

    return await getCurrentVersion(storage);
}
