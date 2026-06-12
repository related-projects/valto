/**
 * RecurringTransaction Repository
 *
 * Repository for managing RecurringTransaction rule entities, backed by
 * relational SQLite. Handles CRUD and rule-specific queries.
 *
 * Data Integrity:
 * - Validates all entities before persistence via RecurringTransactionValidator
 */

import { v4 as uuidv4 } from 'uuid';
import {
    CreateRecurringTransactionDTO,
    RecurringTransaction,
    UpdateRecurringTransactionDTO,
} from '../../domain/entities/RecurringTransaction';
import { validateRecurringTransaction } from '../../domain/validators/RecurringTransactionValidator';
import { ValidationError } from '../../domain/validators/ValidationError';
import {
    recurringMapper,
    sqlDelete,
    sqlExists,
    sqlGetAll,
    sqlGetById,
    sqlInsert,
    sqlUpdate,
} from '../storage/sql/mappers';
import type { SqlDatabase } from '../storage/sql/SqlDatabase';
import type { IRepository } from './IRepository';
import { RepositoryError, RepositoryErrorType } from './IRepository';

export class RecurringTransactionRepository implements IRepository<RecurringTransaction> {
    constructor(private db: SqlDatabase) { }

    async getAll(): Promise<RecurringTransaction[]> {
        try {
            return await sqlGetAll(this.db, recurringMapper);
        } catch (error) {
            throw new RepositoryError(RepositoryErrorType.STORAGE_ERROR, 'Failed to get all recurring rules', error as Error);
        }
    }

    async getById(id: string): Promise<RecurringTransaction | null> {
        return sqlGetById(this.db, recurringMapper, id);
    }

    async getActiveRules(): Promise<RecurringTransaction[]> {
        const rules = await this.getAll();
        const now = new Date();
        return rules.filter((r) => !r.isPaused && (!r.endDate || r.endDate > now));
    }

    async save(rule: RecurringTransaction): Promise<RecurringTransaction> {
        try {
            try {
                validateRecurringTransaction(rule);
            } catch (error) {
                if (error instanceof ValidationError) {
                    console.error(`[RecurringTransactionRepository] Validation failed: ${error.message}`);
                    throw new RepositoryError(RepositoryErrorType.VALIDATION_ERROR, error.message);
                }
                throw error;
            }

            if (await sqlExists(this.db, recurringMapper, rule.id)) {
                throw new RepositoryError(
                    RepositoryErrorType.DUPLICATE_ERROR,
                    `Recurring rule with id ${rule.id} already exists`,
                );
            }

            await sqlInsert(this.db, recurringMapper, rule);
            return rule;
        } catch (error) {
            if (error instanceof RepositoryError) throw error;
            console.error('[RecurringTransactionRepository] Unexpected save failure:', error);
            throw new RepositoryError(RepositoryErrorType.STORAGE_ERROR, 'Failed to save recurring rule', error as Error);
        }
    }

    async update(rule: RecurringTransaction): Promise<RecurringTransaction> {
        try {
            try {
                validateRecurringTransaction(rule);
            } catch (error) {
                if (error instanceof ValidationError) {
                    console.error(`[RecurringTransactionRepository] Validation failed: ${error.message}`);
                    throw new RepositoryError(RepositoryErrorType.VALIDATION_ERROR, error.message);
                }
                throw error;
            }

            const affected = await sqlUpdate(this.db, recurringMapper, rule);
            if (affected === 0) {
                throw new RepositoryError(RepositoryErrorType.NOT_FOUND, `Recurring rule with id ${rule.id} not found`);
            }
            return rule;
        } catch (error) {
            if (error instanceof RepositoryError) throw error;
            console.error('[RecurringTransactionRepository] Unexpected update failure:', error);
            throw new RepositoryError(RepositoryErrorType.STORAGE_ERROR, 'Failed to update recurring rule', error as Error);
        }
    }

    async delete(id: string): Promise<void> {
        try {
            const affected = await sqlDelete(this.db, recurringMapper, id);
            if (affected === 0) {
                throw new RepositoryError(RepositoryErrorType.NOT_FOUND, `Recurring rule with id ${id} not found`);
            }
        } catch (error) {
            if (error instanceof RepositoryError) throw error;
            console.error('[RecurringTransactionRepository] Unexpected delete failure:', error);
            throw new RepositoryError(RepositoryErrorType.STORAGE_ERROR, 'Failed to delete recurring rule', error as Error);
        }
    }

    async create(dto: CreateRecurringTransactionDTO): Promise<RecurringTransaction> {
        const now = new Date();
        const rule: RecurringTransaction = {
            id: uuidv4(),
            type: dto.type,
            amount: dto.amount,
            walletId: dto.walletId,
            categoryId: dto.categoryId,
            description: dto.description,
            startDate: dto.startDate,
            endDate: dto.endDate,
            frequency: dto.frequency,
            interval: dto.interval,
            // Watermark one interval before startDate so the first generation includes startDate.
            lastGeneratedDate: this.computeDateBefore(dto.startDate, dto.frequency, dto.interval),
            isPaused: false,
            createdAt: now,
        };

        return this.save(rule);
    }

    async updateFromDTO(dto: UpdateRecurringTransactionDTO): Promise<RecurringTransaction> {
        const existing = await this.getById(dto.id);
        if (!existing) {
            throw new RepositoryError(RepositoryErrorType.NOT_FOUND, `Recurring rule with id ${dto.id} not found`);
        }

        const updated: RecurringTransaction = {
            ...existing,
            type: dto.type ?? existing.type,
            amount: dto.amount ?? existing.amount,
            walletId: dto.walletId ?? existing.walletId,
            categoryId: dto.categoryId ?? existing.categoryId,
            description: dto.description !== undefined ? dto.description : existing.description,
            endDate: dto.endDate !== undefined ? (dto.endDate ?? undefined) : existing.endDate,
            frequency: dto.frequency ?? existing.frequency,
            interval: dto.interval ?? existing.interval,
        };

        return this.update(updated);
    }

    async pauseRule(id: string): Promise<RecurringTransaction> {
        const rule = await this.getById(id);
        if (!rule) {
            throw new RepositoryError(RepositoryErrorType.NOT_FOUND, `Recurring rule with id ${id} not found`);
        }
        return this.update({ ...rule, isPaused: true });
    }

    async resumeRule(id: string): Promise<RecurringTransaction> {
        const rule = await this.getById(id);
        if (!rule) {
            throw new RepositoryError(RepositoryErrorType.NOT_FOUND, `Recurring rule with id ${id} not found`);
        }
        return this.update({ ...rule, isPaused: false });
    }

    async updateLastGeneratedDate(id: string, date: Date): Promise<RecurringTransaction> {
        const rule = await this.getById(id);
        if (!rule) {
            throw new RepositoryError(RepositoryErrorType.NOT_FOUND, `Recurring rule with id ${id} not found`);
        }
        return this.update({ ...rule, lastGeneratedDate: date });
    }

    // ─── Helpers ────────────────────────────────────────────────────────

    private computeDateBefore(date: Date, frequency: string, interval: number): Date {
        const d = new Date(date);
        switch (frequency) {
            case 'daily':
                d.setDate(d.getDate() - interval);
                break;
            case 'weekly':
                d.setDate(d.getDate() - 7 * interval);
                break;
            case 'monthly':
                d.setMonth(d.getMonth() - interval);
                break;
            case 'yearly':
                d.setFullYear(d.getFullYear() - interval);
                break;
        }
        return d;
    }
}
