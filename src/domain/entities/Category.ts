/**
 * Category Entity
 * 
 * Pure domain model representing a transaction category.
 * This entity is UI-agnostic and contains only business logic.
 */

/**
 * Type of category: expense or income
 */
export enum CategoryType {
    EXPENSE = 'expense',
    INCOME = 'income',
}

/**
 * Category entity interface
 * Represents a classification for transactions
 */
export interface Category {
    /** Unique identifier for the category */
    readonly id: string;

    /** Display name of the category */
    readonly name: string;

    /** Type of category (expense or income) */
    readonly type: CategoryType;

    /** Optional icon identifier for UI representation */
    readonly icon?: string;

    /** Optional color for UI representation (hex color code) */
    readonly color?: string;
}

/**
 * Data Transfer Object for creating a new category
 */
export interface CreateCategoryDTO {
    name: string;
    type: CategoryType;
    icon?: string;
    color?: string;
}

/**
 * Data Transfer Object for updating an existing category
 * All fields are optional except id
 */
export interface UpdateCategoryDTO {
    id: string;
    name?: string;
    type?: CategoryType;
    icon?: string;
    color?: string;
}

/**
 * Category is already serializable (no Date fields)
 * But we define the type for consistency with other entities
 */
export type SerializableCategory = Category;

/**
 * Convert Category to serializable format
 * No conversion needed, but provided for API consistency
 */
export function serializeCategory(category: Category): SerializableCategory {
    return category;
}

/**
 * Convert serializable format back to Category
 * No conversion needed, but provided for API consistency
 */
export function deserializeCategory(data: SerializableCategory): Category {
    return data;
}
