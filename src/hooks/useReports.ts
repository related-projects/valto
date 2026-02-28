/**
 * useReports Hook
 *
 * Provides month-parameterized aggregation for the Reports screen.
 * Computes income/expense totals, category breakdown with budget awareness,
 * and savings rate. Fully reactive to transaction, budget, and category changes.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { getBudgetRepository } from '../core/di';
import { dataEvents } from '../core/events';
import { Budget, TransactionType, getCurrentMonth } from '../domain/entities';
import { useCategories } from './useCategories';
import { useTransactions } from './useTransactions';

// ─── Public Types ──────────────────────────────────────────────────────

export interface CategoryBreakdownItem {
    categoryId: string;
    categoryName: string;
    categoryColor: string;
    amount: number;
    percentage: number;
    /** Budget limit for this category/month (undefined if no budget) */
    budgetLimit?: number;
    /** Whether spending exceeds the budget */
    isOverBudget: boolean;
}

export interface UseReportsResult {
    /** Currently selected month (YYYY-MM) */
    selectedMonth: string;
    /** Human-readable month label, e.g. "February 2026" */
    monthLabel: string;
    /** Navigate to previous month */
    goToPreviousMonth: () => void;
    /** Navigate to next month */
    goToNextMonth: () => void;

    // Financial Summary
    totalIncome: number;
    totalExpense: number;
    netBalance: number;
    /** Savings rate as 0–100 percentage. null when income is zero. */
    savingsRate: number | null;

    // Category Breakdown
    categoryBreakdown: CategoryBreakdownItem[];

    /** Whether there is any expense data for the selected month */
    hasExpenseData: boolean;
    /** Loading state */
    loading: boolean;
}

// ─── Helpers ───────────────────────────────────────────────────────────

const MONTH_NAMES = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
];

function formatMonthLabel(monthStr: string): string {
    const [year, month] = monthStr.split('-').map(Number);
    return `${MONTH_NAMES[month - 1]} ${year}`;
}

function shiftMonth(monthStr: string, delta: number): string {
    const [year, month] = monthStr.split('-').map(Number);
    let newMonth = month + delta;
    let newYear = year;
    while (newMonth > 12) { newMonth -= 12; newYear += 1; }
    while (newMonth < 1) { newMonth += 12; newYear -= 1; }
    return `${newYear}-${String(newMonth).padStart(2, '0')}`;
}

// ─── Hook ──────────────────────────────────────────────────────────────

export function useReports(): UseReportsResult {
    const [selectedMonth, setSelectedMonth] = useState(() => getCurrentMonth());
    const [budgets, setBudgets] = useState<Budget[]>([]);

    const { transactions, loading: transactionsLoading } = useTransactions();
    const { categories, loading: categoriesLoading } = useCategories();

    const budgetRepo = getBudgetRepository();
    const loading = transactionsLoading || categoriesLoading;

    // ── Load budgets for the selected month ────────────────────────────
    const loadBudgets = useCallback(async () => {
        try {
            const data = await budgetRepo.getByMonth(selectedMonth);
            setBudgets(data);
        } catch (err) {
            console.error('Failed to load budgets for reports:', err);
            setBudgets([]);
        }
    }, [budgetRepo, selectedMonth]);

    useEffect(() => {
        loadBudgets();

        const unsubBudgets = dataEvents.subscribe('budgets', loadBudgets);
        return () => { unsubBudgets(); };
    }, [loadBudgets]);

    // ── Month navigation ───────────────────────────────────────────────
    const monthLabel = useMemo(() => formatMonthLabel(selectedMonth), [selectedMonth]);

    const goToPreviousMonth = useCallback(() => {
        setSelectedMonth(prev => shiftMonth(prev, -1));
    }, []);

    const goToNextMonth = useCallback(() => {
        setSelectedMonth(prev => shiftMonth(prev, 1));
    }, []);

    // ── Aggregation ────────────────────────────────────────────────────
    const aggregated = useMemo(() => {
        let totalIncome = 0;
        let totalExpense = 0;

        const categoryTotals = new Map<string, number>();

        transactions.forEach(t => {
            const txMonth = `${t.date.getUTCFullYear()}-${String(t.date.getUTCMonth() + 1).padStart(2, '0')}`;
            if (txMonth !== selectedMonth) return;

            if (t.type === TransactionType.INCOME) {
                totalIncome += t.amount;
            } else if (t.type === TransactionType.EXPENSE) {
                totalExpense += t.amount;
                const prev = categoryTotals.get(t.categoryId) || 0;
                categoryTotals.set(t.categoryId, prev + t.amount);
            }
        });

        const netBalance = totalIncome - totalExpense;
        const savingsRate = totalIncome > 0
            ? ((totalIncome - totalExpense) / totalIncome) * 100
            : null;

        // Build category breakdown
        const categoryMap = new Map(categories.map(c => [c.id, c]));
        const budgetMap = new Map(budgets.map(b => [b.categoryId, b]));

        const breakdown: CategoryBreakdownItem[] = [];
        categoryTotals.forEach((amount, categoryId) => {
            const cat = categoryMap.get(categoryId);
            const budget = budgetMap.get(categoryId);

            breakdown.push({
                categoryId,
                categoryName: cat?.name || 'Unknown',
                categoryColor: cat?.color || '#90A4AE',
                amount,
                percentage: totalExpense > 0 ? (amount / totalExpense) * 100 : 0,
                budgetLimit: budget?.limitAmount,
                isOverBudget: budget ? amount > budget.limitAmount : false,
            });
        });

        // Sort by amount descending
        breakdown.sort((a, b) => b.amount - a.amount);

        return {
            totalIncome,
            totalExpense,
            netBalance,
            savingsRate,
            categoryBreakdown: breakdown,
        };
    }, [transactions, categories, budgets, selectedMonth]);

    return {
        selectedMonth,
        monthLabel,
        goToPreviousMonth,
        goToNextMonth,
        ...aggregated,
        hasExpenseData: aggregated.categoryBreakdown.length > 0,
        loading,
    };
}
