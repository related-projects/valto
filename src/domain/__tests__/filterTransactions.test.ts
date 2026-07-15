/**
 * filterTransactions — Unit Tests
 *
 * Comprehensive test suite for the pure filterTransactions function.
 * Uses fixed mock data and is fully deterministic with no UI dependency.
 */

import { Transaction, TransactionType } from '../../domain/entities';
import { filterTransactions, TransactionFilters } from '../../domain/filters/filterTransactions';

// ─── Fixed Mock Data ──────────────────────────────────────────────────

const MOCK_TRANSACTIONS: Transaction[] = [
    {
        id: 'tx-1',
        type: TransactionType.EXPENSE,
        amount: 5000,
        categoryId: 'food',
        walletId: 'wallet-cash',
        date: new Date('2026-03-01T10:00:00'),
        note: 'Groceries',
        createdAt: new Date('2026-03-01T10:00:00'),
    },
    {
        id: 'tx-2',
        type: TransactionType.INCOME,
        amount: 200000,
        categoryId: 'salary',
        walletId: 'wallet-bank',
        date: new Date('2026-03-05T09:00:00'),
        note: 'Monthly salary',
        createdAt: new Date('2026-03-05T09:00:00'),
    },
    {
        id: 'tx-3',
        type: TransactionType.EXPENSE,
        amount: 15000,
        categoryId: 'transport',
        walletId: 'wallet-cash',
        date: new Date('2026-03-10T14:30:00'),
        note: 'Taxi ride',
        createdAt: new Date('2026-03-10T14:30:00'),
    },
    {
        id: 'tx-4',
        type: TransactionType.TRANSFER,
        amount: 50000,
        categoryId: 'transfer',
        walletId: 'wallet-bank',
        date: new Date('2026-03-15T12:00:00'),
        note: 'Bank to cash',
        createdAt: new Date('2026-03-15T12:00:00'),
    },
    {
        id: 'tx-5',
        type: TransactionType.EXPENSE,
        amount: 8000,
        categoryId: 'food',
        walletId: 'wallet-bank',
        date: new Date('2026-03-20T18:00:00'),
        note: 'Restaurant dinner',
        createdAt: new Date('2026-03-20T18:00:00'),
    },
    {
        id: 'tx-6',
        type: TransactionType.INCOME,
        amount: 30000,
        categoryId: 'freelance',
        walletId: 'wallet-mobile',
        date: new Date('2026-03-25T16:00:00'),
        note: 'Freelance project',
        createdAt: new Date('2026-03-25T16:00:00'),
    },
    {
        id: 'tx-7',
        type: TransactionType.EXPENSE,
        amount: 3000,
        categoryId: 'entertainment',
        walletId: 'wallet-mobile',
        date: new Date('2026-03-31T20:00:00'),
        note: 'Movie tickets',
        createdAt: new Date('2026-03-31T20:00:00'),
    },
];

// ─── Tests ────────────────────────────────────────────────────────────

describe('filterTransactions', () => {
    // ── 1. No filters → returns all transactions ──────────────────────

    it('returns all transactions when filters are empty', () => {
        const result = filterTransactions(MOCK_TRANSACTIONS, {});
        expect(result).toHaveLength(MOCK_TRANSACTIONS.length);
        expect(result).toEqual(MOCK_TRANSACTIONS);
    });

    it('returns all transactions when filters is an empty object with undefined fields', () => {
        const filters: TransactionFilters = {
            types: undefined,
            categoryIds: undefined,
            walletIds: undefined,
            startDate: undefined,
            endDate: undefined,
            minAmount: undefined,
            maxAmount: undefined,
        };
        const result = filterTransactions(MOCK_TRANSACTIONS, filters);
        expect(result).toHaveLength(MOCK_TRANSACTIONS.length);
    });

    // ── 2. Filter by type ─────────────────────────────────────────────

    it('filters by a single type (expense)', () => {
        const result = filterTransactions(MOCK_TRANSACTIONS, {
            types: [TransactionType.EXPENSE],
        });
        expect(result).toHaveLength(4); // tx-1, tx-3, tx-5, tx-7
        expect(result.every(t => t.type === TransactionType.EXPENSE)).toBe(true);
    });

    it('filters by a single type (income)', () => {
        const result = filterTransactions(MOCK_TRANSACTIONS, {
            types: [TransactionType.INCOME],
        });
        expect(result).toHaveLength(2); // tx-2, tx-6
        expect(result.every(t => t.type === TransactionType.INCOME)).toBe(true);
    });

    it('filters by a single type (transfer)', () => {
        const result = filterTransactions(MOCK_TRANSACTIONS, {
            types: [TransactionType.TRANSFER],
        });
        expect(result).toHaveLength(1); // tx-4
        expect(result[0].id).toBe('tx-4');
    });

    it('filters by multiple types (income + transfer)', () => {
        const result = filterTransactions(MOCK_TRANSACTIONS, {
            types: [TransactionType.INCOME, TransactionType.TRANSFER],
        });
        expect(result).toHaveLength(3); // tx-2, tx-4, tx-6
        result.forEach(t => {
            expect([TransactionType.INCOME, TransactionType.TRANSFER]).toContain(t.type);
        });
    });

    it('ignores empty types array (returns all)', () => {
        const result = filterTransactions(MOCK_TRANSACTIONS, { types: [] });
        expect(result).toHaveLength(MOCK_TRANSACTIONS.length);
    });

    // ── 3. Filter by category ─────────────────────────────────────────

    it('filters by a single category', () => {
        const result = filterTransactions(MOCK_TRANSACTIONS, {
            categoryIds: ['food'],
        });
        expect(result).toHaveLength(2); // tx-1, tx-5
        expect(result.every(t => t.categoryId === 'food')).toBe(true);
    });

    it('filters by multiple categories', () => {
        const result = filterTransactions(MOCK_TRANSACTIONS, {
            categoryIds: ['food', 'transport'],
        });
        expect(result).toHaveLength(3); // tx-1, tx-3, tx-5
        result.forEach(t => {
            expect(['food', 'transport']).toContain(t.categoryId);
        });
    });

    it('ignores empty categoryIds array (returns all)', () => {
        const result = filterTransactions(MOCK_TRANSACTIONS, { categoryIds: [] });
        expect(result).toHaveLength(MOCK_TRANSACTIONS.length);
    });

    // ── 4. Filter by wallet ───────────────────────────────────────────

    it('filters by a single wallet', () => {
        const result = filterTransactions(MOCK_TRANSACTIONS, {
            walletIds: ['wallet-cash'],
        });
        expect(result).toHaveLength(2); // tx-1, tx-3
        expect(result.every(t => t.walletId === 'wallet-cash')).toBe(true);
    });

    it('filters by multiple wallets', () => {
        const result = filterTransactions(MOCK_TRANSACTIONS, {
            walletIds: ['wallet-cash', 'wallet-mobile'],
        });
        expect(result).toHaveLength(4); // tx-1, tx-3, tx-6, tx-7
        result.forEach(t => {
            expect(['wallet-cash', 'wallet-mobile']).toContain(t.walletId);
        });
    });

    it('ignores empty walletIds array (returns all)', () => {
        const result = filterTransactions(MOCK_TRANSACTIONS, { walletIds: [] });
        expect(result).toHaveLength(MOCK_TRANSACTIONS.length);
    });

    // ── 5. Filter by date range ───────────────────────────────────────

    it('filters by date range (inclusive on both boundaries)', () => {
        const result = filterTransactions(MOCK_TRANSACTIONS, {
            startDate: new Date('2026-03-05'),
            endDate: new Date('2026-03-20'),
        });
        // tx-2 (Mar 5), tx-3 (Mar 10), tx-4 (Mar 15), tx-5 (Mar 20)
        expect(result).toHaveLength(4);
        expect(result.map(t => t.id)).toEqual(['tx-2', 'tx-3', 'tx-4', 'tx-5']);
    });

    it('handles same start and end date (single day)', () => {
        const result = filterTransactions(MOCK_TRANSACTIONS, {
            startDate: new Date('2026-03-10'),
            endDate: new Date('2026-03-10'),
        });
        // tx-3 only (Mar 10)
        expect(result).toHaveLength(1);
        expect(result[0].id).toBe('tx-3');
    });

    it('handles start date only', () => {
        const result = filterTransactions(MOCK_TRANSACTIONS, {
            startDate: new Date('2026-03-20'),
        });
        // tx-5 (Mar 20), tx-6 (Mar 25), tx-7 (Mar 31)
        expect(result).toHaveLength(3);
        expect(result.map(t => t.id)).toEqual(['tx-5', 'tx-6', 'tx-7']);
    });

    it('handles end date only', () => {
        const result = filterTransactions(MOCK_TRANSACTIONS, {
            endDate: new Date('2026-03-05'),
        });
        // tx-1 (Mar 1), tx-2 (Mar 5)
        expect(result).toHaveLength(2);
        expect(result.map(t => t.id)).toEqual(['tx-1', 'tx-2']);
    });

    // ── 6. Filter by amount range ─────────────────────────────────────

    it('filters by min amount only', () => {
        const result = filterTransactions(MOCK_TRANSACTIONS, {
            minAmount: 15000,
        });
        // tx-2 (200000), tx-3 (15000), tx-4 (50000), tx-6 (30000)
        expect(result).toHaveLength(4);
        expect(result.every(t => t.amount >= 15000)).toBe(true);
    });

    it('filters by max amount only', () => {
        const result = filterTransactions(MOCK_TRANSACTIONS, {
            maxAmount: 8000,
        });
        // tx-1 (5000), tx-5 (8000), tx-7 (3000)
        expect(result).toHaveLength(3);
        expect(result.every(t => t.amount <= 8000)).toBe(true);
    });

    it('filters by both min and max amount', () => {
        const result = filterTransactions(MOCK_TRANSACTIONS, {
            minAmount: 5000,
            maxAmount: 50000,
        });
        // tx-1 (5000), tx-3 (15000), tx-4 (50000), tx-5 (8000), tx-6 (30000)
        expect(result).toHaveLength(5);
        expect(result.every(t => t.amount >= 5000 && t.amount <= 50000)).toBe(true);
    });

    it('handles exact boundary amounts (inclusive)', () => {
        const result = filterTransactions(MOCK_TRANSACTIONS, {
            minAmount: 5000,
            maxAmount: 5000,
        });
        // tx-1 only (exactly 5000)
        expect(result).toHaveLength(1);
        expect(result[0].id).toBe('tx-1');
    });

    // ── 7. Combined filters ───────────────────────────────────────────

    it('combines type + wallet filters (AND logic)', () => {
        const result = filterTransactions(MOCK_TRANSACTIONS, {
            types: [TransactionType.EXPENSE],
            walletIds: ['wallet-cash'],
        });
        // tx-1 (expense, cash), tx-3 (expense, cash)
        expect(result).toHaveLength(2);
        expect(result.map(t => t.id)).toEqual(['tx-1', 'tx-3']);
    });

    it('combines category + date range filters', () => {
        const result = filterTransactions(MOCK_TRANSACTIONS, {
            categoryIds: ['food'],
            startDate: new Date('2026-03-15'),
        });
        // tx-5 (food, Mar 20)
        expect(result).toHaveLength(1);
        expect(result[0].id).toBe('tx-5');
    });

    it('combines type + category + amount filters', () => {
        const result = filterTransactions(MOCK_TRANSACTIONS, {
            types: [TransactionType.EXPENSE],
            categoryIds: ['food'],
            maxAmount: 6000,
        });
        // tx-1 (expense, food, 5000)
        expect(result).toHaveLength(1);
        expect(result[0].id).toBe('tx-1');
    });

    it('combines all filter dimensions', () => {
        const result = filterTransactions(MOCK_TRANSACTIONS, {
            types: [TransactionType.EXPENSE],
            categoryIds: ['food', 'transport'],
            walletIds: ['wallet-cash'],
            startDate: new Date('2026-03-01'),
            endDate: new Date('2026-03-15'),
            minAmount: 1000,
            maxAmount: 20000,
        });
        // tx-1 (expense, food, cash, Mar 1, 5000) ✓
        // tx-3 (expense, transport, cash, Mar 10, 15000) ✓
        expect(result).toHaveLength(2);
        expect(result.map(t => t.id)).toEqual(['tx-1', 'tx-3']);
    });

    // ── 8. No result case ─────────────────────────────────────────────

    it('returns empty array when no transactions match', () => {
        const result = filterTransactions(MOCK_TRANSACTIONS, {
            types: [TransactionType.TRANSFER],
            walletIds: ['wallet-cash'], // no transfers from cash
        });
        expect(result).toHaveLength(0);
        expect(result).toEqual([]);
    });

    it('returns empty array for non-existent category', () => {
        const result = filterTransactions(MOCK_TRANSACTIONS, {
            categoryIds: ['non-existent'],
        });
        expect(result).toHaveLength(0);
    });

    // ── 9. Invalid range handling ─────────────────────────────────────

    it('normalises invalid amount range (min > max — swaps them)', () => {
        // min=50000, max=5000 → normalised to min=5000, max=50000
        const result = filterTransactions(MOCK_TRANSACTIONS, {
            minAmount: 50000,
            maxAmount: 5000,
        });
        // Same as minAmount: 5000, maxAmount: 50000
        const expected = filterTransactions(MOCK_TRANSACTIONS, {
            minAmount: 5000,
            maxAmount: 50000,
        });
        expect(result).toEqual(expected);
    });

    // ── Edge Cases ────────────────────────────────────────────────────

    it('handles empty transaction array', () => {
        const result = filterTransactions([], {
            types: [TransactionType.EXPENSE],
        });
        expect(result).toHaveLength(0);
        expect(result).toEqual([]);
    });

    it('handles empty transaction array with no filters', () => {
        const result = filterTransactions([], {});
        expect(result).toHaveLength(0);
    });

    it('does not mutate the original array', () => {
        const original = [...MOCK_TRANSACTIONS];
        filterTransactions(MOCK_TRANSACTIONS, {
            types: [TransactionType.EXPENSE],
        });
        expect(MOCK_TRANSACTIONS).toEqual(original);
    });

    it('handles large dataset efficiently', () => {
        // Generate 2000 transactions
        const largeDataset: Transaction[] = Array.from({ length: 2000 }, (_, i) => ({
            id: `tx-large-${i}`,
            type: i % 3 === 0 ? TransactionType.EXPENSE : i % 3 === 1 ? TransactionType.INCOME : TransactionType.TRANSFER,
            amount: (i + 1) * 100,
            categoryId: `cat-${i % 10}`,
            walletId: `wallet-${i % 5}`,
            date: new Date(2026, 2, (i % 28) + 1),
            createdAt: new Date(2026, 2, (i % 28) + 1),
        }));

        const start = performance.now();
        const result = filterTransactions(largeDataset, {
            types: [TransactionType.EXPENSE],
            walletIds: ['wallet-0', 'wallet-1'],
            minAmount: 500,
            maxAmount: 100000,
        });
        const elapsed = performance.now() - start;

        // Should complete well under 100ms even on slow CI
        expect(elapsed).toBeLessThan(100);
        expect(result.length).toBeGreaterThan(0);
        expect(result.every(t => t.type === TransactionType.EXPENSE)).toBe(true);
        expect(result.every(t => ['wallet-0', 'wallet-1'].includes(t.walletId))).toBe(true);
    });
});
