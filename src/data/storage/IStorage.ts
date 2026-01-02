/**
 * Storage Interface
 * 
 * Generic storage interface that abstracts the underlying storage mechanism.
 * This allows us to swap storage implementations (AsyncStorage, MMKV, SQLite)
 * without changing the repository layer.
 * 
 * Architecture Note:
 * This interface follows the Dependency Inversion Principle - high-level modules
 * (repositories) depend on this abstraction rather than concrete implementations.
 */

/**
 * Generic storage interface for key-value persistence
 */
export interface IStorage {
    /**
     * Get a value from storage by key
     * @param key Storage key
     * @returns Promise resolving to the stored value or null if not found
     */
    get<T>(key: string): Promise<T | null>;

    /**
     * Set a value in storage
     * @param key Storage key
     * @param value Value to store (will be JSON serialized)
     * @returns Promise resolving when storage is complete
     */
    set<T>(key: string, value: T): Promise<void>;

    /**
     * Remove a value from storage
     * @param key Storage key
     * @returns Promise resolving when removal is complete
     */
    remove(key: string): Promise<void>;

    /**
     * Clear all values from storage
     * @returns Promise resolving when clear is complete
     */
    clear(): Promise<void>;

    /**
     * Get all keys currently in storage
     * @returns Promise resolving to array of all keys
     */
    getAllKeys(): Promise<string[]>;
}

/**
 * Storage error types for better error handling
 */
export enum StorageErrorType {
    SERIALIZATION_ERROR = 'SERIALIZATION_ERROR',
    DESERIALIZATION_ERROR = 'DESERIALIZATION_ERROR',
    READ_ERROR = 'READ_ERROR',
    WRITE_ERROR = 'WRITE_ERROR',
    DELETE_ERROR = 'DELETE_ERROR',
}

/**
 * Custom error class for storage operations
 */
export class StorageError extends Error {
    constructor(
        public type: StorageErrorType,
        message: string,
        public originalError?: Error
    ) {
        super(message);
        this.name = 'StorageError';
    }
}
