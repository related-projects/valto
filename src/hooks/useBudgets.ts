/**
 * useBudgets Hook
 * 
 * React hook for managing budgets with the repository layer.
 * Provides budget CRUD operations and spending tracking for UI components.
 * Subscribes to both budget and transaction events for reactive updates.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { getBudgetRepository } from '../core/di';
import { dataEvents } from '../core/events';
import { Budget, CreateBudgetDTO, getCurrentMonth } from '../domain/entities';
import { useCategories } from './useCategories';
import { useTransactions } from './useTransactions';

/**
 * Enriched budget summary with spending data
 */
export interface BudgetSummary {
    budget: Budget;
    categoryName: string;
    categoryColor: string;
    categoryIcon?: string;
    spentAmount: number;
    remainingAmount: number;
    percentageUsed: number;
    isOverBudget: boolean;
}

interface UseBudgetsResult {
    /** Raw budgets for the current month */
    budgets: Budget[];
    /** Enriched budgets with spending data */
    budgetSummaries: BudgetSummary[];
    /** Total budget limit for the month */
    totalBudgetLimit: number;
    /** Total amount spent across all budgeted categories */
    totalBudgetSpent: number;
    /** Whether there are any budgets for the current month */
    hasBudgets: boolean;
    /** Loading state */
    loading: boolean;
    /** Error message */
    error: string | null;
    /** Current month string (YYYY-MM) */
    currentMonth: string;
    /** Create a new budget */
    createBudget: (dto: CreateBudgetDTO) => Promise<Budget>;
    /** Delete a budget */
    deleteBudget: (id: string) => Promise<void>;
    /** Refresh budgets from repository */
    refreshBudgets: () => Promise<void>;
    /** Category IDs that already have a budget this month */
    budgetedCategoryIds: string[];
}

/**
 * Hook for managing monthly category budgets
 */
export function useBudgets(): UseBudgetsResult {
    const [budgets, setBudgets] = useState<Budget[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const budgetRepo = getBudgetRepository();
    const { transactions } = useTransactions();
    const { categories } = useCategories();

    const currentMonth = useMemo(() => getCurrentMonth(), []);

    /**
     * Load budgets for current month from repository
     */
    const loadBudgets = useCallback(async () => {
        try {
            setLoading(true);
            setError(null);
            const data = await budgetRepo.getByMonth(currentMonth);
            setBudgets(data);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to load budgets');
            console.error('Failed to load budgets:', err);
        } finally {
            setLoading(false);
        }
    }, [budgetRepo, currentMonth]);

    /**
     * Compute spending per category for the current month
     */
    const monthlySpendingByCategory = useMemo(() => {
        const spending = new Map<string, number>();

        // Filter transactions to current month expenses only
        transactions.forEach(t => {
            if (t.type !== 'expense') return;

            const txMonth = `${t.date.getUTCFullYear()}-${String(t.date.getUTCMonth() + 1).padStart(2, '0')}`;
            if (txMonth !== currentMonth) return;

            const current = spending.get(t.categoryId) || 0;
            spending.set(t.categoryId, current + t.amount);
        });

        return spending;
    }, [transactions, currentMonth]);

    /**
     * Build enriched budget summaries with spending data
     */
    const budgetSummaries = useMemo((): BudgetSummary[] => {
        const categoryMap = new Map(categories.map(c => [c.id, c]));

        return budgets.map(budget => {
            const category = categoryMap.get(budget.categoryId);
            const spentAmount = Math.abs(monthlySpendingByCategory.get(budget.categoryId) || 0);
            const remainingAmount = Math.max(0, budget.limitAmount - spentAmount);
            const percentageUsed = budget.limitAmount > 0
                ? (spentAmount / budget.limitAmount) * 100
                : 0;

            return {
                budget,
                categoryName: category?.name || 'Unknown',
                categoryColor: category?.color || '#90A4AE',
                categoryIcon: category?.icon,
                spentAmount,
                remainingAmount,
                percentageUsed,
                isOverBudget: spentAmount > budget.limitAmount,
            };
        });
    }, [budgets, categories, monthlySpendingByCategory]);

    /**
     * Aggregated totals
     */
    const totalBudgetLimit = useMemo(
        () => budgets.reduce((sum, b) => sum + b.limitAmount, 0),
        [budgets]
    );

    const totalBudgetSpent = useMemo(
        () => budgetSummaries.reduce((sum, s) => sum + s.spentAmount, 0),
        [budgetSummaries]
    );

    const hasBudgets = budgets.length > 0;

    /**
     * Category IDs that already have a budget this month
     */
    const budgetedCategoryIds = useMemo(
        () => budgets.map(b => b.categoryId),
        [budgets]
    );

    /**
     * Create a new budget
     */
    const createBudget = useCallback(async (dto: CreateBudgetDTO): Promise<Budget> => {
        try {
            const budget = await budgetRepo.create(dto);
            await loadBudgets();
            dataEvents.emit('budgets');
            return budget;
        } catch (err) {
            const msg = err instanceof Error ? err.message : 'Failed to create budget';
            setError(msg);
            throw new Error(msg);
        }
    }, [budgetRepo, loadBudgets]);

    /**
     * Delete a budget
     */
    const deleteBudget = useCallback(async (id: string): Promise<void> => {
        try {
            await budgetRepo.delete(id);
            await loadBudgets();
            dataEvents.emit('budgets');
        } catch (err) {
            const msg = err instanceof Error ? err.message : 'Failed to delete budget';
            setError(msg);
            throw new Error(msg);
        }
    }, [budgetRepo, loadBudgets]);

    /**
     * Refresh budgets
     */
    const refreshBudgets = useCallback(async () => {
        await loadBudgets();
    }, [loadBudgets]);

    // Load budgets on mount and subscribe to events
    useEffect(() => {
        loadBudgets();

        // Subscribe to budget changes
        const unsubBudgets = dataEvents.subscribe('budgets', loadBudgets);
        // Also reload when transactions change (spending amounts update)
        const unsubTransactions = dataEvents.subscribe('transactions', loadBudgets);

        return () => {
            unsubBudgets();
            unsubTransactions();
        };
    }, [loadBudgets]);

    return {
        budgets,
        budgetSummaries,
        totalBudgetLimit,
        totalBudgetSpent,
        hasBudgets,
        loading,
        error,
        currentMonth,
        createBudget,
        deleteBudget,
        refreshBudgets,
        budgetedCategoryIds,
    };
}
