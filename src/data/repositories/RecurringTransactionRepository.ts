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
import { addMonthsClamped } from '../../domain/calculations/recurrenceDates';
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
import type { IRecurringTransactionRepository } from '../../domain/repositories';
import type { IRepository } from './IRepository';
import { RepositoryError, RepositoryErrorType } from './IRepository';

export class RecurringTransactionRepository
    implements IRepository<RecurringTransaction>, IRecurringTransactionRepository {
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

    /**
     * Every rule drawing on a given wallet, paused and expired ones included.
     *
     * Built on getAll, NOT on getActiveRules: this answers "does anything still
     * point here", which is a different question from "what executes now". A
     * paused rule is still a standing order - see IRecurringTransactionRepository.
     */
    async getByWalletId(walletId: string): Promise<RecurringTransaction[]> {
        const rules = await this.getAll();
        return rules.filter((r) => r.walletId === walletId);
    }

    /** Every rule filing against a given category, paused and expired included. */
    async getByCategoryId(categoryId: string): Promise<RecurringTransaction[]> {
        const rules = await this.getAll();
        return rules.filter((r) => r.categoryId === categoryId);
    }

    /**
     * Every rule whose wallet or category no longer exists.
     *
     * The two queries above ask "what still points HERE" and are what the
     * deletion guards need. This asks the same question of the whole table at
     * once, which is what a restore needs: the deletion guards can only refuse a
     * delete the user is making now, and a restore replaces the wallet and
     * category tables wholesale without going near them.
     *
     * Neither reference has a FOREIGN KEY behind it, so this is the only way to
     * learn a rule has been orphaned. Distinct from the engine's per-rule
     * pre-flight, which sees a rule only once something is due for it: a rule
     * whose next occurrence is months away is just as broken and says nothing.
     *
     * Paused and expired rules are included, for the reason set out on
     * IRecurringTransactionRepository: `is_paused` records when a rule runs, not
     * whether it exists.
     */
    async findWithMissingReferences(): Promise<RecurringTransaction[]> {
        try {
            const { rows } = await this.db.execute(
                `SELECT r.* FROM recurring_rules r
                 WHERE NOT EXISTS (SELECT 1 FROM wallets w    WHERE w.id = r.wallet_id)
                    OR NOT EXISTS (SELECT 1 FROM categories c WHERE c.id = r.category_id)`,
            );
            return rows.map(recurringMapper.fromRow);
        } catch (error) {
            throw new RepositoryError(
                RepositoryErrorType.STORAGE_ERROR,
                'Failed to check recurring rule references',
                error as Error,
            );
        }
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

    /**
     * Step one interval backwards from `date` to place the initial watermark.
     *
     * `date` is always the rule's startDate, so its day of the month IS the anchor day.
     * Monthly and yearly steps go through addMonthsClamped: stepping back a month from
     * 31 March lands on the last day of February, not on 3 March, which is where
     * setMonth's silent overflow used to put it. Same clamping rule as the forward
     * direction in the engine - see addMonthsClamped.
     */
    private computeDateBefore(date: Date, frequency: string, interval: number): Date {
        const anchorDay = date.getDate();
        const d = new Date(date);
        switch (frequency) {
            case 'daily':
                d.setDate(d.getDate() - interval);
                break;
            case 'weekly':
                d.setDate(d.getDate() - 7 * interval);
                break;
            case 'monthly':
                return addMonthsClamped(date, -interval, anchorDay);
            case 'yearly':
                return addMonthsClamped(date, -12 * interval, anchorDay);
        }
        return d;
    }
}
