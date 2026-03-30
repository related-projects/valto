/**
 * RecurringTransaction Repository
 *
 * Repository for managing RecurringTransaction rule entities.
 * Handles CRUD operations and rule-specific queries.
 *
 * Data Integrity:
 * - Validates all entities before persistence via RecurringTransactionValidator
 * - Safe writes: on failure, previous valid state is preserved
 */

import { v4 as uuidv4 } from 'uuid';
import {
    CreateRecurringTransactionDTO,
    deserializeRecurringTransaction,
    RecurringTransaction,
    SerializableRecurringTransaction,
    serializeRecurringTransaction,
    UpdateRecurringTransactionDTO,
} from '../../domain/entities/RecurringTransaction';
import { validateRecurringTransaction } from '../../domain/validators/RecurringTransactionValidator';
import { ValidationError } from '../../domain/validators/ValidationError';
import { IStorage, StorageKeys } from '../storage';
import { IRepository, RepositoryError, RepositoryErrorType } from './IRepository';

/**
 * RecurringTransaction repository implementation
 */
export class RecurringTransactionRepository implements IRepository<RecurringTransaction> {
    constructor(private storage: IStorage) {}

    /**
     * Get all recurring transaction rules
     */
    async getAll(): Promise<RecurringTransaction[]> {
        try {
            const data = await this.storage.get<SerializableRecurringTransaction[]>(
                StorageKeys.RECURRING_RULES,
            );
            if (!data) return [];
            return data.map(deserializeRecurringTransaction);
        } catch (error) {
            throw new RepositoryError(
                RepositoryErrorType.STORAGE_ERROR,
                'Failed to get all recurring rules',
                error as Error,
            );
        }
    }

    /**
     * Get a rule by ID
     */
    async getById(id: string): Promise<RecurringTransaction | null> {
        const rules = await this.getAll();
        return rules.find(r => r.id === id) || null;
    }

    /**
     * Get only active (non-paused, non-expired) rules
     */
    async getActiveRules(): Promise<RecurringTransaction[]> {
        const rules = await this.getAll();
        const now = new Date();
        return rules.filter(r => !r.isPaused && (!r.endDate || r.endDate > now));
    }

    /**
     * Save a new rule
     */
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

            const rules = await this.getAll();

            if (rules.some(r => r.id === rule.id)) {
                throw new RepositoryError(
                    RepositoryErrorType.DUPLICATE_ERROR,
                    `Recurring rule with id ${rule.id} already exists`,
                );
            }

            rules.push(rule);
            const serialized = rules.map(serializeRecurringTransaction);
            await this.storage.set(StorageKeys.RECURRING_RULES, serialized);

            return rule;
        } catch (error) {
            if (error instanceof RepositoryError) throw error;
            console.error('[RecurringTransactionRepository] Unexpected save failure — previous state preserved:', error);
            throw new RepositoryError(RepositoryErrorType.STORAGE_ERROR, 'Failed to save recurring rule', error as Error);
        }
    }

    /**
     * Update an existing rule
     */
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

            const rules = await this.getAll();
            const index = rules.findIndex(r => r.id === rule.id);

            if (index === -1) {
                throw new RepositoryError(
                    RepositoryErrorType.NOT_FOUND,
                    `Recurring rule with id ${rule.id} not found`,
                );
            }

            rules[index] = rule;
            const serialized = rules.map(serializeRecurringTransaction);
            await this.storage.set(StorageKeys.RECURRING_RULES, serialized);

            return rule;
        } catch (error) {
            if (error instanceof RepositoryError) throw error;
            console.error('[RecurringTransactionRepository] Unexpected update failure — previous state preserved:', error);
            throw new RepositoryError(RepositoryErrorType.STORAGE_ERROR, 'Failed to update recurring rule', error as Error);
        }
    }

    /**
     * Delete a rule by ID
     */
    async delete(id: string): Promise<void> {
        try {
            const rules = await this.getAll();
            const filtered = rules.filter(r => r.id !== id);

            if (filtered.length === rules.length) {
                throw new RepositoryError(
                    RepositoryErrorType.NOT_FOUND,
                    `Recurring rule with id ${id} not found`,
                );
            }

            const serialized = filtered.map(serializeRecurringTransaction);
            await this.storage.set(StorageKeys.RECURRING_RULES, serialized);
        } catch (error) {
            if (error instanceof RepositoryError) throw error;
            console.error('[RecurringTransactionRepository] Unexpected delete failure — previous state preserved:', error);
            throw new RepositoryError(RepositoryErrorType.STORAGE_ERROR, 'Failed to delete recurring rule', error as Error);
        }
    }

    /**
     * Create a new rule from DTO
     */
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
            // Set watermark to one interval before startDate so the first generation includes startDate
            lastGeneratedDate: this.computeDateBefore(dto.startDate, dto.frequency, dto.interval),
            isPaused: false,
            createdAt: now,
        };

        return this.save(rule);
    }

    /**
     * Update a rule from DTO (does NOT retroactively modify past transactions)
     */
    async updateFromDTO(dto: UpdateRecurringTransactionDTO): Promise<RecurringTransaction> {
        const existing = await this.getById(dto.id);
        if (!existing) {
            throw new RepositoryError(
                RepositoryErrorType.NOT_FOUND,
                `Recurring rule with id ${dto.id} not found`,
            );
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

    /**
     * Pause a rule
     */
    async pauseRule(id: string): Promise<RecurringTransaction> {
        const rule = await this.getById(id);
        if (!rule) {
            throw new RepositoryError(RepositoryErrorType.NOT_FOUND, `Recurring rule with id ${id} not found`);
        }
        return this.update({ ...rule, isPaused: true });
    }

    /**
     * Resume a paused rule
     */
    async resumeRule(id: string): Promise<RecurringTransaction> {
        const rule = await this.getById(id);
        if (!rule) {
            throw new RepositoryError(RepositoryErrorType.NOT_FOUND, `Recurring rule with id ${id} not found`);
        }
        return this.update({ ...rule, isPaused: false });
    }

    /**
     * Update the lastGeneratedDate watermark after generating transactions
     */
    async updateLastGeneratedDate(id: string, date: Date): Promise<RecurringTransaction> {
        const rule = await this.getById(id);
        if (!rule) {
            throw new RepositoryError(RepositoryErrorType.NOT_FOUND, `Recurring rule with id ${id} not found`);
        }
        return this.update({ ...rule, lastGeneratedDate: date });
    }

    // ─── Helpers ──────────────────────────────────────────────────────────

    /**
     * Compute one interval step before the given date.
     * Used to set the initial watermark so the first generation includes startDate.
     */
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
