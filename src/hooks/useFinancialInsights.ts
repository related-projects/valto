/**
 * useFinancialInsights Hook
 *
 * Consumes raw financial data from useDashboard / useBudgets and
 * feeds it through the pure domain insight functions, returning
 * pre-computed insight objects ready for the UI layer.
 */

import { useMemo } from 'react';
import {
    type BudgetPaceResult,
    type CategoryRiskResult,
    type MonthlySpendingTrendResult,
    type SavingsHealthResult,
    compareMonthlySpending,
    evaluateBudgetPace,
    evaluateCategoryRisk,
    evaluateSavingsHealth,
} from '../domain/insights';
import { useBudgets } from './useBudgets';
import { useDashboard } from './useDashboard';

export interface FinancialInsights {
    savingsHealth: SavingsHealthResult;
    spendingTrend: MonthlySpendingTrendResult;
    categoryRisk: CategoryRiskResult;
    budgetPace: BudgetPaceResult | null;
}

/**
 * Hook that derives financial insights from existing dashboard and budget data.
 * All heavy lifting is done by pure domain functions — this hook only wires data.
 */
export function useFinancialInsights(): FinancialInsights {
    const {
        currentMonthIncome,
        currentMonthExpense,
        previousMonthExpense,
        spendingByCategory,
    } = useDashboard();

    const {
        totalBudgetSpent,
        totalBudgetLimit,
        hasBudgets,
    } = useBudgets();

    // --- Savings Health ---
    const savingsHealth = useMemo(
        () => evaluateSavingsHealth(currentMonthIncome, currentMonthExpense),
        [currentMonthIncome, currentMonthExpense],
    );

    // --- Monthly Spending Trend ---
    const spendingTrend = useMemo(
        () => compareMonthlySpending(
            { totalExpenses: currentMonthExpense },
            { totalExpenses: previousMonthExpense },
        ),
        [currentMonthExpense, previousMonthExpense],
    );

    // --- Category Risk ---
    const categoryRisk = useMemo(() => {
        const expensesByCategory: Record<string, number> = {};
        spendingByCategory.forEach(item => {
            expensesByCategory[item.name] = item.value;
        });
        return evaluateCategoryRisk(expensesByCategory);
    }, [spendingByCategory]);

    // --- Budget Pace ---
    const budgetPace = useMemo(() => {
        if (!hasBudgets) return null;

        const now = new Date();
        const year = now.getFullYear();
        const month = now.getMonth(); // 0-indexed
        const totalDays = new Date(year, month + 1, 0).getDate();
        const daysElapsed = now.getDate();

        return evaluateBudgetPace(totalBudgetSpent, totalBudgetLimit, daysElapsed, totalDays);
    }, [totalBudgetSpent, totalBudgetLimit, hasBudgets]);

    return { savingsHealth, spendingTrend, categoryRisk, budgetPace };
}
