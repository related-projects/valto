/**
 * Wallet Repository
 * 
 * Repository for managing Wallet entities.
 * Handles CRUD operations and wallet-specific business logic.
 * 
 * Architecture Note:
 * This repository manages wallet persistence and provides methods for
 * balance management. It enforces business rules like balance validation.
 * 
 * Data Integrity:
 * - Validates all entities before persistence via WalletValidator
 * - Retains validateWalletBalance as additional business rule check
 * - Safe writes: on failure, previous valid state is preserved
 */

import { v4 as uuidv4 } from 'uuid';
import {
    CreateWalletDTO,
    deserializeWallet,
    SerializableWallet,
    serializeWallet,
    UpdateWalletDTO,
    validateWalletBalance,
    Wallet,
    WalletType,
} from '../../domain/entities/Wallet';
import { ValidationError } from '../../domain/validators/ValidationError';
import { validateWallet } from '../../domain/validators/WalletValidator';
import { IStorage, StorageKeys } from '../storage';
import { IRepository, RepositoryError, RepositoryErrorType } from './IRepository';

/**
 * Wallet repository implementation
 */
export class WalletRepository implements IRepository<Wallet> {
    constructor(private storage: IStorage) { }

    /**
     * Get all wallets
     */
    async getAll(): Promise<Wallet[]> {
        try {
            const data = await this.storage.get<SerializableWallet[]>(StorageKeys.WALLETS);

            if (!data) {
                return [];
            }

            return data.map(deserializeWallet);
        } catch (error) {
            throw new RepositoryError(
                RepositoryErrorType.STORAGE_ERROR,
                'Failed to get all wallets',
                error as Error
            );
        }
    }

    /**
     * Get a wallet by ID
     */
    async getById(id: string): Promise<Wallet | null> {
        try {
            const wallets = await this.getAll();
            return wallets.find(w => w.id === id) || null;
        } catch (error) {
            throw new RepositoryError(
                RepositoryErrorType.STORAGE_ERROR,
                `Failed to get wallet with id: ${id}`,
                error as Error
            );
        }
    }

    /**
     * Save a new wallet
     */
    async save(wallet: Wallet): Promise<Wallet> {
        try {
            // Full entity validation
            try {
                validateWallet(wallet);
            } catch (error) {
                if (error instanceof ValidationError) {
                    console.error(`[WalletRepository] Validation failed: ${error.message}`);
                    throw new RepositoryError(RepositoryErrorType.VALIDATION_ERROR, error.message);
                }
                throw error;
            }

            // Business rule: balance constraints
            if (!validateWalletBalance(wallet)) {
                throw new RepositoryError(
                    RepositoryErrorType.VALIDATION_ERROR,
                    `${wallet.type} wallets cannot have negative balance`
                );
            }

            const wallets = await this.getAll();

            // Check for duplicate ID
            if (wallets.some(w => w.id === wallet.id)) {
                throw new RepositoryError(
                    RepositoryErrorType.DUPLICATE_ERROR,
                    `Wallet with id ${wallet.id} already exists`
                );
            }

            wallets.push(wallet);

            const serialized = wallets.map(serializeWallet);
            await this.storage.set(StorageKeys.WALLETS, serialized);

            return wallet;
        } catch (error) {
            if (error instanceof RepositoryError) {
                throw error;
            }

            console.error('[WalletRepository] Unexpected save failure — previous state preserved:', error);
            throw new RepositoryError(
                RepositoryErrorType.STORAGE_ERROR,
                'Failed to save wallet',
                error as Error
            );
        }
    }

    /**
     * Update an existing wallet
     */
    async update(wallet: Wallet): Promise<Wallet> {
        try {
            // Full entity validation
            try {
                validateWallet(wallet);
            } catch (error) {
                if (error instanceof ValidationError) {
                    console.error(`[WalletRepository] Validation failed: ${error.message}`);
                    throw new RepositoryError(RepositoryErrorType.VALIDATION_ERROR, error.message);
                }
                throw error;
            }

            // Business rule: balance constraints
            if (!validateWalletBalance(wallet)) {
                throw new RepositoryError(
                    RepositoryErrorType.VALIDATION_ERROR,
                    `${wallet.type} wallets cannot have negative balance`
                );
            }

            const wallets = await this.getAll();
            const index = wallets.findIndex(w => w.id === wallet.id);

            if (index === -1) {
                throw new RepositoryError(
                    RepositoryErrorType.NOT_FOUND,
                    `Wallet with id ${wallet.id} not found`
                );
            }

            wallets[index] = wallet;

            const serialized = wallets.map(serializeWallet);
            await this.storage.set(StorageKeys.WALLETS, serialized);

            return wallet;
        } catch (error) {
            if (error instanceof RepositoryError) {
                throw error;
            }

            console.error('[WalletRepository] Unexpected update failure — previous state preserved:', error);
            throw new RepositoryError(
                RepositoryErrorType.STORAGE_ERROR,
                'Failed to update wallet',
                error as Error
            );
        }
    }

    /**
     * Delete a wallet
     */
    async delete(id: string): Promise<void> {
        try {
            const wallets = await this.getAll();
            const filtered = wallets.filter(w => w.id !== id);

            if (filtered.length === wallets.length) {
                throw new RepositoryError(
                    RepositoryErrorType.NOT_FOUND,
                    `Wallet with id ${id} not found`
                );
            }

            const serialized = filtered.map(serializeWallet);
            await this.storage.set(StorageKeys.WALLETS, serialized);
        } catch (error) {
            if (error instanceof RepositoryError) {
                throw error;
            }

            throw new RepositoryError(
                RepositoryErrorType.STORAGE_ERROR,
                'Failed to delete wallet',
                error as Error
            );
        }
    }

    /**
     * Create a new wallet from DTO
     */
    async create(dto: CreateWalletDTO): Promise<Wallet> {
        const wallet: Wallet = {
            id: uuidv4(),
            name: dto.name,
            balance: dto.balance,
            type: dto.type,
            color: dto.color,
            createdAt: new Date(),
        };

        return this.save(wallet);
    }

    /**
     * Update wallet from DTO
     */
    async updateFromDTO(dto: UpdateWalletDTO): Promise<Wallet> {
        const existing = await this.getById(dto.id);

        if (!existing) {
            throw new RepositoryError(
                RepositoryErrorType.NOT_FOUND,
                `Wallet with id ${dto.id} not found`
            );
        }

        const updated: Wallet = {
            ...existing,
            name: dto.name ?? existing.name,
            balance: dto.balance ?? existing.balance,
            type: dto.type ?? existing.type,
            color: dto.color !== undefined ? dto.color : existing.color,
        };

        return this.update(updated);
    }

    // Domain-specific methods

    /**
     * Update wallet balance
     * @param id Wallet ID
     * @param amount Amount to add (positive) or subtract (negative)
     */
    async updateBalance(id: string, amount: number): Promise<Wallet> {
        const wallet = await this.getById(id);

        if (!wallet) {
            throw new RepositoryError(
                RepositoryErrorType.NOT_FOUND,
                `Wallet with id ${id} not found`
            );
        }

        const updated: Wallet = {
            ...wallet,
            balance: wallet.balance + amount,
        };

        return this.update(updated);
    }

    /**
     * Get wallets by type
     */
    async getByType(type: WalletType): Promise<Wallet[]> {
        const wallets = await this.getAll();
        return wallets.filter(w => w.type === type);
    }

    /**
     * Get total balance across all wallets
     */
    async getTotalBalance(): Promise<number> {
        const wallets = await this.getAll();
        return wallets.reduce((sum, wallet) => sum + wallet.balance, 0);
    }
}
