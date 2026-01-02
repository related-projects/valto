/**
 * Category Repository
 * 
 * Repository for managing Category entities.
 * Handles CRUD operations and category-specific queries.
 * 
 * Architecture Note:
 * This repository manages category persistence and provides methods for
 * filtering categories by type (expense/income).
 */

import { v4 as uuidv4 } from 'uuid';
import {
    Category,
    CategoryType,
    CreateCategoryDTO,
    deserializeCategory,
    SerializableCategory,
    serializeCategory,
    UpdateCategoryDTO,
} from '../../domain/entities/Category';
import { IStorage, StorageKeys } from '../storage';
import { IRepository, RepositoryError, RepositoryErrorType } from './IRepository';

/**
 * Category repository implementation
 */
export class CategoryRepository implements IRepository<Category> {
    constructor(private storage: IStorage) { }

    /**
     * Get all categories
     */
    async getAll(): Promise<Category[]> {
        try {
            const data = await this.storage.get<SerializableCategory[]>(StorageKeys.CATEGORIES);

            if (!data) {
                return [];
            }

            return data.map(deserializeCategory);
        } catch (error) {
            throw new RepositoryError(
                RepositoryErrorType.STORAGE_ERROR,
                'Failed to get all categories',
                error as Error
            );
        }
    }

    /**
     * Get a category by ID
     */
    async getById(id: string): Promise<Category | null> {
        try {
            const categories = await this.getAll();
            return categories.find(c => c.id === id) || null;
        } catch (error) {
            throw new RepositoryError(
                RepositoryErrorType.STORAGE_ERROR,
                `Failed to get category with id: ${id}`,
                error as Error
            );
        }
    }

    /**
     * Save a new category
     */
    async save(category: Category): Promise<Category> {
        try {
            const categories = await this.getAll();

            // Check for duplicate ID
            if (categories.some(c => c.id === category.id)) {
                throw new RepositoryError(
                    RepositoryErrorType.DUPLICATE_ERROR,
                    `Category with id ${category.id} already exists`
                );
            }

            categories.push(category);

            const serialized = categories.map(serializeCategory);
            await this.storage.set(StorageKeys.CATEGORIES, serialized);

            return category;
        } catch (error) {
            if (error instanceof RepositoryError) {
                throw error;
            }

            throw new RepositoryError(
                RepositoryErrorType.STORAGE_ERROR,
                'Failed to save category',
                error as Error
            );
        }
    }

    /**
     * Update an existing category
     */
    async update(category: Category): Promise<Category> {
        try {
            const categories = await this.getAll();
            const index = categories.findIndex(c => c.id === category.id);

            if (index === -1) {
                throw new RepositoryError(
                    RepositoryErrorType.NOT_FOUND,
                    `Category with id ${category.id} not found`
                );
            }

            categories[index] = category;

            const serialized = categories.map(serializeCategory);
            await this.storage.set(StorageKeys.CATEGORIES, serialized);

            return category;
        } catch (error) {
            if (error instanceof RepositoryError) {
                throw error;
            }

            throw new RepositoryError(
                RepositoryErrorType.STORAGE_ERROR,
                'Failed to update category',
                error as Error
            );
        }
    }

    /**
     * Delete a category
     */
    async delete(id: string): Promise<void> {
        try {
            const categories = await this.getAll();
            const filtered = categories.filter(c => c.id !== id);

            if (filtered.length === categories.length) {
                throw new RepositoryError(
                    RepositoryErrorType.NOT_FOUND,
                    `Category with id ${id} not found`
                );
            }

            const serialized = filtered.map(serializeCategory);
            await this.storage.set(StorageKeys.CATEGORIES, serialized);
        } catch (error) {
            if (error instanceof RepositoryError) {
                throw error;
            }

            throw new RepositoryError(
                RepositoryErrorType.STORAGE_ERROR,
                'Failed to delete category',
                error as Error
            );
        }
    }

    /**
     * Create a new category from DTO
     */
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

    /**
     * Update category from DTO
     */
    async updateFromDTO(dto: UpdateCategoryDTO): Promise<Category> {
        const existing = await this.getById(dto.id);

        if (!existing) {
            throw new RepositoryError(
                RepositoryErrorType.NOT_FOUND,
                `Category with id ${dto.id} not found`
            );
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

    // Domain-specific query methods

    /**
     * Get categories by type
     */
    async getByType(type: CategoryType): Promise<Category[]> {
        const categories = await this.getAll();
        return categories.filter(c => c.type === type);
    }

    /**
     * Get expense categories
     */
    async getExpenseCategories(): Promise<Category[]> {
        return this.getByType(CategoryType.EXPENSE);
    }

    /**
     * Get income categories
     */
    async getIncomeCategories(): Promise<Category[]> {
        return this.getByType(CategoryType.INCOME);
    }
}
