/**
 * useFinancialInsights Hook Tests
 *
 * Tests that the hook correctly wires domain insight functions
 * with dashboard and budget data.
 */

import { renderHook, waitFor } from '@testing-library/react-native';
import { createTestDb } from '../../../tests/helpers/createTestDb';
import type { SqlDatabase } from '../../data/storage/sql/SqlDatabase';
import { BudgetRepository } from '../../data/repositories/BudgetRepository';
import { CategoryRepository } from '../../data/repositories/CategoryRepository';
import { TransactionRepository } from '../../data/repositories/TransactionRepository';
import { WalletRepository } from '../../data/repositories/WalletRepository';
import { TransactionType, getCurrentMonth } from '../../domain/entities';

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

import { useFinancialInsights } from '../useFinancialInsights';

describe('useFinancialInsights', () => {
    const currentMonth = getCurrentMonth();
    const [year, month] = currentMonth.split('-').map(Number);

    beforeEach(async () => {
        mockDb = await createTestDb();
        mockTransactionRepo = new TransactionRepository(mockDb);
        mockCategoryRepo = new CategoryRepository(mockDb);
        mockBudgetRepo = new BudgetRepository(mockDb);
        mockWalletRepo = new WalletRepository(mockDb);
    });

    it('returns all four insight types', async () => {
        const { result } = renderHook(() => useFinancialInsights());

        await waitFor(() => {
            expect(result.current.savingsHealth).toBeDefined();
        });

        expect(result.current.spendingTrend).toBeDefined();
        expect(result.current.categoryRisk).toBeDefined();
        // budgetPace is null when no budgets exist
        expect(result.current.budgetPace).toBeNull();
    });

    it('budgetPace is null when no budgets exist', async () => {
        const { result } = renderHook(() => useFinancialInsights());

        await waitFor(() => {
            expect(result.current.savingsHealth).toBeDefined();
        });

        expect(result.current.budgetPace).toBeNull();
    });

    it('savingsHealth reflects income/expense ratio', async () => {
        // High income, low expense = strong savings
        await mockTransactionRepo.create({
            type: TransactionType.INCOME,
            amount: 1000000,
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

        const { result } = renderHook(() => useFinancialInsights());

        await waitFor(() => {
            expect(result.current.savingsHealth).toBeDefined();
            expect(result.current.savingsHealth.level).toBe('strong');
        });
    });

    it('savingsHealth shows deficit when expenses exceed income', async () => {
        await mockTransactionRepo.create({
            type: TransactionType.INCOME,
            amount: 50000,
            categoryId: 'cat-salary',
            walletId: 'w-1',
            date: new Date(Date.UTC(year, month - 1, 5)),
        });

        await mockTransactionRepo.create({
            type: TransactionType.EXPENSE,
            amount: 200000,
            categoryId: 'cat-food',
            walletId: 'w-1',
            date: new Date(Date.UTC(year, month - 1, 10)),
        });

        const { result } = renderHook(() => useFinancialInsights());

        await waitFor(() => {
            expect(result.current.savingsHealth.level).toBe('deficit');
        });
    });

    it('spendingTrend compares current vs previous month', async () => {
        let prevMonth = month - 1;
        let prevYear = year;
        if (prevMonth === 0) { prevMonth = 12; prevYear -= 1; }

        // Previous month: lower spending
        await mockTransactionRepo.create({
            type: TransactionType.EXPENSE,
            amount: 100000,
            categoryId: 'cat-food',
            walletId: 'w-1',
            date: new Date(Date.UTC(prevYear, prevMonth - 1, 10)),
        });

        // Current month: higher spending
        await mockTransactionRepo.create({
            type: TransactionType.EXPENSE,
            amount: 200000,
            categoryId: 'cat-food',
            walletId: 'w-1',
            date: new Date(Date.UTC(year, month - 1, 10)),
        });

        const { result } = renderHook(() => useFinancialInsights());

        await waitFor(() => {
            expect(result.current.spendingTrend).toBeDefined();
            expect(result.current.spendingTrend.direction).toBe('increase');
        });
    });

    it('categoryRisk identifies high concentration', async () => {
        // Single category with 100% of expenses
        await mockTransactionRepo.create({
            type: TransactionType.EXPENSE,
            amount: 500000,
            categoryId: 'cat-gambling',
            walletId: 'w-1',
            date: new Date(Date.UTC(year, month - 1, 10)),
        });

        const { result } = renderHook(() => useFinancialInsights());

        await waitFor(() => {
            expect(result.current.categoryRisk).toBeDefined();
            // 100% concentration in one category should be high risk
            expect(result.current.categoryRisk.percentage).toBe(100);
        });
    });

    it('budgetPace is calculated when budgets exist', async () => {
        // Create a budget
        await mockBudgetRepo.create({
            categoryId: 'cat-food',
            month: currentMonth,
            limitAmount: 200000,
        });

        // Create matching expense
        await mockTransactionRepo.create({
            type: TransactionType.EXPENSE,
            amount: 150000,
            categoryId: 'cat-food',
            walletId: 'w-1',
            date: new Date(Date.UTC(year, month - 1, 10)),
        });

        const { result } = renderHook(() => useFinancialInsights());

        await waitFor(() => {
            expect(result.current.budgetPace).not.toBeNull();
        });

        expect(result.current.budgetPace).toBeDefined();
        expect(result.current.budgetPace!.messageKey).toBeTruthy();
    });

    it('returns neutral spending trend when no previous data', async () => {
        const { result } = renderHook(() => useFinancialInsights());

        await waitFor(() => {
            expect(result.current.spendingTrend).toBeDefined();
        });

        // Both months zero → stable
        expect(result.current.spendingTrend.direction).toBe('stable');
    });
});
