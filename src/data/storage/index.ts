/**
 * Storage Layer Exports
 * 
 * Central export point for all storage-related interfaces and implementations.
 */

export {
    AsyncStorageAdapter,
    asyncStorageAdapter
} from './AsyncStorageAdapter';
export {
    StorageError,
    StorageErrorType, type IStorage
} from './IStorage';
export {
    LEGACY_KV_FINANCIAL_KEYS,
    StorageKeys, type LegacyKvFinancialKey, type StorageKey
} from './StorageKeys';

