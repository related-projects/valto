/**
 * Budget Repository
 * 
 * Repository for managing Budget entities.
 * Handles CRUD operations and budget-specific queries.
 * 
 * Architecture Note:
 * This repository manages budget persistence and provides methods for
 * querying budgets by month and category. It enforces business rules:
 * - Only one budget per category per month
 * - Only expense categories allowed
 */

import { v4 as uuidv4 } from 'uuid';
import {
    Budget,
    CreateBudgetDTO,
    deserializeBudget,
    isValidBudgetMonth,
    SerializableBudget,
    serializeBudget,
    UpdateBudgetDTO,
} from '../../domain/entities/Budget';
import { IStorage, StorageKeys } from '../storage';
import { IRepository, RepositoryError, RepositoryErrorType } from './IRepository';

/**
 * Budget repository implementation
 */
export class BudgetRepository implements IRepository<Budget> {
    constructor(private storage: IStorage) { }

    /**
     * Get all budgets
     */
    async getAll(): Promise<Budget[]> {
        try {
            const data = await this.storage.get<SerializableBudget[]>(StorageKeys.BUDGETS);

            if (!data) {
                return [];
            }

            return data.map(deserializeBudget);
        } catch (error) {
            throw new RepositoryError(
                RepositoryErrorType.STORAGE_ERROR,
                'Failed to get all budgets',
                error as Error
            );
        }
    }

    /**
     * Get a budget by ID
     */
    async getById(id: string): Promise<Budget | null> {
        try {
            const budgets = await this.getAll();
            return budgets.find(b => b.id === id) || null;
        } catch (error) {
            throw new RepositoryError(
                RepositoryErrorType.STORAGE_ERROR,
                `Failed to get budget with id: ${id}`,
                error as Error
            );
        }
    }

    /**
     * Save a new budget
     */
    async save(budget: Budget): Promise<Budget> {
        try {
            const budgets = await this.getAll();

            // Check for duplicate ID
            if (budgets.some(b => b.id === budget.id)) {
                throw new RepositoryError(
                    RepositoryErrorType.DUPLICATE_ERROR,
                    `Budget with id ${budget.id} already exists`
                );
            }

            // Check for duplicate category+month
            if (budgets.some(b => b.categoryId === budget.categoryId && b.month === budget.month)) {
                throw new RepositoryError(
                    RepositoryErrorType.DUPLICATE_ERROR,
                    'A budget already exists for this category and month'
                );
            }

            budgets.push(budget);

            const serialized = budgets.map(serializeBudget);
            await this.storage.set(StorageKeys.BUDGETS, serialized);

            return budget;
        } catch (error) {
            if (error instanceof RepositoryError) {
                throw error;
            }

            throw new RepositoryError(
                RepositoryErrorType.STORAGE_ERROR,
                'Failed to save budget',
                error as Error
            );
        }
    }

    /**
     * Update an existing budget
     */
    async update(budget: Budget): Promise<Budget> {
        try {
            const budgets = await this.getAll();
            const index = budgets.findIndex(b => b.id === budget.id);

            if (index === -1) {
                throw new RepositoryError(
                    RepositoryErrorType.NOT_FOUND,
                    `Budget with id ${budget.id} not found`
                );
            }

            budgets[index] = budget;

            const serialized = budgets.map(serializeBudget);
            await this.storage.set(StorageKeys.BUDGETS, serialized);

            return budget;
        } catch (error) {
            if (error instanceof RepositoryError) {
                throw error;
            }

            throw new RepositoryError(
                RepositoryErrorType.STORAGE_ERROR,
                'Failed to update budget',
                error as Error
            );
        }
    }

    /**
     * Delete a budget
     */
    async delete(id: string): Promise<void> {
        try {
            const budgets = await this.getAll();
            const filtered = budgets.filter(b => b.id !== id);

            if (filtered.length === budgets.length) {
                throw new RepositoryError(
                    RepositoryErrorType.NOT_FOUND,
                    `Budget with id ${id} not found`
                );
            }

            const serialized = filtered.map(serializeBudget);
            await this.storage.set(StorageKeys.BUDGETS, serialized);
        } catch (error) {
            if (error instanceof RepositoryError) {
                throw error;
            }

            throw new RepositoryError(
                RepositoryErrorType.STORAGE_ERROR,
                'Failed to delete budget',
                error as Error
            );
        }
    }

    /**
     * Create a new budget from DTO
     * Validates month format before creating
     */
    async create(dto: CreateBudgetDTO): Promise<Budget> {
        if (!isValidBudgetMonth(dto.month)) {
            throw new RepositoryError(
                RepositoryErrorType.VALIDATION_ERROR,
                `Invalid month format: ${dto.month}. Expected YYYY-MM.`
            );
        }

        if (dto.limitAmount <= 0) {
            throw new RepositoryError(
                RepositoryErrorType.VALIDATION_ERROR,
                'Budget limit must be a positive number'
            );
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

    /**
     * Update budget from DTO
     */
    async updateFromDTO(dto: UpdateBudgetDTO): Promise<Budget> {
        const existing = await this.getById(dto.id);

        if (!existing) {
            throw new RepositoryError(
                RepositoryErrorType.NOT_FOUND,
                `Budget with id ${dto.id} not found`
            );
        }

        if (dto.month && !isValidBudgetMonth(dto.month)) {
            throw new RepositoryError(
                RepositoryErrorType.VALIDATION_ERROR,
                `Invalid month format: ${dto.month}. Expected YYYY-MM.`
            );
        }

        if (dto.limitAmount !== undefined && dto.limitAmount <= 0) {
            throw new RepositoryError(
                RepositoryErrorType.VALIDATION_ERROR,
                'Budget limit must be a positive number'
            );
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

    // Domain-specific query methods

    /**
     * Get budgets for a specific month
     */
    async getByMonth(month: string): Promise<Budget[]> {
        const budgets = await this.getAll();
        return budgets.filter(b => b.month === month);
    }

    /**
     * Get budget for a specific category and month
     */
    async getByCategoryAndMonth(categoryId: string, month: string): Promise<Budget | null> {
        const budgets = await this.getAll();
        return budgets.find(b => b.categoryId === categoryId && b.month === month) || null;
    }
}
