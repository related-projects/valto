/**
 * useBudgets Hook Tests
 *
 * Tests core budget management behavior: loading, creation, deletion,
 * summary computation with spending data.
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

import { useBudgets } from '../useBudgets';

describe('useBudgets', () => {
    const currentMonth = getCurrentMonth();

    beforeEach(async () => {
        mockDb = await createTestDb();
        mockBudgetRepo = new BudgetRepository(mockDb);
        mockCategoryRepo = new CategoryRepository(mockDb);
        mockTransactionRepo = new TransactionRepository(mockDb);
        mockWalletRepo = new WalletRepository(mockDb);
    });

    it('loads budgets for current month on mount', async () => {
        await mockBudgetRepo.create({
            categoryId: 'cat-1',
            month: currentMonth,
            limitAmount: 100000,
        });

        const { result } = renderHook(() => useBudgets());

        await waitFor(() => {
            expect(result.current.loading).toBe(false);
        });

        expect(result.current.budgets).toHaveLength(1);
        expect(result.current.hasBudgets).toBe(true);
    });

    it('returns empty when no budgets for current month', async () => {
        const { result } = renderHook(() => useBudgets());

        await waitFor(() => {
            expect(result.current.loading).toBe(false);
        });

        expect(result.current.budgets).toEqual([]);
        expect(result.current.hasBudgets).toBe(false);
    });

    it('creates budget and refreshes', async () => {
        const { result } = renderHook(() => useBudgets());

        await waitFor(() => {
            expect(result.current.loading).toBe(false);
        });

        await act(async () => {
            await result.current.createBudget({
                categoryId: 'cat-food',
                month: currentMonth,
                limitAmount: 80000,
            });
        });

        expect(result.current.budgets).toHaveLength(1);
        expect(result.current.budgets[0].limitAmount).toBe(80000);
    });

    it('deletes budget and refreshes', async () => {
        const budget = await mockBudgetRepo.create({
            categoryId: 'cat-1',
            month: currentMonth,
            limitAmount: 50000,
        });

        const { result } = renderHook(() => useBudgets());

        await waitFor(() => {
            expect(result.current.budgets).toHaveLength(1);
        });

        await act(async () => {
            await result.current.deleteBudget(budget.id);
        });

        expect(result.current.budgets).toHaveLength(0);
    });

    it('computes totalBudgetLimit correctly', async () => {
        await mockBudgetRepo.create({ categoryId: 'cat-1', month: currentMonth, limitAmount: 50000 });
        await mockBudgetRepo.create({ categoryId: 'cat-2', month: currentMonth, limitAmount: 30000 });

        const { result } = renderHook(() => useBudgets());

        await waitFor(() => {
            expect(result.current.loading).toBe(false);
        });

        expect(result.current.totalBudgetLimit).toBe(80000);
    });

    it('provides budgetedCategoryIds', async () => {
        await mockBudgetRepo.create({ categoryId: 'cat-food', month: currentMonth, limitAmount: 50000 });
        await mockBudgetRepo.create({ categoryId: 'cat-transport', month: currentMonth, limitAmount: 30000 });

        const { result } = renderHook(() => useBudgets());

        await waitFor(() => {
            expect(result.current.loading).toBe(false);
        });

        expect(result.current.budgetedCategoryIds).toContain('cat-food');
        expect(result.current.budgetedCategoryIds).toContain('cat-transport');
    });

    it('currentMonth is in YYYY-MM format', async () => {
        const { result } = renderHook(() => useBudgets());

        await waitFor(() => {
            expect(result.current.loading).toBe(false);
        });

        expect(result.current.currentMonth).toMatch(/^\d{4}-\d{2}$/);
    });
});
