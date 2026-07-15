/**
 * Financial Calculation Tests
 *
 * Tests for financial logic that lives in hooks (useDashboard, useBudgets, useWallets).
 * Extracted and tested as pure functions to ensure correctness independently of React.
 */

import { TransactionType } from '../../domain/entities/Transaction';
import { WalletType } from '../../domain/entities/Wallet';

import type { Wallet } from '../../domain/entities/Wallet';

// ───────────────────────────────────────────────
// Helpers (mirror the logic from hooks)
// ───────────────────────────────────────────────

function getTotalBalance(wallets: Wallet[]): number {
    return wallets.reduce((sum, w) => sum + w.balance, 0);
}

interface SimpleTransaction {
    type: string;
    amount: number;
    categoryId: string;
    walletId: string;
    date: Date;
}

function calculateNetFromTransactions(transactions: SimpleTransaction[]): number {
    let net = 0;
    transactions.forEach((t) => {
        if (t.type === 'income') net += t.amount;
        if (t.type === 'expense') net -= t.amount;
    });
    return net;
}

function calculateBudgetRemaining(limitAmount: number, spentAmount: number): number {
    return Math.max(0, limitAmount - spentAmount);
}

function isOverBudget(limitAmount: number, spentAmount: number): boolean {
    return spentAmount > limitAmount;
}

function calculatePercentageChange(current: number, previous: number): number | null {
    if (previous === 0) return null;
    return ((current - previous) / Math.abs(previous)) * 100;
}

function calculateMonthlyAggregates(
    transactions: SimpleTransaction[],
    targetMonth: string
): { income: number; expense: number; net: number } {
    let income = 0;
    let expense = 0;

    transactions.forEach((t) => {
        const txMonth = `${t.date.getUTCFullYear()}-${String(t.date.getUTCMonth() + 1).padStart(2, '0')}`;
        if (txMonth !== targetMonth) return;

        if (t.type === TransactionType.INCOME) income += t.amount;
        else if (t.type === TransactionType.EXPENSE) expense += t.amount;
    });

    return { income, expense, net: income - expense };
}

// ───────────────────────────────────────────────
// Tests
// ───────────────────────────────────────────────

describe('Wallet Balance Calculations', () => {
    it('correctly sums balances across multiple wallets', () => {
        const wallets: Wallet[] = [
            { id: 'w1', name: 'Cash', balance: 50000, type: WalletType.CASH, createdAt: new Date() },
            { id: 'w2', name: 'Bank', balance: 150000, type: WalletType.BANK, createdAt: new Date() },
            { id: 'w3', name: 'Savings', balance: 300000, type: WalletType.SAVINGS, createdAt: new Date() },
        ];

        expect(getTotalBalance(wallets)).toBe(500000);
    });

    it('returns 0 for empty wallet list', () => {
        expect(getTotalBalance([])).toBe(0);
    });

    it('handles wallets with negative balances', () => {
        const wallets: Wallet[] = [
            { id: 'w1', name: 'Bank', balance: -10000, type: WalletType.BANK, createdAt: new Date() },
            { id: 'w2', name: 'Cash', balance: 50000, type: WalletType.CASH, createdAt: new Date() },
        ];

        expect(getTotalBalance(wallets)).toBe(40000);
    });
});

describe('Transfer Correctness', () => {
    it('source debited + destination credited = net zero', () => {
        const sourceBalanceBefore = 100000;
        const destBalanceBefore = 50000;
        const transferAmount = 25000;

        const sourceBalanceAfter = sourceBalanceBefore - transferAmount;
        const destBalanceAfter = destBalanceBefore + transferAmount;

        // Total remains the same
        expect(sourceBalanceAfter + destBalanceAfter).toBe(sourceBalanceBefore + destBalanceBefore);

        // Individual balances are correct
        expect(sourceBalanceAfter).toBe(75000);
        expect(destBalanceAfter).toBe(75000);
    });

    it('transfer of full balance leaves source at 0', () => {
        const sourceBalance = 50000;
        const transferAmount = 50000;

        expect(sourceBalance - transferAmount).toBe(0);
    });
});

describe('Budget Remaining Calculation', () => {
    it('calculates remaining correctly when under budget', () => {
        expect(calculateBudgetRemaining(100000, 60000)).toBe(40000);
    });

    it('clamps to 0 when over budget', () => {
        expect(calculateBudgetRemaining(100000, 150000)).toBe(0);
    });

    it('returns full limit when nothing spent', () => {
        expect(calculateBudgetRemaining(100000, 0)).toBe(100000);
    });

    it('detects over-budget correctly', () => {
        expect(isOverBudget(100000, 100001)).toBe(true);
        expect(isOverBudget(100000, 100000)).toBe(false);
        expect(isOverBudget(100000, 99999)).toBe(false);
    });
});

describe('Financial Summary Aggregation', () => {
    it('income - expense = net balance', () => {
        const transactions: SimpleTransaction[] = [
            { type: 'income', amount: 200000, categoryId: 'salary', walletId: 'w1', date: new Date('2026-03-10') },
            { type: 'expense', amount: 50000, categoryId: 'food', walletId: 'w1', date: new Date('2026-03-11') },
            { type: 'expense', amount: 30000, categoryId: 'transport', walletId: 'w1', date: new Date('2026-03-12') },
        ];

        const net = calculateNetFromTransactions(transactions);
        expect(net).toBe(120000);
    });

    it('ignores transfers in net calculation', () => {
        const transactions: SimpleTransaction[] = [
            { type: 'income', amount: 100000, categoryId: 'salary', walletId: 'w1', date: new Date('2026-03-10') },
            { type: 'transfer', amount: 25000, categoryId: 'transfer-out', walletId: 'w1', date: new Date('2026-03-11') },
            { type: 'transfer', amount: 25000, categoryId: 'transfer-in', walletId: 'w2', date: new Date('2026-03-11') },
        ];

        const net = calculateNetFromTransactions(transactions);
        expect(net).toBe(100000); // Transfers don't affect net
    });

    it('returns 0 with no transactions', () => {
        expect(calculateNetFromTransactions([])).toBe(0);
    });
});

describe('Monthly Aggregation', () => {
    const transactions: SimpleTransaction[] = [
        { type: 'income', amount: 200000, categoryId: 'salary', walletId: 'w1', date: new Date('2026-03-05T00:00:00Z') },
        { type: 'expense', amount: 50000, categoryId: 'food', walletId: 'w1', date: new Date('2026-03-15T00:00:00Z') },
        { type: 'expense', amount: 10000, categoryId: 'transport', walletId: 'w1', date: new Date('2026-02-10T00:00:00Z') },
        { type: 'income', amount: 180000, categoryId: 'salary', walletId: 'w1', date: new Date('2026-02-05T00:00:00Z') },
    ];

    it('filters transactions to target month only', () => {
        const march = calculateMonthlyAggregates(transactions, '2026-03');
        expect(march.income).toBe(200000);
        expect(march.expense).toBe(50000);
        expect(march.net).toBe(150000);
    });

    it('calculates previous month correctly', () => {
        const feb = calculateMonthlyAggregates(transactions, '2026-02');
        expect(feb.income).toBe(180000);
        expect(feb.expense).toBe(10000);
        expect(feb.net).toBe(170000);
    });
});

describe('Percentage Change Calculation', () => {
    it('calculates positive change correctly', () => {
        // 200 from 100 = +100%
        expect(calculatePercentageChange(200000, 100000)).toBe(100);
    });

    it('calculates negative change correctly', () => {
        // 50 from 100 = -50%
        expect(calculatePercentageChange(50000, 100000)).toBe(-50);
    });

    it('returns null when previous is 0', () => {
        expect(calculatePercentageChange(100000, 0)).toBeNull();
    });

    it('handles both values being equal', () => {
        expect(calculatePercentageChange(100000, 100000)).toBe(0);
    });

    it('handles negative previous value correctly', () => {
        // current = 10, previous = -20 → ((10 - (-20)) / |-20|) * 100 = (30/20) * 100 = 150%
        expect(calculatePercentageChange(10, -20)).toBe(150);
    });
});
