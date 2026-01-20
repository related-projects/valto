/**
 * useDashboard Hook
 * 
 * Provides aggregated dashboard data derived from transactions and categories.
 * All aggregation logic lives here, keeping UI components read-only.
 */

import { useMemo } from 'react';
import { Category, TransactionType } from '../domain/entities';
import { useCategories } from './useCategories';
import { useTransactions } from './useTransactions';

export interface SpendingByCategoryItem {
    name: string;
    value: number;
    color: string;
}

interface UseDashboardResult {
    /** Spending aggregated by category for expense transactions */
    spendingByCategory: SpendingByCategoryItem[];
    /** Whether there is any expense data to display */
    hasExpenseData: boolean;
    /** Loading state */
    loading: boolean;
}

/** Default colors for categories without a color */
const DEFAULT_COLORS = [
    '#E57373', '#FFB74D', '#64B5F6', '#4DD0E1', '#BA68C8',
    '#81C784', '#FF8A65', '#A1887F', '#90A4AE', '#F06292',
];

/**
 * Hook for dashboard aggregated data
 */
export function useDashboard(): UseDashboardResult {
    const { transactions, loading: transactionsLoading } = useTransactions();
    const { categories, loading: categoriesLoading } = useCategories();

    const loading = transactionsLoading || categoriesLoading;

    /**
     * Aggregate expenses by category
     */
    const spendingByCategory = useMemo(() => {
        // Filter expense transactions only
        const expenses = transactions.filter(t => t.type === TransactionType.EXPENSE);

        if (expenses.length === 0) {
            return [];
        }

        // Create a map of categoryId -> total amount
        const categoryTotals = new Map<string, number>();
        expenses.forEach(transaction => {
            const current = categoryTotals.get(transaction.categoryId) || 0;
            categoryTotals.set(transaction.categoryId, current + transaction.amount);
        });

        // Create category lookup map
        const categoryMap = new Map<string, Category>();
        categories.forEach(cat => categoryMap.set(cat.id, cat));

        // Build spending items with category info
        const items: SpendingByCategoryItem[] = [];
        let colorIndex = 0;

        categoryTotals.forEach((value, categoryId) => {
            const category = categoryMap.get(categoryId);
            const name = category?.name || 'Unknown';
            const color = category?.color || DEFAULT_COLORS[colorIndex % DEFAULT_COLORS.length];
            colorIndex++;

            items.push({ name, value, color });
        });

        // Sort by value descending
        return items.sort((a, b) => b.value - a.value);
    }, [transactions, categories]);

    const hasExpenseData = spendingByCategory.length > 0;

    return {
        spendingByCategory,
        hasExpenseData,
        loading,
    };
}
