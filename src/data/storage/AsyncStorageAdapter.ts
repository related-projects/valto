/**
 * AsyncStorage Adapter
 * 
 * Concrete implementation of IStorage using React Native AsyncStorage.
 * Handles JSON serialization/deserialization and error handling.
 * 
 * Architecture Note:
 * This adapter implements the IStorage interface, allowing the repository layer
 * to remain decoupled from the specific storage implementation.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { IStorage, StorageError, StorageErrorType } from './IStorage';

/**
 * AsyncStorage implementation of the IStorage interface
 */
export class AsyncStorageAdapter implements IStorage {
    /**
     * Get a value from AsyncStorage
     */
    async get<T>(key: string): Promise<T | null> {
        try {
            const jsonValue = await AsyncStorage.getItem(key);

            if (jsonValue === null) {
                return null;
            }

            try {
                return JSON.parse(jsonValue) as T;
            } catch (parseError) {
                throw new StorageError(
                    StorageErrorType.DESERIALIZATION_ERROR,
                    `Failed to parse stored value for key: ${key}`,
                    parseError as Error
                );
            }
        } catch (error) {
            if (error instanceof StorageError) {
                throw error;
            }

            throw new StorageError(
                StorageErrorType.READ_ERROR,
                `Failed to read from storage for key: ${key}`,
                error as Error
            );
        }
    }

    /**
     * Set a value in AsyncStorage
     */
    async set<T>(key: string, value: T): Promise<void> {
        try {
            const jsonValue = JSON.stringify(value);
            await AsyncStorage.setItem(key, jsonValue);
        } catch (error) {
            // Check if it's a serialization error
            if (error instanceof TypeError || (error as Error).message?.includes('circular')) {
                throw new StorageError(
                    StorageErrorType.SERIALIZATION_ERROR,
                    `Failed to serialize value for key: ${key}`,
                    error as Error
                );
            }

            throw new StorageError(
                StorageErrorType.WRITE_ERROR,
                `Failed to write to storage for key: ${key}`,
                error as Error
            );
        }
    }

    /**
     * Remove a value from AsyncStorage
     */
    async remove(key: string): Promise<void> {
        try {
            await AsyncStorage.removeItem(key);
        } catch (error) {
            throw new StorageError(
                StorageErrorType.DELETE_ERROR,
                `Failed to remove from storage for key: ${key}`,
                error as Error
            );
        }
    }

    /**
     * Clear all values from AsyncStorage
     * WARNING: This will clear ALL AsyncStorage data, including data from other parts of the app
     */
    async clear(): Promise<void> {
        try {
            await AsyncStorage.clear();
        } catch (error) {
            throw new StorageError(
                StorageErrorType.DELETE_ERROR,
                'Failed to clear storage',
                error as Error
            );
        }
    }

    /**
     * Get all keys from AsyncStorage
     */
    async getAllKeys(): Promise<string[]> {
        try {
            const keys = await AsyncStorage.getAllKeys();
            return [...keys]; // Convert readonly array to mutable array
        } catch (error) {
            throw new StorageError(
                StorageErrorType.READ_ERROR,
                'Failed to get all keys from storage',
                error as Error
            );
        }
    }
}

/**
 * Singleton instance of AsyncStorageAdapter
 * This ensures we use the same instance throughout the app
 */
export const asyncStorageAdapter = new AsyncStorageAdapter();
