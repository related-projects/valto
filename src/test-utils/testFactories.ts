/**
 * Test Data Factories
 *
 * Deterministic factory functions for creating domain entities in tests.
 * Each function returns a valid entity with sensible defaults that can
 * be overridden via partial arguments.
 */

import { TransactionType, type Transaction } from '../domain/entities/Transaction';
import { WalletType, type Wallet } from '../domain/entities/Wallet';
import { CategoryType, type Category } from '../domain/entities/Category';
import type { Budget } from '../domain/entities/Budget';
import { RecurrenceFrequency, type RecurringTransaction } from '../domain/entities/RecurringTransaction';

// ─── Counters ─────────────────────────────────────────────────────────

let walletCounter = 0;
let transactionCounter = 0;
let categoryCounter = 0;
let budgetCounter = 0;
let ruleCounter = 0;

/**
 * Reset all counters between test suites if needed
 */
export function resetFactoryCounters(): void {
    walletCounter = 0;
    transactionCounter = 0;
    categoryCounter = 0;
    budgetCounter = 0;
    ruleCounter = 0;
}

// ─── Wallet ───────────────────────────────────────────────────────────

export function makeWallet(overrides: Partial<Wallet> = {}): Wallet {
    walletCounter++;
    return {
        id: `wallet-${walletCounter}`,
        name: `Test Wallet ${walletCounter}`,
        balance: 100000,
        type: WalletType.CASH,
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        ...overrides,
    };
}

// ─── Transaction ──────────────────────────────────────────────────────

export function makeTransaction(overrides: Partial<Transaction> = {}): Transaction {
    transactionCounter++;
    return {
        id: `tx-${transactionCounter}`,
        type: TransactionType.EXPENSE,
        amount: 5000,
        categoryId: 'cat-food',
        walletId: 'wallet-1',
        date: new Date('2026-03-15T00:00:00.000Z'),
        createdAt: new Date('2026-03-15T00:00:00.000Z'),
        ...overrides,
    };
}

// ─── Category ─────────────────────────────────────────────────────────

export function makeCategory(overrides: Partial<Category> = {}): Category {
    categoryCounter++;
    return {
        id: `cat-${categoryCounter}`,
        name: `Category ${categoryCounter}`,
        type: CategoryType.EXPENSE,
        icon: '📦',
        color: '#FF5722',
        ...overrides,
    };
}

// ─── Budget ───────────────────────────────────────────────────────────

export function makeBudget(overrides: Partial<Budget> = {}): Budget {
    budgetCounter++;
    return {
        id: `budget-${budgetCounter}`,
        categoryId: `cat-${budgetCounter}`,
        month: '2026-03',
        limitAmount: 100000,
        createdAt: new Date('2026-03-01T00:00:00.000Z'),
        updatedAt: new Date('2026-03-01T00:00:00.000Z'),
        ...overrides,
    };
}

// ─── Recurring Transaction ────────────────────────────────────────────

export function makeRecurringRule(overrides: Partial<RecurringTransaction> = {}): RecurringTransaction {
    ruleCounter++;
    return {
        id: `rule-${ruleCounter}`,
        type: TransactionType.EXPENSE,
        amount: 10000,
        walletId: 'wallet-1',
        categoryId: 'cat-food',
        description: `Recurring ${ruleCounter}`,
        startDate: new Date('2026-01-01T00:00:00.000Z'),
        frequency: RecurrenceFrequency.MONTHLY,
        interval: 1,
        lastGeneratedDate: new Date('2025-12-01T00:00:00.000Z'),
        isPaused: false,
        createdAt: new Date('2025-12-15T00:00:00.000Z'),
        ...overrides,
    };
}
