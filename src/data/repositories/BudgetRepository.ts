/**
 * Budget Repository
 *
 * Repository for managing Budget entities, backed by relational SQLite.
 * Enforces business rules:
 * - Only one budget per category per month
 * - Valid YYYY-MM month format and positive limit
 */

import { v4 as uuidv4 } from 'uuid';
import {
    Budget,
    CreateBudgetDTO,
    isValidBudgetMonth,
    UpdateBudgetDTO,
} from '../../domain/entities/Budget';
import {
    budgetMapper,
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

export class BudgetRepository implements IRepository<Budget> {
    constructor(private db: SqlDatabase) { }

    async getAll(): Promise<Budget[]> {
        try {
            return await sqlGetAll(this.db, budgetMapper);
        } catch (error) {
            throw new RepositoryError(RepositoryErrorType.STORAGE_ERROR, 'Failed to get all budgets', error as Error);
        }
    }

    async getById(id: string): Promise<Budget | null> {
        try {
            return await sqlGetById(this.db, budgetMapper, id);
        } catch (error) {
            throw new RepositoryError(RepositoryErrorType.STORAGE_ERROR, `Failed to get budget with id: ${id}`, error as Error);
        }
    }

    async save(budget: Budget): Promise<Budget> {
        try {
            if (await sqlExists(this.db, budgetMapper, budget.id)) {
                throw new RepositoryError(
                    RepositoryErrorType.DUPLICATE_ERROR,
                    `Budget with id ${budget.id} already exists`,
                );
            }

            // One budget per category + month.
            const existing = await this.getByCategoryAndMonth(budget.categoryId, budget.month);
            if (existing) {
                throw new RepositoryError(
                    RepositoryErrorType.DUPLICATE_ERROR,
                    'A budget already exists for this category and month',
                );
            }

            await sqlInsert(this.db, budgetMapper, budget);
            return budget;
        } catch (error) {
            if (error instanceof RepositoryError) throw error;
            throw new RepositoryError(RepositoryErrorType.STORAGE_ERROR, 'Failed to save budget', error as Error);
        }
    }

    async update(budget: Budget): Promise<Budget> {
        try {
            const affected = await sqlUpdate(this.db, budgetMapper, budget);
            if (affected === 0) {
                throw new RepositoryError(RepositoryErrorType.NOT_FOUND, `Budget with id ${budget.id} not found`);
            }
            return budget;
        } catch (error) {
            if (error instanceof RepositoryError) throw error;
            throw new RepositoryError(RepositoryErrorType.STORAGE_ERROR, 'Failed to update budget', error as Error);
        }
    }

    async delete(id: string): Promise<void> {
        try {
            const affected = await sqlDelete(this.db, budgetMapper, id);
            if (affected === 0) {
                throw new RepositoryError(RepositoryErrorType.NOT_FOUND, `Budget with id ${id} not found`);
            }
        } catch (error) {
            if (error instanceof RepositoryError) throw error;
            throw new RepositoryError(RepositoryErrorType.STORAGE_ERROR, 'Failed to delete budget', error as Error);
        }
    }

    async create(dto: CreateBudgetDTO): Promise<Budget> {
        if (!isValidBudgetMonth(dto.month)) {
            throw new RepositoryError(
                RepositoryErrorType.VALIDATION_ERROR,
                `Invalid month format: ${dto.month}. Expected YYYY-MM.`,
            );
        }
        if (dto.limitAmount <= 0) {
            throw new RepositoryError(RepositoryErrorType.VALIDATION_ERROR, 'Budget limit must be a positive number');
        }

        const now = new Date();
        const budget: Budget = {
            id: uuidv4(),
            categoryId: dto.categoryId,
            month: dto.month,
            limitAmount: dto.limitAmount,
            createdAt: now,
            updatedAt: now,
        };

        return this.save(budget);
    }

    async updateFromDTO(dto: UpdateBudgetDTO): Promise<Budget> {
        const existing = await this.getById(dto.id);
        if (!existing) {
            throw new RepositoryError(RepositoryErrorType.NOT_FOUND, `Budget with id ${dto.id} not found`);
        }

        if (dto.month && !isValidBudgetMonth(dto.month)) {
            throw new RepositoryError(
                RepositoryErrorType.VALIDATION_ERROR,
                `Invalid month format: ${dto.month}. Expected YYYY-MM.`,
            );
        }
        if (dto.limitAmount !== undefined && dto.limitAmount <= 0) {
            throw new RepositoryError(RepositoryErrorType.VALIDATION_ERROR, 'Budget limit must be a positive number');
        }

        const updated: Budget = {
            ...existing,
            categoryId: dto.categoryId ?? existing.categoryId,
            month: dto.month ?? existing.month,
            limitAmount: dto.limitAmount ?? existing.limitAmount,
            updatedAt: new Date(),
        };

        return this.update(updated);
    }

    // ─── Domain-specific query methods ──────────────────────────────────

    async getByMonth(month: string): Promise<Budget[]> {
        const budgets = await this.getAll();
        return budgets.filter((b) => b.month === month);
    }

    async getByCategoryAndMonth(categoryId: string, month: string): Promise<Budget | null> {
        const budgets = await this.getAll();
        return budgets.find((b) => b.categoryId === categoryId && b.month === month) || null;
    }
}
