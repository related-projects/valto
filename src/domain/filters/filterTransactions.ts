/**
 * Transaction Filtering
 *
 * Pure, deterministic filtering function for transactions.
 * Contains no side effects — suitable for use in hooks, tests, and services.
 *
 * Design decisions:
 * - Arrays for types/categoryIds/walletIds enable multi-select (OR within group, AND across groups)
 * - Date comparisons are inclusive on both boundaries (normalised to day granularity)
 * - Invalid amount ranges (min > max) are auto-normalised by swapping
 * - Empty/undefined filter fields are treated as "no constraint"
 */

import { Transaction, TransactionType } from '../entities';

// ─── Filter Interface ─────────────────────────────────────────────────

export interface TransactionFilters {
    /** Filter by transaction type(s). Empty/undefined = all types. */
    types?: TransactionType[];

    /** Filter by category ID(s). Empty/undefined = all categories. */
    categoryIds?: string[];

    /** Filter by wallet ID(s). Empty/undefined = all wallets. */
    walletIds?: string[];

    /** Inclusive lower bound for transaction date. */
    startDate?: Date;

    /** Inclusive upper bound for transaction date. */
    endDate?: Date;

    /** Inclusive lower bound for transaction amount. */
    minAmount?: number;

    /** Inclusive upper bound for transaction amount. */
    maxAmount?: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────

/**
 * Normalise a date to the start of the day (00:00:00.000) in local time.
 */
function startOfDay(date: Date): Date {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    return d;
}

/**
 * Normalise a date to the end of the day (23:59:59.999) in local time.
 */
function endOfDay(date: Date): Date {
    const d = new Date(date);
    d.setHours(23, 59, 59, 999);
    return d;
}

/**
 * Normalise amount range so min ≤ max. If both are defined and min > max, swap them.
 */
function normaliseAmountRange(
    min: number | undefined,
    max: number | undefined
): { min: number | undefined; max: number | undefined } {
    if (min !== undefined && max !== undefined && min > max) {
        return { min: max, max: min };
    }
    return { min, max };
}

// ─── Core Filter Function ─────────────────────────────────────────────

/**
 * Filter transactions by the given criteria.
 *
 * - Deterministic: same inputs always produce the same output.
 * - No side effects: returns a new array, never mutates input.
 * - Composable: all filter groups use AND logic; within a group (types, categoryIds, walletIds) uses OR logic.
 *
 * @param transactions - The full list of transactions to filter.
 * @param filters      - The filter criteria to apply.
 * @returns A new array containing only the matching transactions.
 */
export function filterTransactions(
    transactions: Transaction[],
    filters: TransactionFilters
): Transaction[] {
    // Short-circuit: no filters or empty filter object → return all
    if (!filters || Object.keys(filters).length === 0) {
        return transactions;
    }

    const { types, categoryIds, walletIds, startDate, endDate } = filters;
    const { min: normMin, max: normMax } = normaliseAmountRange(filters.minAmount, filters.maxAmount);

    // Pre-compute date boundaries once
    const lowerDate = startDate ? startOfDay(startDate) : undefined;
    const upperDate = endDate ? endOfDay(endDate) : undefined;

    // Pre-compute Sets for O(1) lookups when arrays are provided
    const typeSet = types && types.length > 0 ? new Set(types) : undefined;
    const categorySet = categoryIds && categoryIds.length > 0 ? new Set(categoryIds) : undefined;
    const walletSet = walletIds && walletIds.length > 0 ? new Set(walletIds) : undefined;

    return transactions.filter((tx) => {
        // Type filter (OR within group)
        if (typeSet && !typeSet.has(tx.type)) {
            return false;
        }

        // Category filter (OR within group)
        if (categorySet && !categorySet.has(tx.categoryId)) {
            return false;
        }

        // Wallet filter (OR within group)
        if (walletSet && !walletSet.has(tx.walletId)) {
            return false;
        }

        // Date range filter (inclusive)
        const txTime = tx.date.getTime();
        if (lowerDate && txTime < lowerDate.getTime()) {
            return false;
        }
        if (upperDate && txTime > upperDate.getTime()) {
            return false;
        }

        // Amount range filter (inclusive)
        if (normMin !== undefined && tx.amount < normMin) {
            return false;
        }
        if (normMax !== undefined && tx.amount > normMax) {
            return false;
        }

        return true;
    });
}
