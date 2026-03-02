/**
 * Domain Entity Tests
 *
 * Tests serialization, deserialization, and validation functions
 * for all domain entities (Wallet, Transaction, Budget, Category).
 */

import {
    deserializeWallet,
    serializeWallet,
    validateWalletBalance,
    Wallet,
    WalletType,
} from '../../domain/entities/Wallet';

import {
    deserializeTransaction,
    serializeTransaction,
    Transaction,
    TransactionType,
} from '../../domain/entities/Transaction';

import {
    Budget,
    deserializeBudget,
    getCurrentMonth,
    isValidBudgetMonth,
    serializeBudget,
} from '../../domain/entities/Budget';

import {
    Category,
    CategoryType,
    deserializeCategory,
    serializeCategory,
} from '../../domain/entities/Category';

// ───────────────────────────────────────────────
// Wallet Entity
// ───────────────────────────────────────────────

describe('Wallet Entity', () => {
    const sampleWallet: Wallet = {
        id: 'w-1',
        name: 'Cash',
        balance: 50000,
        type: WalletType.CASH,
        color: '#4CAF50',
        createdAt: new Date('2026-01-15T10:00:00.000Z'),
    };

    describe('serializeWallet / deserializeWallet', () => {
        it('round-trip preserves all fields', () => {
            const serialized = serializeWallet(sampleWallet);
            const deserialized = deserializeWallet(serialized);

            expect(deserialized.id).toBe(sampleWallet.id);
            expect(deserialized.name).toBe(sampleWallet.name);
            expect(deserialized.balance).toBe(sampleWallet.balance);
            expect(deserialized.type).toBe(sampleWallet.type);
            expect(deserialized.color).toBe(sampleWallet.color);
            expect(deserialized.createdAt).toEqual(sampleWallet.createdAt);
            expect(deserialized.createdAt).toBeInstanceOf(Date);
        });

        it('serialized createdAt is an ISO string', () => {
            const serialized = serializeWallet(sampleWallet);
            expect(typeof serialized.createdAt).toBe('string');
            expect(serialized.createdAt).toBe('2026-01-15T10:00:00.000Z');
        });
    });

    describe('validateWalletBalance', () => {
        it('returns false for cash wallet with negative balance', () => {
            const wallet: Wallet = { ...sampleWallet, type: WalletType.CASH, balance: -100 };
            expect(validateWalletBalance(wallet)).toBe(false);
        });

        it('returns false for mobile wallet with negative balance', () => {
            const wallet: Wallet = { ...sampleWallet, type: WalletType.MOBILE, balance: -1 };
            expect(validateWalletBalance(wallet)).toBe(false);
        });

        it('returns true for cash wallet with zero balance', () => {
            const wallet: Wallet = { ...sampleWallet, type: WalletType.CASH, balance: 0 };
            expect(validateWalletBalance(wallet)).toBe(true);
        });

        it('returns true for bank wallet with negative balance (overdraft)', () => {
            const wallet: Wallet = { ...sampleWallet, type: WalletType.BANK, balance: -5000 };
            expect(validateWalletBalance(wallet)).toBe(true);
        });

        it('returns true for savings wallet with negative balance', () => {
            const wallet: Wallet = { ...sampleWallet, type: WalletType.SAVINGS, balance: -100 };
            expect(validateWalletBalance(wallet)).toBe(true);
        });
    });
});

// ───────────────────────────────────────────────
// Transaction Entity
// ───────────────────────────────────────────────

describe('Transaction Entity', () => {
    const sampleTransaction: Transaction = {
        id: 't-1',
        type: TransactionType.EXPENSE,
        amount: 2500,
        categoryId: 'cat-food',
        walletId: 'w-1',
        date: new Date('2026-02-20T12:00:00.000Z'),
        note: 'Lunch',
        createdAt: new Date('2026-02-20T12:01:00.000Z'),
    };

    describe('serializeTransaction / deserializeTransaction', () => {
        it('round-trip preserves all fields including dates', () => {
            const serialized = serializeTransaction(sampleTransaction);
            const deserialized = deserializeTransaction(serialized);

            expect(deserialized.id).toBe(sampleTransaction.id);
            expect(deserialized.type).toBe(sampleTransaction.type);
            expect(deserialized.amount).toBe(sampleTransaction.amount);
            expect(deserialized.categoryId).toBe(sampleTransaction.categoryId);
            expect(deserialized.walletId).toBe(sampleTransaction.walletId);
            expect(deserialized.note).toBe(sampleTransaction.note);
            expect(deserialized.date).toEqual(sampleTransaction.date);
            expect(deserialized.date).toBeInstanceOf(Date);
            expect(deserialized.createdAt).toEqual(sampleTransaction.createdAt);
            expect(deserialized.createdAt).toBeInstanceOf(Date);
        });

        it('handles transaction without optional note', () => {
            const txNoNote: Transaction = { ...sampleTransaction, note: undefined };
            const serialized = serializeTransaction(txNoNote);
            const deserialized = deserializeTransaction(serialized);
            expect(deserialized.note).toBeUndefined();
        });
    });
});

// ───────────────────────────────────────────────
// Budget Entity
// ───────────────────────────────────────────────

describe('Budget Entity', () => {
    const sampleBudget: Budget = {
        id: 'b-1',
        categoryId: 'cat-food',
        month: '2026-03',
        limitAmount: 100000,
        createdAt: new Date('2026-03-01T00:00:00.000Z'),
        updatedAt: new Date('2026-03-01T00:00:00.000Z'),
    };

    describe('serializeBudget / deserializeBudget', () => {
        it('round-trip preserves all fields', () => {
            const serialized = serializeBudget(sampleBudget);
            const deserialized = deserializeBudget(serialized);

            expect(deserialized.id).toBe(sampleBudget.id);
            expect(deserialized.categoryId).toBe(sampleBudget.categoryId);
            expect(deserialized.month).toBe(sampleBudget.month);
            expect(deserialized.limitAmount).toBe(sampleBudget.limitAmount);
            expect(deserialized.createdAt).toEqual(sampleBudget.createdAt);
            expect(deserialized.updatedAt).toEqual(sampleBudget.updatedAt);
        });
    });

    describe('isValidBudgetMonth', () => {
        it('accepts valid months', () => {
            expect(isValidBudgetMonth('2026-01')).toBe(true);
            expect(isValidBudgetMonth('2026-12')).toBe(true);
            expect(isValidBudgetMonth('2024-06')).toBe(true);
        });

        it('rejects invalid formats', () => {
            expect(isValidBudgetMonth('2026-00')).toBe(false);
            expect(isValidBudgetMonth('2026-13')).toBe(false);
            expect(isValidBudgetMonth('2026/03')).toBe(false);
            expect(isValidBudgetMonth('March 2026')).toBe(false);
            expect(isValidBudgetMonth('')).toBe(false);
        });
    });

    describe('getCurrentMonth', () => {
        it('returns YYYY-MM format for mocked date', () => {
            jest.useFakeTimers();
            jest.setSystemTime(new Date('2026-03-15T10:00:00.000Z'));

            expect(getCurrentMonth()).toBe('2026-03');

            jest.useRealTimers();
        });
    });
});

// ───────────────────────────────────────────────
// Category Entity
// ───────────────────────────────────────────────

describe('Category Entity', () => {
    const sampleCategory: Category = {
        id: 'cat-1',
        name: 'Food',
        type: CategoryType.EXPENSE,
        icon: '🍔',
        color: '#FF5722',
    };

    describe('serializeCategory / deserializeCategory', () => {
        it('round-trip preserves all fields (identity mapping)', () => {
            const serialized = serializeCategory(sampleCategory);
            const deserialized = deserializeCategory(serialized);
            expect(deserialized).toEqual(sampleCategory);
        });
    });
});
