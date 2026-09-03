/**
 * YTD Summary Unit Tests
 *
 * Tests for calculateYearToDateSummary domain function.
 * Covers standard cases, edge cases, and boundary conditions.
 */

import { calculateYearToDateSummary } from '../../domain/calculations/ytdSummary';
import { TransactionType } from '../../domain/entities';

// ─── Helpers ──────────────────────────────────────────────────────────

function makeTx(overrides: Partial<{
    type: TransactionType;
    amount: number;
    date: Date;
}>) {
    return {
        id: 'tx-' + Math.random().toString(36).slice(2),
        type: overrides.type ?? TransactionType.EXPENSE,
        amount: overrides.amount ?? 10000,
        categoryId: 'cat-1',
        walletId: 'wal-1',
        date: overrides.date ?? new Date('2026-03-15T00:00:00Z'),
        createdAt: new Date(),
    };
}

// ─── Tests ────────────────────────────────────────────────────────────

describe('calculateYearToDateSummary', () => {
    it('calculates correct totals for mixed transactions', () => {
        const transactions = [
            makeTx({ type: TransactionType.INCOME, amount: 500_000, date: new Date('2026-01-15T00:00:00Z') }),
            makeTx({ type: TransactionType.INCOME, amount: 500_000, date: new Date('2026-02-15T00:00:00Z') }),
            makeTx({ type: TransactionType.EXPENSE, amount: 200_000, date: new Date('2026-01-20T00:00:00Z') }),
            makeTx({ type: TransactionType.EXPENSE, amount: 150_000, date: new Date('2026-02-20T00:00:00Z') }),
        ];

        const result = calculateYearToDateSummary(transactions, 2026);

        expect(result.totalIncome).toBe(1_000_000);
        expect(result.totalExpenses).toBe(350_000);
        expect(result.net).toBe(650_000);
        expect(result.savingsRate).toBeCloseTo(0.65);
    });

    it('returns a null savings rate when income is zero', () => {
        const transactions = [
            makeTx({ type: TransactionType.EXPENSE, amount: 100_000, date: new Date('2026-03-01T00:00:00Z') }),
        ];

        const result = calculateYearToDateSummary(transactions, 2026);

        expect(result.totalIncome).toBe(0);
        expect(result.totalExpenses).toBe(100_000);
        expect(result.net).toBe(-100_000);
        // There is no rate to state, not a rate of zero: nothing was earned to
        // save a proportion of. A real 0 is covered by 'handles breakeven' below.
        expect(result.savingsRate).toBeNull();
    });

    it('handles negative net value correctly', () => {
        const transactions = [
            makeTx({ type: TransactionType.INCOME, amount: 100_000, date: new Date('2026-01-15T00:00:00Z') }),
            makeTx({ type: TransactionType.EXPENSE, amount: 300_000, date: new Date('2026-01-20T00:00:00Z') }),
        ];

        const result = calculateYearToDateSummary(transactions, 2026);

        expect(result.net).toBe(-200_000);
        expect(result.savingsRate).toBeCloseTo(-2.0);
    });

    it('filters transactions to the specified year only', () => {
        const transactions = [
            makeTx({ type: TransactionType.INCOME, amount: 500_000, date: new Date('2025-06-15T00:00:00Z') }),
            makeTx({ type: TransactionType.INCOME, amount: 200_000, date: new Date('2026-01-15T00:00:00Z') }),
            makeTx({ type: TransactionType.EXPENSE, amount: 100_000, date: new Date('2027-01-15T00:00:00Z') }),
        ];

        const result = calculateYearToDateSummary(transactions, 2026);

        expect(result.totalIncome).toBe(200_000);
        expect(result.totalExpenses).toBe(0);
        expect(result.net).toBe(200_000);
    });

    it('excludes transfer transactions', () => {
        const transactions = [
            makeTx({ type: TransactionType.INCOME, amount: 500_000, date: new Date('2026-01-15T00:00:00Z') }),
            makeTx({ type: TransactionType.TRANSFER, amount: 100_000, date: new Date('2026-01-20T00:00:00Z') }),
        ];

        const result = calculateYearToDateSummary(transactions, 2026);

        expect(result.totalIncome).toBe(500_000);
        expect(result.totalExpenses).toBe(0);
        expect(result.net).toBe(500_000);
    });

    it('handles empty transaction list', () => {
        const result = calculateYearToDateSummary([], 2026);

        expect(result.totalIncome).toBe(0);
        expect(result.totalExpenses).toBe(0);
        expect(result.net).toBe(0);
        expect(result.savingsRate).toBeNull();
        expect(result.transactionCount).toBe(0);
    });

    it('handles breakeven (income equals expenses)', () => {
        const transactions = [
            makeTx({ type: TransactionType.INCOME, amount: 500_000, date: new Date('2026-02-15T00:00:00Z') }),
            makeTx({ type: TransactionType.EXPENSE, amount: 500_000, date: new Date('2026-02-20T00:00:00Z') }),
        ];

        const result = calculateYearToDateSummary(transactions, 2026);

        expect(result.net).toBe(0);
        // A genuine zero: income existed and exactly matched spending. This is the
        // case the null above must stay distinguishable from.
        expect(result.savingsRate).toBe(0);
    });

    it('counts transactions in the target year', () => {
        const transactions = [
            makeTx({ type: TransactionType.INCOME, amount: 500_000, date: new Date('2026-02-15T00:00:00Z') }),
            makeTx({ type: TransactionType.EXPENSE, amount: 100_000, date: new Date('2026-02-20T00:00:00Z') }),
            makeTx({ type: TransactionType.EXPENSE, amount: 100_000, date: new Date('2025-02-20T00:00:00Z') }),
        ];

        expect(calculateYearToDateSummary(transactions, 2026).transactionCount).toBe(2);
        expect(calculateYearToDateSummary(transactions, 2025).transactionCount).toBe(1);
    });

    it('counts transfers, which no figure includes', () => {
        const transactions = [
            makeTx({ type: TransactionType.TRANSFER, amount: 300_000, date: new Date('2026-04-10T00:00:00Z') }),
        ];

        const result = calculateYearToDateSummary(transactions, 2026);

        // The year is empty of income and expense, but it is not empty. Money moved.
        // The counter therefore sits above the type branch, not inside it - a caller
        // asking "was there anything here?" must not be told no.
        expect(result.totalIncome).toBe(0);
        expect(result.totalExpenses).toBe(0);
        expect(result.transactionCount).toBe(1);
    });
});
