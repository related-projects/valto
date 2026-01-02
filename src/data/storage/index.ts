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
export { StorageKeys, type StorageKey } from './StorageKeys';

