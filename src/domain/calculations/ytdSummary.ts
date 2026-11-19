/**
 * Year-to-Date Summary
 *
 * Pure domain function for calculating YTD financial aggregation.
 * No side effects, fully testable.
 */

import { Transaction, TransactionType } from '../entities';
import { DEFAULT_PERIOD_START_DAY, currentPeriodKey, parsePeriodKey, periodOf } from '../period';

// ─── Types ────────────────────────────────────────────────────────────

export interface YearToDateSummary {
    /** Total income for the year (minor units) */
    totalIncome: number;
    /** Total expenses for the year (minor units) */
    totalExpenses: number;
    /** Net = income - expenses (can be negative) */
    net: number;
    /**
     * Savings rate as a decimal (0-1 range, or negative).
     * Formula: (income - expenses) / income
     *
     * null when income is zero: there is no proportion of nothing to state, and a
     * rate of 0 is a different claim (income arrived and was entirely spent). This
     * is the same shape useReports produces for the monthly card, so the two cards
     * on the Reports screen agree on what "no income" looks like.
     */
    savingsRate: number | null;
    /**
     * Rows dated in the year, counted BEFORE the type branch below - transfers
     * included, even though no figure here includes them. A period holding only a
     * transfer is not an empty period: money moved, so a caller asking "was there
     * anything here?" must be told yes.
     */
    transactionCount: number;
}

// ─── Domain Function ──────────────────────────────────────────────────

/**
 * Calculate year-to-date financial summary from a list of transactions.
 *
 * A year is read off the device's LOCAL calendar, like every other Valto
 * bucket (V-91): a transaction entered just after local midnight on 1 January
 * belongs to the new year, whatever its UTC date still says. The year is the
 * year of the period a row falls in (src/domain/period); at the default start
 * day, 1, that is its calendar year.
 *
 * @param transactions Full list of transactions (will be filtered internally)
 * @param year The year to summarize. Defaults to the current local year.
 * @returns YearToDateSummary
 */
export function calculateYearToDateSummary(
    transactions: Transaction[],
    year?: number,
): YearToDateSummary {
    const targetYear = year ?? parsePeriodKey(currentPeriodKey(DEFAULT_PERIOD_START_DAY)).year;

    let totalIncome = 0;
    let totalExpenses = 0;
    let transactionCount = 0;

    for (const t of transactions) {
        if (periodOf(t.date, DEFAULT_PERIOD_START_DAY).year !== targetYear) continue;

        transactionCount += 1;

        if (t.type === TransactionType.INCOME) {
            totalIncome += t.amount;
        } else if (t.type === TransactionType.EXPENSE) {
            totalExpenses += t.amount;
        }
        // TransactionType.TRANSFER is intentionally excluded
    }

    const net = totalIncome - totalExpenses;
    const savingsRate = totalIncome > 0
        ? (totalIncome - totalExpenses) / totalIncome
        : null;

    return { totalIncome, totalExpenses, net, savingsRate, transactionCount };
}
