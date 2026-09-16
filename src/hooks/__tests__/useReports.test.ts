/**
 * useReports Hook Tests
 *
 * Tests monthly aggregation, category breakdown computation,
 * month navigation, and YTD summary integration.
 */

import { act, renderHook, waitFor } from '@testing-library/react-native';
import { createTestDb } from '../../../tests/helpers/createTestDb';
import type { SqlDatabase } from '../../data/storage/sql/SqlDatabase';
import { BudgetRepository } from '../../data/repositories/BudgetRepository';
import { CategoryRepository } from '../../data/repositories/CategoryRepository';
import { TransactionRepository } from '../../data/repositories/TransactionRepository';
import { WalletRepository } from '../../data/repositories/WalletRepository';
import { CategoryType, TransactionType, WalletType, getCurrentMonth } from '../../domain/entities';

// Shared state
let mockDb: SqlDatabase;
let mockBudgetRepo: BudgetRepository;
let mockCategoryRepo: CategoryRepository;
let mockTransactionRepo: TransactionRepository;
let mockWalletRepo: WalletRepository;

jest.mock('../../core/di', () => ({
    getBudgetRepository: () => mockBudgetRepo,
    getCategoryRepository: () => mockCategoryRepo,
    getTransactionRepository: () => mockTransactionRepo,
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

import { useReports } from '../useReports';

describe('useReports', () => {
    const currentMonth = getCurrentMonth();

    beforeEach(async () => {
        mockDb = await createTestDb();
        mockBudgetRepo = new BudgetRepository(mockDb);
        mockCategoryRepo = new CategoryRepository(mockDb);
        mockTransactionRepo = new TransactionRepository(mockDb);
        mockWalletRepo = new WalletRepository(mockDb);
    });

    it('loads with current month selected', async () => {
        const { result } = renderHook(() => useReports());

        await waitFor(() => {
            expect(result.current.loading).toBe(false);
        });

        expect(result.current.selectedMonth).toBe(currentMonth);
    });

    it('provides human-readable month label', async () => {
        const { result } = renderHook(() => useReports());

        await waitFor(() => {
            expect(result.current.loading).toBe(false);
        });

        // Should contain a year and month name
        expect(result.current.monthLabel).toMatch(/\w+ \d{4}/);
    });

    it('navigates to previous month', async () => {
        const { result } = renderHook(() => useReports());

        await waitFor(() => {
            expect(result.current.loading).toBe(false);
        });

        const originalMonth = result.current.selectedMonth;

        act(() => {
            result.current.goToPreviousMonth();
        });

        expect(result.current.selectedMonth).not.toBe(originalMonth);
        // Previous month should have smaller numerical value
        expect(result.current.selectedMonth < originalMonth).toBe(true);
    });

    it('navigates to next month', async () => {
        const { result } = renderHook(() => useReports());

        await waitFor(() => {
            expect(result.current.loading).toBe(false);
        });

        // First go back, then forward, to avoid going beyond current
        act(() => {
            result.current.goToPreviousMonth();
        });

        const before = result.current.selectedMonth;

        act(() => {
            result.current.goToNextMonth();
        });

        expect(result.current.selectedMonth > before).toBe(true);
    });

    it('returns zeros with no transactions', async () => {
        const { result } = renderHook(() => useReports());

        await waitFor(() => {
            expect(result.current.loading).toBe(false);
        });

        expect(result.current.totalIncome).toBe(0);
        expect(result.current.totalExpense).toBe(0);
        expect(result.current.netBalance).toBe(0);
        expect(result.current.savingsRate).toBeNull();
        expect(result.current.categoryBreakdown).toEqual([]);
        expect(result.current.hasExpenseData).toBe(false);
    });

    it('computes aggregations from transactions', async () => {
        // Parse current month for seeding
        const [year, month] = currentMonth.split('-').map(Number);

        await mockTransactionRepo.create({
            type: TransactionType.INCOME,
            amount: 200000,
            categoryId: 'cat-salary',
            walletId: 'w-1',
            date: new Date(Date.UTC(year, month - 1, 5)),
        });

        await mockTransactionRepo.create({
            type: TransactionType.EXPENSE,
            amount: 50000,
            categoryId: 'cat-food',
            walletId: 'w-1',
            date: new Date(Date.UTC(year, month - 1, 10)),
        });

        await mockCategoryRepo.create({
            name: 'Food',
            type: CategoryType.EXPENSE,
        });

        const { result } = renderHook(() => useReports());

        await waitFor(() => {
            expect(result.current.loading).toBe(false);
            // Wait for transactions to be loaded
            expect(result.current.totalIncome).toBe(200000);
        });

        expect(result.current.totalExpense).toBe(50000);
        expect(result.current.netBalance).toBe(150000);
        expect(result.current.savingsRate).toBeCloseTo(75, 0);
        expect(result.current.hasExpenseData).toBe(true);
    });

    it('provides YTD summary', async () => {
        const { result } = renderHook(() => useReports());

        await waitFor(() => {
            expect(result.current.loading).toBe(false);
        });

        expect(result.current.ytdSummary).toBeDefined();
        expect(result.current.ytdSummary.totalIncome).toBe(0);
        expect(result.current.ytdSummary.totalExpenses).toBe(0);
        // The year of the selected month, which on mount is the current one. Asserting
        // the wall clock here instead would pass even if the card ignored the filter.
        expect(result.current.ytdYear).toBe(Number(result.current.selectedMonth.split('-')[0]));
    });

    it('ytdYear follows the selection backwards across a year boundary', async () => {
        const { result } = renderHook(() => useReports());

        await waitFor(() => {
            expect(result.current.loading).toBe(false);
        });

        // Far enough back to land in a previous year from any starting month.
        for (let i = 0; i < 13; i++) {
            act(() => {
                result.current.goToPreviousMonth();
            });
        }

        const selectedYear = Number(result.current.selectedMonth.split('-')[0]);

        expect(selectedYear).toBeLessThan(new Date().getUTCFullYear());
        expect(result.current.ytdYear).toBe(selectedYear);
    });

    it('ytdSummary aggregates the selected year, not the current one', async () => {
        const lastYear = new Date().getUTCFullYear() - 1;

        await mockTransactionRepo.create({
            type: TransactionType.INCOME,
            amount: 400000,
            categoryId: 'cat-salary',
            walletId: 'w-1',
            date: new Date(Date.UTC(lastYear, 5, 12)),
        });

        const { result } = renderHook(() => useReports());

        await waitFor(() => {
            expect(result.current.loading).toBe(false);
        });

        // Current year holds nothing.
        expect(result.current.ytdSummary.totalIncome).toBe(0);

        for (let i = 0; i < 13; i++) {
            act(() => {
                result.current.goToPreviousMonth();
            });
        }

        await waitFor(() => {
            expect(result.current.ytdYear).toBe(lastYear);
        });

        expect(result.current.ytdSummary.totalIncome).toBe(400000);
        expect(result.current.ytdSummary.transactionCount).toBe(1);
    });

    it('reports month activity for a month holding only a transfer', async () => {
        const [year, month] = currentMonth.split('-').map(Number);

        await mockTransactionRepo.create({
            type: TransactionType.TRANSFER,
            amount: 75000,
            categoryId: 'cat-transfer',
            walletId: 'w-1',
            date: new Date(Date.UTC(year, month - 1, 8)),
        });

        const { result } = renderHook(() => useReports());

        await waitFor(() => {
            expect(result.current.hasMonthActivity).toBe(true);
        });

        // Nothing the summary card measures happened, but something did happen.
        expect(result.current.totalIncome).toBe(0);
        expect(result.current.totalExpense).toBe(0);
    });

    it('reports no month activity for an empty month', async () => {
        const { result } = renderHook(() => useReports());

        await waitFor(() => {
            expect(result.current.loading).toBe(false);
        });

        expect(result.current.hasMonthActivity).toBe(false);
    });

    it('month navigation wraps around year boundary', async () => {
        const { result } = renderHook(() => useReports());

        await waitFor(() => {
            expect(result.current.loading).toBe(false);
        });

        // Navigate backwards enough to cross year boundary
        for (let i = 0; i < 13; i++) {
            act(() => {
                result.current.goToPreviousMonth();
            });
        }

        // Should have a valid YYYY-MM format
        expect(result.current.selectedMonth).toMatch(/^\d{4}-\d{2}$/);
    });
});
