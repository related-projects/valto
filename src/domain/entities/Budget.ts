/**
 * Budget Entity
 * 
 * Pure domain model representing a monthly category budget.
 * This entity is UI-agnostic and contains only business logic.
 */

/**
 * Budget entity interface
 * Represents a monthly spending limit for an expense category
 */
export interface Budget {
    /** Unique identifier for the budget */
    readonly id: string;

    /** ID of the expense category this budget applies to */
    readonly categoryId: string;

    /** Month in YYYY-MM format */
    readonly month: string;

    /** Maximum spending limit for this category in this month */
    readonly limitAmount: number;

    /** Timestamp when this budget was created */
    readonly createdAt: Date;

    /** Timestamp when this budget was last updated */
    readonly updatedAt: Date;
}

/**
 * Data Transfer Object for creating a new budget
 */
export interface CreateBudgetDTO {
    categoryId: string;
    month: string;
    limitAmount: number;
}

/**
 * Data Transfer Object for updating an existing budget
 * All fields are optional except id
 */
export interface UpdateBudgetDTO {
    id: string;
    categoryId?: string;
    month?: string;
    limitAmount?: number;
}

/**
 * Serializable version of Budget for storage
 * Dates are converted to ISO strings for JSON serialization
 */
export interface SerializableBudget {
    id: string;
    categoryId: string;
    month: string;
    limitAmount: number;
    createdAt: string; // ISO string
    updatedAt: string; // ISO string
}

/**
 * Convert Budget to serializable format
 */
export function serializeBudget(budget: Budget): SerializableBudget {
    return {
        ...budget,
        createdAt: budget.createdAt.toISOString(),
        updatedAt: budget.updatedAt.toISOString(),
    };
}

/**
 * Convert serializable format back to Budget
 */
export function deserializeBudget(data: SerializableBudget): Budget {
    return {
        ...data,
        createdAt: new Date(data.createdAt),
        updatedAt: new Date(data.updatedAt),
    };
}

/**
 * Validate month format (YYYY-MM)
 */
export function isValidBudgetMonth(month: string): boolean {
    return /^\d{4}-(0[1-9]|1[0-2])$/.test(month);
}

/**
 * Get current month in YYYY-MM format
 */
export function getCurrentMonth(): string {
    const now = new Date();
    const year = now.getUTCFullYear();
    const month = String(now.getUTCMonth() + 1).padStart(2, '0');
    return `${year}-${month}`;
}
