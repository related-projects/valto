/**
 * Seed Service
 * 
 * Service for initializing default data on first app launch.
 * This ensures users have a good starting point without manual setup.
 * 
 * Architecture Note:
 * The seed service checks if data already exists before seeding.
 * It NEVER overwrites existing user data, making it safe to call on every app launch.
 */

import { getCategoryRepository, getTransactionRepository, getWalletRepository } from '../../core/di';
import { asyncStorageAdapter } from '../storage';
import { StorageKeys } from '../storage/StorageKeys';
import { defaultCategories, defaultWallets } from './seedData';

/**
 * Result of seed initialization
 */
export interface SeedResult {
    success: boolean;
    walletsCreated: number;
    categoriesCreated: number;
    error?: string;
}

/**
 * Check if seed data has already been initialized
 */
async function isSeedInitialized(): Promise<boolean> {
    try {
        const initialized = await asyncStorageAdapter.get<boolean>(StorageKeys.SEED_INITIALIZED);
        return initialized === true;
    } catch (error) {
        // If we can't read the flag, assume not initialized
        return false;
    }
}

/**
 * Mark seed data as initialized
 */
async function markSeedInitialized(): Promise<void> {
    await asyncStorageAdapter.set(StorageKeys.SEED_INITIALIZED, true);
}

/**
 * Initialize seed data if not already done
 * 
 * This function:
 * 1. Checks if seed data has already been initialized
 * 2. If not, creates default wallets and categories
 * 3. Marks the seed as initialized to prevent future runs
 * 
 * @returns Promise resolving to seed result
 */
export async function initializeSeedData(): Promise<SeedResult> {
    try {
        // Check if already initialized
        if (await isSeedInitialized()) {
            return {
                success: true,
                walletsCreated: 0,
                categoriesCreated: 0,
            };
        }

        const walletRepo = getWalletRepository();
        const categoryRepo = getCategoryRepository();

        // Create default wallets
        let walletsCreated = 0;
        for (const walletDTO of defaultWallets) {
            try {
                await walletRepo.create(walletDTO);
                walletsCreated++;
            } catch (error) {
                console.error('Failed to create default wallet:', walletDTO.name, error);
            }
        }

        // Create default categories
        let categoriesCreated = 0;
        for (const categoryDTO of defaultCategories) {
            try {
                await categoryRepo.create(categoryDTO);
                categoriesCreated++;
            } catch (error) {
                console.error('Failed to create default category:', categoryDTO.name, error);
            }
        }

        // Mark as initialized
        await markSeedInitialized();

        return {
            success: true,
            walletsCreated,
            categoriesCreated,
        };
    } catch (error) {
        console.error('Failed to initialize seed data:', error);

        return {
            success: false,
            walletsCreated: 0,
            categoriesCreated: 0,
            error: error instanceof Error ? error.message : 'Unknown error',
        };
    }
}

/**
 * Reset seed initialization flag (useful for testing or re-seeding)
 * WARNING: This does not delete existing data, only resets the flag
 */
export async function resetSeedFlag(): Promise<void> {
    await asyncStorageAdapter.remove(StorageKeys.SEED_INITIALIZED);
}

/**
 * Check if storage has any data
 * This is a safety check to ensure we don't override user data
 */
export async function hasExistingData(): Promise<boolean> {
    const walletRepo = getWalletRepository();
    const categoryRepo = getCategoryRepository();
    const transactionRepo = getTransactionRepository();

    const [wallets, categories, transactions] = await Promise.all([
        walletRepo.getAll(),
        categoryRepo.getAll(),
        transactionRepo.getAll(),
    ]);

    return wallets.length > 0 || categories.length > 0 || transactions.length > 0;
}
