/**
 * Transaction Repository
 * 
 * Repository for managing Transaction entities.
 * Handles CRUD operations and transaction-specific queries.
 * 
 * Architecture Note:
 * This repository manages the persistence of transactions and provides
 * domain-specific query methods. It uses the storage adapter for actual
 * data persistence, keeping the repository focused on business logic.
 * 
 * Data Integrity:
 * - Validates all entities before persistence via TransactionValidator
 * - Supports pagination via getTransactionsPage()
 * - Safe writes: on failure, previous valid state is preserved
 */

import { v4 as uuidv4 } from 'uuid';
import {
    CreateTransactionDTO,
    deserializeTransaction,
    SerializableTransaction,
    serializeTransaction,
    Transaction,
    TransactionType,
    UpdateTransactionDTO,
} from '../../domain/entities/Transaction';
import { validateTransaction } from '../../domain/validators/TransactionValidator';
import { ValidationError } from '../../domain/validators/ValidationError';
import { IStorage, StorageKeys } from '../storage';
import { IRepository, RepositoryError, RepositoryErrorType } from './IRepository';

/**
 * Paginated result envelope
 */
export interface PaginatedResult<T> {
    data: T[];
    page: number;
    limit: number;
    total: number;
    hasMore: boolean;
}

/**
 * Transaction repository implementation
 */
export class TransactionRepository implements IRepository<Transaction> {
    constructor(private storage: IStorage) { }

    /**
     * Get all transactions
     */
    async getAll(): Promise<Transaction[]> {
        try {
            const data = await this.storage.get<SerializableTransaction[]>(StorageKeys.TRANSACTIONS);

            if (!data) {
                return [];
            }

            return data.map(deserializeTransaction);
        } catch (error) {
            throw new RepositoryError(
                RepositoryErrorType.STORAGE_ERROR,
                'Failed to get all transactions',
                error as Error
            );
        }
    }

    /**
     * Get a transaction by ID
     */
    async getById(id: string): Promise<Transaction | null> {
        try {
            const transactions = await this.getAll();
            return transactions.find(t => t.id === id) || null;
        } catch (error) {
            throw new RepositoryError(
                RepositoryErrorType.STORAGE_ERROR,
                `Failed to get transaction with id: ${id}`,
                error as Error
            );
        }
    }

    /**
     * Get a page of transactions, sorted by date descending.
     * Avoids loading entire dataset into consumer memory.
     * 
     * @param page 1-indexed page number
     * @param limit number of items per page
     */
    async getTransactionsPage(page: number, limit: number): Promise<PaginatedResult<Transaction>> {
        try {
            const all = await this.getAll();
            const sorted = all.sort((a, b) => b.date.getTime() - a.date.getTime());

            const total = sorted.length;
            const start = (page - 1) * limit;
            const data = sorted.slice(start, start + limit);

            return {
                data,
                page,
                limit,
                total,
                hasMore: start + limit < total,
            };
        } catch (error) {
            throw new RepositoryError(
                RepositoryErrorType.STORAGE_ERROR,
                'Failed to get transactions page',
                error as Error
            );
        }
    }

    /**
     * Get total number of transactions
     */
    async getCount(): Promise<number> {
        const all = await this.getAll();
        return all.length;
    }

    /**
     * Save a new transaction
     */
    async save(transaction: Transaction): Promise<Transaction> {
        try {
            // Validate entity before persistence
            try {
                validateTransaction(transaction);
            } catch (error) {
                if (error instanceof ValidationError) {
                    console.error(`[TransactionRepository] Validation failed: ${error.message}`);
                    throw new RepositoryError(
                        RepositoryErrorType.VALIDATION_ERROR,
                        error.message,
                    );
                }
                throw error;
            }

            const transactions = await this.getAll();

            // Check for duplicate ID
            if (transactions.some(t => t.id === transaction.id)) {
                throw new RepositoryError(
                    RepositoryErrorType.DUPLICATE_ERROR,
                    `Transaction with id ${transaction.id} already exists`
                );
            }

            transactions.push(transaction);

            // Safe write: serialize first, then persist
            const serialized = transactions.map(serializeTransaction);
            await this.storage.set(StorageKeys.TRANSACTIONS, serialized);

            return transaction;
        } catch (error) {
            if (error instanceof RepositoryError) {
                throw error;
            }

            // On unexpected failure, log and avoid overwriting valid state
            console.error('[TransactionRepository] Unexpected save failure — previous state preserved:', error);
            throw new RepositoryError(
                RepositoryErrorType.STORAGE_ERROR,
                'Failed to save transaction',
                error as Error
            );
        }
    }

    /**
     * Update an existing transaction
     */
    async update(transaction: Transaction): Promise<Transaction> {
        try {
            // Validate entity before persistence
            try {
                validateTransaction(transaction);
            } catch (error) {
                if (error instanceof ValidationError) {
                    console.error(`[TransactionRepository] Validation failed: ${error.message}`);
                    throw new RepositoryError(
                        RepositoryErrorType.VALIDATION_ERROR,
                        error.message,
                    );
                }
                throw error;
            }

            const transactions = await this.getAll();
            const index = transactions.findIndex(t => t.id === transaction.id);

            if (index === -1) {
                throw new RepositoryError(
                    RepositoryErrorType.NOT_FOUND,
                    `Transaction with id ${transaction.id} not found`
                );
            }

            transactions[index] = transaction;

            const serialized = transactions.map(serializeTransaction);
            await this.storage.set(StorageKeys.TRANSACTIONS, serialized);

            return transaction;
        } catch (error) {
            if (error instanceof RepositoryError) {
                throw error;
            }

            console.error('[TransactionRepository] Unexpected update failure — previous state preserved:', error);
            throw new RepositoryError(
                RepositoryErrorType.STORAGE_ERROR,
                'Failed to update transaction',
                error as Error
            );
        }
    }

    /**
     * Delete a transaction
     */
    async delete(id: string): Promise<void> {
        try {
            const transactions = await this.getAll();
            const filtered = transactions.filter(t => t.id !== id);

            if (filtered.length === transactions.length) {
                throw new RepositoryError(
                    RepositoryErrorType.NOT_FOUND,
                    `Transaction with id ${id} not found`
                );
            }

            const serialized = filtered.map(serializeTransaction);
            await this.storage.set(StorageKeys.TRANSACTIONS, serialized);
        } catch (error) {
            if (error instanceof RepositoryError) {
                throw error;
            }

            console.error('[TransactionRepository] Unexpected delete failure — previous state preserved:', error);
            throw new RepositoryError(
                RepositoryErrorType.STORAGE_ERROR,
                'Failed to delete transaction',
                error as Error
            );
        }
    }

    /**
     * Create a new transaction from DTO
     */
    async create(dto: CreateTransactionDTO): Promise<Transaction> {
        const transaction: Transaction = {
            id: uuidv4(),
            type: dto.type,
            amount: dto.amount,
            categoryId: dto.categoryId,
            walletId: dto.walletId,
            date: dto.date,
            note: dto.note,
            createdAt: new Date(),
        };

        return this.save(transaction);
    }

    /**
     * Update transaction from DTO
     */
    async updateFromDTO(dto: UpdateTransactionDTO): Promise<Transaction> {
        const existing = await this.getById(dto.id);

        if (!existing) {
            throw new RepositoryError(
                RepositoryErrorType.NOT_FOUND,
                `Transaction with id ${dto.id} not found`
            );
        }

        const updated: Transaction = {
            ...existing,
            type: dto.type ?? existing.type,
            amount: dto.amount ?? existing.amount,
            categoryId: dto.categoryId ?? existing.categoryId,
            walletId: dto.walletId ?? existing.walletId,
            date: dto.date ?? existing.date,
            note: dto.note !== undefined ? dto.note : existing.note,
        };

        return this.update(updated);
    }

    // Domain-specific query methods

    /**
     * Get transactions by wallet ID
     */
    async getByWalletId(walletId: string): Promise<Transaction[]> {
        const transactions = await this.getAll();
        return transactions.filter(t => t.walletId === walletId);
    }

    /**
     * Get transactions by category ID
     */
    async getByCategoryId(categoryId: string): Promise<Transaction[]> {
        const transactions = await this.getAll();
        return transactions.filter(t => t.categoryId === categoryId);
    }

    /**
     * Get transactions by type
     */
    async getByType(type: TransactionType): Promise<Transaction[]> {
        const transactions = await this.getAll();
        return transactions.filter(t => t.type === type);
    }

    /**
     * Get transactions within a date range
     */
    async getByDateRange(startDate: Date, endDate: Date): Promise<Transaction[]> {
        const transactions = await this.getAll();
        return transactions.filter(t => t.date >= startDate && t.date <= endDate);
    }
}
