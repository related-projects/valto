/**
 * MMKV Storage Adapter (Stub)
 *
 * Placeholder implementation of IStorage using react-native-mmkv.
 * MMKV is a high-performance key-value storage framework by Tencent.
 *
 * TODO — Migration Trigger:
 * Consider migrating to MMKV when:
 * - Transaction count > 5,000 (AsyncStorage JSON parse becomes noticeable)
 * - Settings reads are latency-sensitive (MMKV is synchronous)
 * - Binary data storage is needed
 *
 * Installation:
 * npm install react-native-mmkv
 *
 * Advantages over AsyncStorage:
 * - ~30x faster reads/writes
 * - Synchronous API available
 * - Type-safe
 * - Built-in encryption support
 *
 * Implementation Notes:
 * - Drop-in replacement: implements the same IStorage interface
 * - Repositories require zero changes when switching adapters
 */

import type { IStorage } from './IStorage';

export class MMKVAdapter implements IStorage {
    async get<T>(key: string): Promise<T | null> {
        // TODO: Implement with react-native-mmkv
        // const mmkv = new MMKV();
        // const json = mmkv.getString(key);
        // return json ? JSON.parse(json) as T : null;
        throw new Error(`[MMKVAdapter] Not implemented. Key: ${key}`);
    }

    async set<T>(key: string, value: T): Promise<void> {
        // TODO: Implement with react-native-mmkv
        // const mmkv = new MMKV();
        // mmkv.set(key, JSON.stringify(value));
        throw new Error(`[MMKVAdapter] Not implemented. Key: ${key}`);
    }

    async remove(key: string): Promise<void> {
        // TODO: Implement with react-native-mmkv
        // const mmkv = new MMKV();
        // mmkv.delete(key);
        throw new Error(`[MMKVAdapter] Not implemented. Key: ${key}`);
    }

    async clear(): Promise<void> {
        // TODO: Implement with react-native-mmkv
        // const mmkv = new MMKV();
        // mmkv.clearAll();
        throw new Error('[MMKVAdapter] Not implemented.');
    }

    async getAllKeys(): Promise<string[]> {
        // TODO: Implement with react-native-mmkv
        // const mmkv = new MMKV();
        // return mmkv.getAllKeys();
        throw new Error('[MMKVAdapter] Not implemented.');
    }
}
