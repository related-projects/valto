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

    /**
     * Maximum spending limit for this category in this month, in integer minor
     * units of the install's currency - 10^decimals minor units per major unit
     * (see CurrencyDefinition.decimals), NOT a fixed 100.
     */
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
 * Get current month in YYYY-MM format.
 *
 * A Valto month is the DEVICE'S LOCAL month, so this reads the local calendar
 * (V-91). Reading UTC instead put the device an hour or more into the wrong
 * month around every month change: east of UTC the first hour of the 1st still
 * read as the old month, and west of UTC the last hours of the last day already
 * read as the next one.
 *
 * Two things follow this value and therefore follow the local month too: the
 * month stored on a new budget (AddBudgetModal), and the "a past month is
 * closed" gate in BudgetRepository.updateFromDTO. Values already stored are
 * left exactly as they are - there is no migration.
 */
export function getCurrentMonth(): string {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    return `${year}-${month}`;
}
