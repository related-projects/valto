/**
 * In-Memory Storage
 *
 * Test-only IStorage implementation using a Map.
 * Enables deterministic, offline repository testing without AsyncStorage.
 */

import { IStorage } from '../../src/data/storage/IStorage';

export class InMemoryStorage implements IStorage {
    private store = new Map<string, string>();

    async get<T>(key: string): Promise<T | null> {
        const value = this.store.get(key);
        if (value === undefined) return null;
        return JSON.parse(value) as T;
    }

    async set<T>(key: string, value: T): Promise<void> {
        this.store.set(key, JSON.stringify(value));
    }

    async remove(key: string): Promise<void> {
        this.store.delete(key);
    }

    async clear(): Promise<void> {
        this.store.clear();
    }

    async getAllKeys(): Promise<string[]> {
        return Array.from(this.store.keys());
    }
}
