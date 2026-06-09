/**
 * Transaction Repository
 *
 * Repository for managing Transaction entities, backed by relational SQLite.
 * Handles CRUD and transaction-specific queries.
 *
 * Data Integrity:
 * - Validates all entities before persistence via TransactionValidator
 * - Supports pagination via getTransactionsPage()
 */

import { v4 as uuidv4 } from 'uuid';
import {
    CreateTransactionDTO,
    Transaction,
    TransactionType,
    UpdateTransactionDTO,
} from '../../domain/entities/Transaction';
import { validateTransaction } from '../../domain/validators/TransactionValidator';
import { ValidationError } from '../../domain/validators/ValidationError';
import {
    sqlDelete,
    sqlExists,
    sqlGetAll,
    sqlGetById,
    sqlInsert,
    sqlUpdate,
    transactionMapper,
} from '../storage/sql/mappers';
import type { SqlDatabase } from '../storage/sql/SqlDatabase';
import type { ITransactionRepository } from '../../domain/repositories';
import { RepositoryError, RepositoryErrorType } from './IRepository';

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

export class TransactionRepository implements ITransactionRepository {
    constructor(private db: SqlDatabase) { }

    async getAll(): Promise<Transaction[]> {
        try {
            return await sqlGetAll(this.db, transactionMapper);
        } catch (error) {
            throw new RepositoryError(RepositoryErrorType.STORAGE_ERROR, 'Failed to get all transactions', error as Error);
        }
    }

    async getById(id: string): Promise<Transaction | null> {
        try {
            return await sqlGetById(this.db, transactionMapper, id);
        } catch (error) {
            throw new RepositoryError(RepositoryErrorType.STORAGE_ERROR, `Failed to get transaction with id: ${id}`, error as Error);
        }
    }

    /**
     * Get a page of transactions, sorted by date descending.
     */
    async getTransactionsPage(page: number, limit: number): Promise<PaginatedResult<Transaction>> {
        try {
            const all = await this.getAll();
            const sorted = all.sort((a, b) => b.date.getTime() - a.date.getTime());

            const total = sorted.length;
            const start = (page - 1) * limit;
            const data = sorted.slice(start, start + limit);

            return { data, page, limit, total, hasMore: start + limit < total };
        } catch (error) {
            throw new RepositoryError(RepositoryErrorType.STORAGE_ERROR, 'Failed to get transactions page', error as Error);
        }
    }

    async getCount(): Promise<number> {
        const { rows } = await this.db.execute(`SELECT COUNT(*) AS count FROM transactions`);
        return Number(rows[0]?.count ?? 0);
    }

    async save(transaction: Transaction): Promise<Transaction> {
        try {
            try {
                validateTransaction(transaction);
            } catch (error) {
                if (error instanceof ValidationError) {
                    console.error(`[TransactionRepository] Validation failed: ${error.message}`);
                    throw new RepositoryError(RepositoryErrorType.VALIDATION_ERROR, error.message);
                }
                throw error;
            }

            if (await sqlExists(this.db, transactionMapper, transaction.id)) {
                throw new RepositoryError(
                    RepositoryErrorType.DUPLICATE_ERROR,
                    `Transaction with id ${transaction.id} already exists`,
                );
            }

            await sqlInsert(this.db, transactionMapper, transaction);
            return transaction;
        } catch (error) {
            if (error instanceof RepositoryError) throw error;
            console.error('[TransactionRepository] Unexpected save failure:', error);
            throw new RepositoryError(RepositoryErrorType.STORAGE_ERROR, 'Failed to save transaction', error as Error);
        }
    }

    async update(transaction: Transaction): Promise<Transaction> {
        try {
            try {
                validateTransaction(transaction);
            } catch (error) {
                if (error instanceof ValidationError) {
                    console.error(`[TransactionRepository] Validation failed: ${error.message}`);
                    throw new RepositoryError(RepositoryErrorType.VALIDATION_ERROR, error.message);
                }
                throw error;
            }

            const affected = await sqlUpdate(this.db, transactionMapper, transaction);
            if (affected === 0) {
                throw new RepositoryError(RepositoryErrorType.NOT_FOUND, `Transaction with id ${transaction.id} not found`);
            }
            return transaction;
        } catch (error) {
            if (error instanceof RepositoryError) throw error;
            console.error('[TransactionRepository] Unexpected update failure:', error);
            throw new RepositoryError(RepositoryErrorType.STORAGE_ERROR, 'Failed to update transaction', error as Error);
        }
    }

    async delete(id: string): Promise<void> {
        try {
            const affected = await sqlDelete(this.db, transactionMapper, id);
            if (affected === 0) {
                throw new RepositoryError(RepositoryErrorType.NOT_FOUND, `Transaction with id ${id} not found`);
            }
        } catch (error) {
            if (error instanceof RepositoryError) throw error;
            console.error('[TransactionRepository] Unexpected delete failure:', error);
            throw new RepositoryError(RepositoryErrorType.STORAGE_ERROR, 'Failed to delete transaction', error as Error);
        }
    }

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

    async updateFromDTO(dto: UpdateTransactionDTO): Promise<Transaction> {
        const existing = await this.getById(dto.id);
        if (!existing) {
            throw new RepositoryError(RepositoryErrorType.NOT_FOUND, `Transaction with id ${dto.id} not found`);
        }

        // Ledger integrity guard: a transaction's amount, wallet, type and
        // category determine its signed effect on a wallet balance
        // (see ledgerEffect). Editing any of them here — a plain row UPDATE with
        // no compensating balance adjustment — would silently desync the stored
        // wallet balance from the recomputed ledger. The app exposes no such
        // edit path; reject it so a future caller can't corrupt a balance.
        // Delete + recreate is the supported way to change those fields.
        // (date/note are ledger-neutral and remain editable.)
        const changesLedger =
            (dto.amount !== undefined && dto.amount !== existing.amount) ||
            (dto.walletId !== undefined && dto.walletId !== existing.walletId) ||
            (dto.type !== undefined && dto.type !== existing.type) ||
            (dto.categoryId !== undefined && dto.categoryId !== existing.categoryId);
        if (changesLedger) {
            throw new RepositoryError(
                RepositoryErrorType.VALIDATION_ERROR,
                "Cannot edit a transaction's amount, wallet, type or category: it would " +
                    'desync the wallet balance. Delete and recreate the transaction instead.',
            );
        }

        const updated: Transaction = {
            ...existing,
            date: dto.date ?? existing.date,
            note: dto.note !== undefined ? dto.note : existing.note,
        };

        return this.update(updated);
    }

    // ─── Domain-specific query methods ──────────────────────────────────

    async getByWalletId(walletId: string): Promise<Transaction[]> {
        const transactions = await this.getAll();
        return transactions.filter((t) => t.walletId === walletId);
    }

    async getByCategoryId(categoryId: string): Promise<Transaction[]> {
        const transactions = await this.getAll();
        return transactions.filter((t) => t.categoryId === categoryId);
    }

    async getByType(type: TransactionType): Promise<Transaction[]> {
        const transactions = await this.getAll();
        return transactions.filter((t) => t.type === type);
    }

    async getByDateRange(startDate: Date, endDate: Date): Promise<Transaction[]> {
        const transactions = await this.getAll();
        return transactions.filter((t) => t.date >= startDate && t.date <= endDate);
    }
}
