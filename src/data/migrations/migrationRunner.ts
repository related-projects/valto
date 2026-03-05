/**
 * Migration Runner
 *
 * Sequential migration system for AsyncStorage schema evolution.
 * Tracks the current schema version and runs pending migrations in order.
 *
 * Rules:
 * - Migrations must be idempotent
 * - Migrations must not delete user data
 * - Migrations run sequentially in version order
 * - Each migration's version is recorded after successful execution
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { StorageKeys } from '../storage/StorageKeys';

// ─── Types ────────────────────────────────────────────────────────────

export interface Migration {
    /** Sequential version number (1, 2, 3, …) */
    version: number;
    /** Human-readable migration name */
    name: string;
    /** Migration function — must be idempotent */
    up: () => Promise<void>;
}

// ─── Runner ───────────────────────────────────────────────────────────

/**
 * Reads the current schema version from storage.
 * Returns 0 if no version has been set yet.
 */
export async function getCurrentVersion(): Promise<number> {
    try {
        const raw = await AsyncStorage.getItem(StorageKeys.SCHEMA_VERSION);
        if (raw === null) return 0;
        const version = parseInt(raw, 10);
        return isNaN(version) ? 0 : version;
    } catch {
        return 0;
    }
}

/**
 * Persists the schema version after a successful migration.
 */
async function setVersion(version: number): Promise<void> {
    await AsyncStorage.setItem(StorageKeys.SCHEMA_VERSION, version.toString());
}

/**
 * Executes all pending migrations in sequential order.
 *
 * @param migrations — ordered list of migrations to apply
 * @returns the final schema version after running all applicable migrations
 */
export async function executeMigrations(migrations: Migration[]): Promise<number> {
    const currentVersion = await getCurrentVersion();

    // Sort by version to guarantee order
    const sorted = [...migrations].sort((a, b) => a.version - b.version);

    for (const migration of sorted) {
        if (migration.version <= currentVersion) {
            continue; // Already applied
        }

        console.log(`[Migration] Running v${migration.version}: ${migration.name}`);

        try {
            await migration.up();
            await setVersion(migration.version);
            console.log(`[Migration] v${migration.version} complete`);
        } catch (error) {
            console.error(`[Migration] v${migration.version} failed:`, error);
            throw error; // Stop execution on failure
        }
    }

    return await getCurrentVersion();
}
