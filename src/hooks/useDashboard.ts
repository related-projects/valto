/**
 * useDashboard Hook
 * 
 * Provides aggregated dashboard data derived from transactions and categories.
 * All aggregation logic lives here, keeping UI components read-only.
 */

import { useMemo } from 'react';
import { Category, TransactionType, getCurrentMonth } from '../domain/entities';
import { useCategories } from './useCategories';
import { useTransactions } from './useTransactions';

export interface SpendingByCategoryItem {
    name: string;
    value: number;
    color: string;
    percentage: number;
}

interface UseDashboardResult {
    /** Spending aggregated by category for expense transactions in the current month (Top 5) */
    spendingByCategory: SpendingByCategoryItem[];
    /** Whether there is any expense data to display this month */
    hasExpenseData: boolean;
    /** Loading state */
    loading: boolean;

    // Monthly Overview
    currentMonthIncome: number;
    currentMonthExpense: number;
    previousMonthExpense: number;
    netBalance: number;

    // Percentage Changes vs Previous Month
    incomeChange: number | null;
    expenseChange: number | null;
    netBalanceChange: number | null;
}

/** Default colors for categories without a color */
const DEFAULT_COLORS = [
    '#E57373', '#FFB74D', '#64B5F6', '#4DD0E1', '#BA68C8',
    '#81C784', '#FF8A65', '#A1887F', '#90A4AE', '#F06292',
];

const getPreviousMonth = (currentMonthStr: string) => {
    const [year, month] = currentMonthStr.split('-').map(Number);
    let prevMonth = month - 1;
    let prevYear = year;
    if (prevMonth === 0) {
        prevMonth = 12;
        prevYear -= 1;
    }
    return `${prevYear}-${String(prevMonth).padStart(2, '0')}`;
};

/**
 * Hook for dashboard aggregated data
 */
export function useDashboard(): UseDashboardResult {
    const { transactions, loading: transactionsLoading } = useTransactions();
    const { categories, loading: categoriesLoading } = useCategories();

    const loading = transactionsLoading || categoriesLoading;

    // Financial Intelligence Aggregation
    const aggregatedData = useMemo(() => {
        const currentMonth = getCurrentMonth();
        const previousMonth = getPreviousMonth(currentMonth);

        let currentMonthIncome = 0;
        let currentMonthExpense = 0;

        let prevMonthIncome = 0;
        let prevMonthExpense = 0;

        const currentMonthCategoryTotals = new Map<string, number>();

        transactions.forEach(t => {
            const txMonthStr = `${t.date.getUTCFullYear()}-${String(t.date.getUTCMonth() + 1).padStart(2, '0')}`;

            if (txMonthStr === currentMonth) {
                if (t.type === TransactionType.INCOME) {
                    currentMonthIncome += t.amount;
                } else if (t.type === TransactionType.EXPENSE) {
                    currentMonthExpense += t.amount;
                    const catTotal = currentMonthCategoryTotals.get(t.categoryId) || 0;
                    currentMonthCategoryTotals.set(t.categoryId, catTotal + t.amount);
                }
            } else if (txMonthStr === previousMonth) {
                if (t.type === TransactionType.INCOME) {
                    prevMonthIncome += t.amount;
                } else if (t.type === TransactionType.EXPENSE) {
                    prevMonthExpense += t.amount;
                }
            }
        });

        const netBalance = currentMonthIncome - currentMonthExpense;
        const prevNetBalance = prevMonthIncome - prevMonthExpense;

        // Calculate percentage changes
        const calculateChange = (current: number, previous: number): number | null => {
            if (previous === 0) return null;
            return ((current - previous) / Math.abs(previous)) * 100;
        };

        const incomeChange = calculateChange(currentMonthIncome, prevMonthIncome);
        const expenseChange = calculateChange(currentMonthExpense, prevMonthExpense);
        const netBalanceChange = calculateChange(netBalance, prevNetBalance);

        // Calculate Top 5 Categories
        const categoryMap = new Map<string, Category>();
        categories.forEach(cat => categoryMap.set(cat.id, cat));

        const items: SpendingByCategoryItem[] = [];
        let colorIndex = 0;

        currentMonthCategoryTotals.forEach((value, categoryId) => {
            const category = categoryMap.get(categoryId);
            const name = category?.name || 'Unknown';
            const color = category?.color || DEFAULT_COLORS[colorIndex % DEFAULT_COLORS.length];
            // Increase index only for unknown colors, or just sequentially
            if (!category?.color) colorIndex++;

            const percentage = currentMonthExpense > 0 ? (value / currentMonthExpense) * 100 : 0;

            items.push({ name, value, color, percentage });
        });

        // Sort descending, take top 5
        const top5Categories = items
            .sort((a, b) => b.value - a.value)
            .slice(0, 5);

        return {
            spendingByCategory: top5Categories,
            currentMonthIncome,
            currentMonthExpense,
            previousMonthExpense: prevMonthExpense,
            netBalance,
            incomeChange,
            expenseChange,
            netBalanceChange,
        };
    }, [transactions, categories]);

    const hasExpenseData = aggregatedData.spendingByCategory.length > 0;

    return {
        ...aggregatedData,
        hasExpenseData,
        loading,
    };
}
