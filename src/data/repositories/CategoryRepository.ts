/**
 * Category Repository
 *
 * Repository for managing Category entities, backed by relational SQLite.
 * Handles CRUD and filtering by type (expense/income).
 */

import { v4 as uuidv4 } from 'uuid';
import {
    Category,
    CategoryType,
    CreateCategoryDTO,
    UpdateCategoryDTO,
} from '../../domain/entities/Category';
import {
    categoryMapper,
    sqlDelete,
    sqlExists,
    sqlGetAll,
    sqlGetById,
    sqlInsert,
    sqlUpdate,
} from '../storage/sql/mappers';
import type { SqlDatabase } from '../storage/sql/SqlDatabase';
import type { ICategoryRepository } from '../../domain/repositories';
import { RepositoryError, RepositoryErrorType } from './IRepository';

export class CategoryRepository implements ICategoryRepository {
    constructor(private db: SqlDatabase) { }

    async getAll(): Promise<Category[]> {
        try {
            return await sqlGetAll(this.db, categoryMapper);
        } catch (error) {
            throw new RepositoryError(RepositoryErrorType.STORAGE_ERROR, 'Failed to get all categories', error as Error);
        }
    }

    async getById(id: string): Promise<Category | null> {
        try {
            return await sqlGetById(this.db, categoryMapper, id);
        } catch (error) {
            throw new RepositoryError(RepositoryErrorType.STORAGE_ERROR, `Failed to get category with id: ${id}`, error as Error);
        }
    }

    async save(category: Category): Promise<Category> {
        try {
            this.validate(category);

            if (await sqlExists(this.db, categoryMapper, category.id)) {
                throw new RepositoryError(
                    RepositoryErrorType.DUPLICATE_ERROR,
                    `Category with id ${category.id} already exists`,
                );
            }

            await sqlInsert(this.db, categoryMapper, category);
            return category;
        } catch (error) {
            if (error instanceof RepositoryError) throw error;
            console.error('[CategoryRepository] Unexpected save failure:', error);
            throw new RepositoryError(RepositoryErrorType.STORAGE_ERROR, 'Failed to save category', error as Error);
        }
    }

    async update(category: Category): Promise<Category> {
        try {
            this.validate(category);

            const affected = await sqlUpdate(this.db, categoryMapper, category);
            if (affected === 0) {
                throw new RepositoryError(RepositoryErrorType.NOT_FOUND, `Category with id ${category.id} not found`);
            }
            return category;
        } catch (error) {
            if (error instanceof RepositoryError) throw error;
            console.error('[CategoryRepository] Unexpected update failure:', error);
            throw new RepositoryError(RepositoryErrorType.STORAGE_ERROR, 'Failed to update category', error as Error);
        }
    }

    async delete(id: string): Promise<void> {
        try {
            const affected = await sqlDelete(this.db, categoryMapper, id);
            if (affected === 0) {
                throw new RepositoryError(RepositoryErrorType.NOT_FOUND, `Category with id ${id} not found`);
            }
        } catch (error) {
            if (error instanceof RepositoryError) throw error;
            throw new RepositoryError(RepositoryErrorType.STORAGE_ERROR, 'Failed to delete category', error as Error);
        }
    }

    async create(dto: CreateCategoryDTO): Promise<Category> {
        const category: Category = {
            id: uuidv4(),
            name: dto.name,
            type: dto.type,
            icon: dto.icon,
            color: dto.color,
        };
        return this.save(category);
    }

    async updateFromDTO(dto: UpdateCategoryDTO): Promise<Category> {
        const existing = await this.getById(dto.id);
        if (!existing) {
            throw new RepositoryError(RepositoryErrorType.NOT_FOUND, `Category with id ${dto.id} not found`);
        }

        const updated: Category = {
            ...existing,
            name: dto.name ?? existing.name,
            type: dto.type ?? existing.type,
            icon: dto.icon !== undefined ? dto.icon : existing.icon,
            color: dto.color !== undefined ? dto.color : existing.color,
        };

        return this.update(updated);
    }

    // ─── Domain-specific query methods ──────────────────────────────────

    async getByType(type: CategoryType): Promise<Category[]> {
        const categories = await this.getAll();
        return categories.filter((c) => c.type === type);
    }

    async getExpenseCategories(): Promise<Category[]> {
        return this.getByType(CategoryType.EXPENSE);
    }

    async getIncomeCategories(): Promise<Category[]> {
        return this.getByType(CategoryType.INCOME);
    }

    private validate(category: Category): void {
        if (!category.id || typeof category.id !== 'string') {
            throw new RepositoryError(RepositoryErrorType.VALIDATION_ERROR, 'Category id must be a non-empty string');
        }
        if (!category.name || typeof category.name !== 'string' || category.name.trim().length === 0) {
            throw new RepositoryError(RepositoryErrorType.VALIDATION_ERROR, 'Category name must be a non-empty string');
        }
    }
}
