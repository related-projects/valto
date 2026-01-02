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
import { IStorage, StorageKeys } from '../storage';
import { IRepository, RepositoryError, RepositoryErrorType } from './IRepository';

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
     * Save a new transaction
     */
    async save(transaction: Transaction): Promise<Transaction> {
        try {
            const transactions = await this.getAll();

            // Check for duplicate ID
            if (transactions.some(t => t.id === transaction.id)) {
                throw new RepositoryError(
                    RepositoryErrorType.DUPLICATE_ERROR,
                    `Transaction with id ${transaction.id} already exists`
                );
            }

            transactions.push(transaction);

            const serialized = transactions.map(serializeTransaction);
            await this.storage.set(StorageKeys.TRANSACTIONS, serialized);

            return transaction;
        } catch (error) {
            if (error instanceof RepositoryError) {
                throw error;
            }

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
