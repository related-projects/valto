/**
 * useReports Hook
 *
 * Provides month-parameterized aggregation for the Reports screen.
 * Computes income/expense totals, category breakdown with budget awareness,
 * and savings rate. Fully reactive to transaction, budget, and category changes.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AppState, type AppStateStatus } from 'react-native';
import { getBudgetRepository } from '../core/di';
import { dataEvents } from '../core/events';
import { calculateYearToDateSummary, YearToDateSummary } from '../domain/calculations/ytdSummary';
import { Budget, TransactionType } from '../domain/entities';
import {
    currentPeriodKey,
    parsePeriodKey,
    periodKeyOf,
    shiftPeriodKey,
} from '../domain/period';
import { MISSING_CATEGORY_LABEL_KEY, UNRESOLVED_CATEGORY_ID } from '../utils/missingCategory';
import { formatPeriodLabel, formatYearPeriodsLabel } from '../utils/periodLabel';
import { useCategories } from './useCategories';
import { useMonthStartDay } from './useMonthStartDay';
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
    /**
     * Human-readable period label: "February 2026" at start day 1, the
     * period's dates otherwise, e.g. "20 Jan - 19 Feb 2026" (src/utils/periodLabel).
     */
    monthLabel: string;
    /** Navigate to previous month */
    goToPreviousMonth: () => void;
    /** Navigate to next month */
    goToNextMonth: () => void;

    // Financial Summary
    totalIncome: number;
    totalExpense: number;
    netBalance: number;
    /** Savings rate as 0-100 percentage. null when income is zero. */
    savingsRate: number | null;

    // Category Breakdown
    categoryBreakdown: CategoryBreakdownItem[];

    /** Annual financial summary for the year of the selected month */
    ytdSummary: YearToDateSummary;
    /** Year the annual summary covers - the year of the selected month */
    ytdYear: number;
    /**
     * The span of that year's 12 periods, e.g. "20 Dec 2025 - 19 Dec 2026";
     * null at start day 1, where the year is the calendar year.
     */
    ytdPeriodLabel: string | null;

    /** Whether there is any expense data for the selected month */
    hasExpenseData: boolean;
    /**
     * Whether the selected month holds any transaction at all, transfers included.
     * Distinct from hasExpenseData: a month of pure income has no expense data but
     * is not empty, and neither is a month holding only a transfer.
     */
    hasMonthActivity: boolean;
    /** Loading state */
    loading: boolean;
}

// ─── Hook ──────────────────────────────────────────────────────────────

export function useReports(): UseReportsResult {
    const { t } = useTranslation();
    // The user's month start day (C20): every period below starts on it.
    const startDay = useMonthStartDay();
    // The current period as of the last sync, held apart from the selection: the
    // Reports tab stays mounted, and a return to the foreground in a new month
    // moves the selection only if it was still on this one (V-99, Owner
    // decision 2). A user who navigated elsewhere keeps their month.
    const [currentMonth, setCurrentMonth] = useState(() => currentPeriodKey(startDay));
    const [selectedMonth, setSelectedMonth] = useState(currentMonth);
    const [budgets, setBudgets] = useState<Budget[]>([]);
    const appStateRef = useRef<AppStateStatus>(AppState.currentState);

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
    // `t` is passed, not reached for: the label belongs to the app language.
    const monthLabel = useMemo(
        () => formatPeriodLabel(selectedMonth, startDay, t),
        [selectedMonth, startDay, t],
    );

    const goToPreviousMonth = useCallback(() => {
        setSelectedMonth(prev => shiftPeriodKey(prev, -1));
    }, []);

    const goToNextMonth = useCallback(() => {
        setSelectedMonth(prev => shiftPeriodKey(prev, 1));
    }, []);

    /** Re-read the current period; carry the selection along only if it was on the old one. */
    const syncMonth = useCallback(() => {
        const now = currentPeriodKey(startDay);
        if (now === currentMonth) return;
        setSelectedMonth(prev => (prev === currentMonth ? now : prev));
        setCurrentMonth(now);
    }, [currentMonth, startDay]);

    // A changed start day regroups at once, by the same rule as a foreground
    // return: the selection follows only if it was on the current period.
    // syncMonth is re-created with each new start day; with an unchanged
    // current period the call is a no-op.
    useEffect(() => {
        syncMonth();
    }, [syncMonth]);

    // Foreground return: only on the transition INTO 'active' (pattern of
    // useBudgets), since AppState also fires for 'inactive' and 'background'.
    useEffect(() => {
        const subscription = AppState.addEventListener('change', (nextState: AppStateStatus) => {
            const previousState = appStateRef.current;
            appStateRef.current = nextState;

            if (previousState !== 'active' && nextState === 'active') {
                syncMonth();
            }
        });

        return () => subscription.remove();
    }, [syncMonth]);

    // ── Aggregation ────────────────────────────────────────────────────
    const aggregated = useMemo(() => {
        let totalIncome = 0;
        let totalExpense = 0;
        let transactionCount = 0;

        const categoryTotals = new Map<string, number>();

        transactions.forEach(t => {
            // Local calendar, to match currentMonth: a Valto month is the
            // device's month (V-91), computed by src/domain/period.
            const txMonth = periodKeyOf(t.date, startDay);
            if (txMonth !== selectedMonth) return;

            // Counted above the type branch, so a transfer keeps the month from
            // reading as empty. See the same rule in ytdSummary.
            transactionCount += 1;

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

        // Every id that no longer resolves collapses into ONE row (V-64). Left
        // per-id, N deleted categories produced N rows carrying the same label
        // and the same grey dot, which no user could tell apart and no screen
        // could drill into - the id is dropped at the component boundary.
        let unresolvedAmount = 0;

        categoryTotals.forEach((amount, categoryId) => {
            const cat = categoryMap.get(categoryId);

            if (!cat) {
                unresolvedAmount += amount;
                return;
            }

            const budget = budgetMap.get(categoryId);

            breakdown.push({
                categoryId,
                categoryName: cat.name,
                categoryColor: cat.color || '#90A4AE',
                amount,
                percentage: totalExpense > 0 ? (amount / totalExpense) * 100 : 0,
                budgetLimit: budget?.limitAmount,
                isOverBudget: budget ? amount > budget.limitAmount : false,
            });
        });

        if (unresolvedAmount > 0) {
            // No budget is joined: the merged row stands for several ids, and a
            // single row cannot carry several limits. A budget still pointing at
            // a deleted category is an orphan in its own right.
            breakdown.push({
                categoryId: UNRESOLVED_CATEGORY_ID,
                categoryName: t(MISSING_CATEGORY_LABEL_KEY),
                categoryColor: '#90A4AE',
                amount: unresolvedAmount,
                percentage: totalExpense > 0 ? (unresolvedAmount / totalExpense) * 100 : 0,
                isOverBudget: false,
            });
        }

        // Sort by amount descending
        breakdown.sort((a, b) => b.amount - a.amount);

        return {
            totalIncome,
            totalExpense,
            netBalance,
            savingsRate,
            categoryBreakdown: breakdown,
            transactionCount,
        };
    }, [transactions, categories, budgets, selectedMonth, startDay, t]);

    // ── Annual Summary ──────────────────────────────────────────────────
    // Derived from the selection, not from the wall clock: the annual card is a
    // consumer of the same filter as every other element on the screen, so
    // navigating into a past year must move it too.
    // The year is the year of the selected period's key, and its 12 periods
    // YYYY-01 to YYYY-12 (C20: YTD = 12 periods).
    const ytdYear = useMemo(() => parsePeriodKey(selectedMonth).year, [selectedMonth]);
    const ytdSummary = useMemo(
        () => calculateYearToDateSummary(transactions, ytdYear, startDay),
        [transactions, ytdYear, startDay],
    );
    const ytdPeriodLabel = useMemo(
        () => formatYearPeriodsLabel(ytdYear, startDay, t),
        [ytdYear, startDay, t],
    );

    return {
        selectedMonth,
        monthLabel,
        goToPreviousMonth,
        goToNextMonth,
        ...aggregated,
        ytdSummary,
        ytdYear,
        ytdPeriodLabel,
        hasExpenseData: aggregated.categoryBreakdown.length > 0,
        hasMonthActivity: aggregated.transactionCount > 0,
        loading,
    };
}
