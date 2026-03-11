/**
 * SQLite Storage Adapter (Stub)
 *
 * Placeholder implementation of IStorage using expo-sqlite.
 * SQLite provides relational database capabilities for complex queries.
 *
 * TODO — Migration Trigger:
 * Consider migrating to SQLite when:
 * - Transaction count > 10,000 (key-value stores become inefficient)
 * - Complex queries are needed (JOINs, aggregations, date range filters)
 * - Data relationships need enforcing (foreign keys)
 * - Full-text search is required
 *
 * Installation:
 * npx expo install expo-sqlite
 *
 * Advantages over AsyncStorage:
 * - Structured queries (SQL)
 * - Indexed lookups (O(log n) vs O(n))
 * - Foreign key constraints
 * - Transaction support (BEGIN/COMMIT/ROLLBACK)
 * - Partial reads without loading entire dataset
 *
 * Implementation Notes:
 * - Drop-in replacement: implements the same IStorage interface
 * - For key-value compatibility, uses a single `kv_store` table
 * - For full relational features, consider a dedicated SQLite repository layer
 * - Repositories require zero changes when switching adapters
 */

import type { IStorage } from './IStorage';

export class SQLiteAdapter implements IStorage {
    async get<T>(key: string): Promise<T | null> {
        // TODO: Implement with expo-sqlite
        // const db = await SQLite.openDatabaseAsync('valto.db');
        // const row = await db.getFirstAsync('SELECT value FROM kv_store WHERE key = ?', [key]);
        // return row ? JSON.parse(row.value) as T : null;
        throw new Error(`[SQLiteAdapter] Not implemented. Key: ${key}`);
    }

    async set<T>(key: string, value: T): Promise<void> {
        // TODO: Implement with expo-sqlite
        // const db = await SQLite.openDatabaseAsync('valto.db');
        // await db.runAsync('INSERT OR REPLACE INTO kv_store (key, value) VALUES (?, ?)', [key, JSON.stringify(value)]);
        throw new Error(`[SQLiteAdapter] Not implemented. Key: ${key}`);
    }

    async remove(key: string): Promise<void> {
        // TODO: Implement with expo-sqlite
        // const db = await SQLite.openDatabaseAsync('valto.db');
        // await db.runAsync('DELETE FROM kv_store WHERE key = ?', [key]);
        throw new Error(`[SQLiteAdapter] Not implemented. Key: ${key}`);
    }

    async clear(): Promise<void> {
        // TODO: Implement with expo-sqlite
        // const db = await SQLite.openDatabaseAsync('valto.db');
        // await db.runAsync('DELETE FROM kv_store');
        throw new Error('[SQLiteAdapter] Not implemented.');
    }

    async getAllKeys(): Promise<string[]> {
        // TODO: Implement with expo-sqlite
        // const db = await SQLite.openDatabaseAsync('valto.db');
        // const rows = await db.getAllAsync('SELECT key FROM kv_store');
        // return rows.map(r => r.key);
        throw new Error('[SQLiteAdapter] Not implemented.');
    }
}
