/**
 * useDashboard Hook Tests
 *
 * Tests spending aggregation, percentage change calculations,
 * top-5 category sorting, year boundary handling, and default colors.
 */

import { renderHook, waitFor } from '@testing-library/react-native';
import { createTestDb } from '../../../tests/helpers/createTestDb';
import type { SqlDatabase } from '../../data/storage/sql/SqlDatabase';
import { CategoryRepository } from '../../data/repositories/CategoryRepository';
import { TransactionRepository } from '../../data/repositories/TransactionRepository';
import { BudgetRepository } from '../../data/repositories/BudgetRepository';
import { WalletRepository } from '../../data/repositories/WalletRepository';
import { CategoryType, TransactionType, getCurrentMonth } from '../../domain/entities';

// Shared state
let mockDb: SqlDatabase;
let mockTransactionRepo: TransactionRepository;
let mockCategoryRepo: CategoryRepository;
let mockBudgetRepo: BudgetRepository;
let mockWalletRepo: WalletRepository;

jest.mock('../../core/di', () => ({
    getTransactionRepository: () => mockTransactionRepo,
    getCategoryRepository: () => mockCategoryRepo,
    getBudgetRepository: () => mockBudgetRepo,
    getWalletRepository: () => mockWalletRepo,
    getUseCaseDeps: () => ({
        runInTransaction: (work: any) => mockDb.runInTransaction(work),
        transactionRepo: mockTransactionRepo,
        walletRepo: mockWalletRepo,
        categoryRepo: mockCategoryRepo,
        eventBus: { emit: jest.fn(), emitMultiple: jest.fn() },
    }),
}));

jest.mock('../../core/events', () => ({
    dataEvents: {
        subscribe: jest.fn(() => jest.fn()),
        emit: jest.fn(),
        emitMultiple: jest.fn(),
    },
}));

import { useDashboard } from '../useDashboard';

describe('useDashboard', () => {
    const currentMonth = getCurrentMonth();
    const [year, month] = currentMonth.split('-').map(Number);

    beforeEach(async () => {
        mockDb = await createTestDb();
        mockTransactionRepo = new TransactionRepository(mockDb);
        mockCategoryRepo = new CategoryRepository(mockDb);
        mockBudgetRepo = new BudgetRepository(mockDb);
        mockWalletRepo = new WalletRepository(mockDb);
    });

    it('returns empty data when no transactions exist', async () => {
        const { result } = renderHook(() => useDashboard());

        await waitFor(() => {
            expect(result.current.loading).toBe(false);
        });

        expect(result.current.spendingByCategory).toEqual([]);
        expect(result.current.hasExpenseData).toBe(false);
        expect(result.current.currentMonthIncome).toBe(0);
        expect(result.current.currentMonthExpense).toBe(0);
        expect(result.current.netBalance).toBe(0);
    });

    it('aggregates current month income and expenses correctly', async () => {
        await mockTransactionRepo.create({
            type: TransactionType.INCOME,
            amount: 500000,
            categoryId: 'cat-salary',
            walletId: 'w-1',
            date: new Date(Date.UTC(year, month - 1, 10)),
        });

        await mockTransactionRepo.create({
            type: TransactionType.EXPENSE,
            amount: 120000,
            categoryId: 'cat-food',
            walletId: 'w-1',
            date: new Date(Date.UTC(year, month - 1, 12)),
        });

        await mockTransactionRepo.create({
            type: TransactionType.EXPENSE,
            amount: 30000,
            categoryId: 'cat-transport',
            walletId: 'w-1',
            date: new Date(Date.UTC(year, month - 1, 15)),
        });

        const { result } = renderHook(() => useDashboard());

        await waitFor(() => {
            expect(result.current.loading).toBe(false);
            expect(result.current.currentMonthIncome).toBe(500000);
        });

        expect(result.current.currentMonthExpense).toBe(150000);
        expect(result.current.netBalance).toBe(350000);
        expect(result.current.hasExpenseData).toBe(true);
    });

    it('calculates percentage changes vs previous month', async () => {
        // Previous month income/expense
        let prevMonth = month - 1;
        let prevYear = year;
        if (prevMonth === 0) { prevMonth = 12; prevYear -= 1; }

        await mockTransactionRepo.create({
            type: TransactionType.INCOME,
            amount: 400000,
            categoryId: 'cat-salary',
            walletId: 'w-1',
            date: new Date(Date.UTC(prevYear, prevMonth - 1, 5)),
        });

        await mockTransactionRepo.create({
            type: TransactionType.EXPENSE,
            amount: 200000,
            categoryId: 'cat-food',
            walletId: 'w-1',
            date: new Date(Date.UTC(prevYear, prevMonth - 1, 10)),
        });

        // Current month income/expense
        await mockTransactionRepo.create({
            type: TransactionType.INCOME,
            amount: 500000,
            categoryId: 'cat-salary',
            walletId: 'w-1',
            date: new Date(Date.UTC(year, month - 1, 5)),
        });

        await mockTransactionRepo.create({
            type: TransactionType.EXPENSE,
            amount: 100000,
            categoryId: 'cat-food',
            walletId: 'w-1',
            date: new Date(Date.UTC(year, month - 1, 10)),
        });

        const { result } = renderHook(() => useDashboard());

        await waitFor(() => {
            expect(result.current.loading).toBe(false);
            expect(result.current.currentMonthIncome).toBe(500000);
        });

        // Income: (500000-400000)/400000 * 100 = 25%
        expect(result.current.incomeChange).toBeCloseTo(25, 0);
        // Expense: (100000-200000)/200000 * 100 = -50%
        expect(result.current.expenseChange).toBeCloseTo(-50, 0);
    });

    it('returns null for percentage changes when previous month has zero values', async () => {
        // Only current month data, no previous month
        await mockTransactionRepo.create({
            type: TransactionType.INCOME,
            amount: 300000,
            categoryId: 'cat-salary',
            walletId: 'w-1',
            date: new Date(Date.UTC(year, month - 1, 5)),
        });

        const { result } = renderHook(() => useDashboard());

        await waitFor(() => {
            expect(result.current.loading).toBe(false);
            expect(result.current.currentMonthIncome).toBe(300000);
        });

        expect(result.current.incomeChange).toBeNull();
        expect(result.current.expenseChange).toBeNull();
    });

    it('returns top 5 categories sorted by value descending', async () => {
        // Create 6 categories with different spending amounts
        const catIds = ['cat-a', 'cat-b', 'cat-c', 'cat-d', 'cat-e', 'cat-f'];
        const amounts = [10000, 50000, 30000, 70000, 20000, 40000];

        for (let i = 0; i < 6; i++) {
            await mockCategoryRepo.create({
                name: `Category ${i}`,
                type: CategoryType.EXPENSE,
                color: `#FF000${i}`,
            });
        }

        const cats = await mockCategoryRepo.getAll();

        for (let i = 0; i < 6; i++) {
            await mockTransactionRepo.create({
                type: TransactionType.EXPENSE,
                amount: amounts[i],
                categoryId: cats[i].id,
                walletId: 'w-1',
                date: new Date(Date.UTC(year, month - 1, 5)),
            });
        }

        const { result } = renderHook(() => useDashboard());

        await waitFor(() => {
            expect(result.current.loading).toBe(false);
            expect(result.current.spendingByCategory.length).toBeGreaterThan(0);
        });

        // Should be capped at 5
        expect(result.current.spendingByCategory.length).toBeLessThanOrEqual(5);
        // Should be sorted descending
        const values = result.current.spendingByCategory.map(s => s.value);
        for (let i = 1; i < values.length; i++) {
            expect(values[i - 1]).toBeGreaterThanOrEqual(values[i]);
        }
    });

    it('uses default colors for categories without a color', async () => {
        // Create a transaction with a category that doesn't exist in repo
        await mockTransactionRepo.create({
            type: TransactionType.EXPENSE,
            amount: 5000,
            categoryId: 'non-existent-cat',
            walletId: 'w-1',
            date: new Date(Date.UTC(year, month - 1, 5)),
        });

        const { result } = renderHook(() => useDashboard());

        await waitFor(() => {
            expect(result.current.loading).toBe(false);
            expect(result.current.spendingByCategory.length).toBe(1);
        });

        expect(result.current.spendingByCategory[0].name).toBe('Unknown');
        // Should use a default color from the palette
        expect(result.current.spendingByCategory[0].color).toBeTruthy();
    });

    it('ignores transactions from other months', async () => {
        // Transaction from 2 months ago
        let twoMonthsAgo = month - 2;
        let twoMonthsYear = year;
        if (twoMonthsAgo <= 0) { twoMonthsAgo += 12; twoMonthsYear -= 1; }

        await mockTransactionRepo.create({
            type: TransactionType.EXPENSE,
            amount: 99999,
            categoryId: 'cat-food',
            walletId: 'w-1',
            date: new Date(Date.UTC(twoMonthsYear, twoMonthsAgo - 1, 5)),
        });

        const { result } = renderHook(() => useDashboard());

        await waitFor(() => {
            expect(result.current.loading).toBe(false);
        });

        // Should not include the old transaction in current month
        expect(result.current.currentMonthExpense).toBe(0);
        // Should not count it as previous month either
        expect(result.current.previousMonthExpense).toBe(0);
    });

    it('calculates correct percentages per category', async () => {
        await mockTransactionRepo.create({
            type: TransactionType.EXPENSE,
            amount: 75000,
            categoryId: 'cat-food',
            walletId: 'w-1',
            date: new Date(Date.UTC(year, month - 1, 5)),
        });

        await mockTransactionRepo.create({
            type: TransactionType.EXPENSE,
            amount: 25000,
            categoryId: 'cat-transport',
            walletId: 'w-1',
            date: new Date(Date.UTC(year, month - 1, 10)),
        });

        const { result } = renderHook(() => useDashboard());

        await waitFor(() => {
            expect(result.current.loading).toBe(false);
            expect(result.current.spendingByCategory.length).toBe(2);
        });

        const totalPercentage = result.current.spendingByCategory
            .reduce((sum, cat) => sum + cat.percentage, 0);
        expect(totalPercentage).toBeCloseTo(100, 0);
    });
});
