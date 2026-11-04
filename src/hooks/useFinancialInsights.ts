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
 * All heavy lifting is done by pure domain functions - this hook only wires data.
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
        currentMonth,
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
        // Accumulate, never assign: this record is keyed by the DISPLAY NAME,
        // because useDashboard drops the category id. Two entries can legally
        // share a name - two categories the user named the same - and an
        // assignment silently dropped one of their amounts, shrinking the
        // denominator and overstating whatever came out on top (V-64).
        const expensesByCategory: Record<string, number> = {};
        spendingByCategory.forEach(item => {
            expensesByCategory[item.name] = (expensesByCategory[item.name] ?? 0) + item.value;
        });
        return evaluateCategoryRisk(expensesByCategory);
    }, [spendingByCategory]);

    // --- Budget Pace ---
    // The month is useBudgets' currentMonth - the same state the spent and limit
    // totals were read for - so a return to the foreground in a new month moves
    // all three together (V-99). A clock read alone, inside this memo, stayed on
    // the old date whenever the totals happened to come out equal.
    const budgetPace = useMemo(() => {
        if (!hasBudgets) return null;

        const [year, month] = currentMonth.split('-').map(Number); // month 1-indexed
        const totalDays = new Date(year, month, 0).getDate();

        // Only the day comes off the clock, and only while the clock is still in
        // that month; past it, the budgets on screen are for a month that is over.
        const now = new Date();
        const inMonth = now.getFullYear() === year && now.getMonth() + 1 === month;
        const daysElapsed = inMonth ? now.getDate() : totalDays;

        return evaluateBudgetPace(totalBudgetSpent, totalBudgetLimit, daysElapsed, totalDays);
    }, [totalBudgetSpent, totalBudgetLimit, hasBudgets, currentMonth]);

    return { savingsHealth, spendingTrend, categoryRisk, budgetPace };
}
