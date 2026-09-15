/**
 * useCategories Hook Tests
 *
 * Tests the useCategories hook behavior using mocked DI repositories.
 * Verifies loading, CRUD operations, and type filtering.
 */

import { act, renderHook, waitFor } from '@testing-library/react-native';
import { createTestDb } from '../../../tests/helpers/createTestDb';
import type { SqlDatabase } from '../../data/storage/sql/SqlDatabase';
import { BudgetRepository } from '../../data/repositories/BudgetRepository';
import { CategoryRepository } from '../../data/repositories/CategoryRepository';
import { RepositoryError } from '../../data/repositories/IRepository';
import { RecurringTransactionRepository } from '../../data/repositories/RecurringTransactionRepository';
import { TransactionRepository } from '../../data/repositories/TransactionRepository';
import { WalletRepository } from '../../data/repositories/WalletRepository';
import { CategoryType, RecurrenceFrequency, TransactionType, WalletType } from '../../domain/entities';
import { CategoryHasRecurringRulesError } from '../../domain/useCases';

// Shared state - mock-prefixed for jest.mock() hoisting
let mockDb: SqlDatabase;
let mockCategoryRepo: CategoryRepository;
let mockTransactionRepo: TransactionRepository;
let mockWalletRepo: WalletRepository;
let mockBudgetRepo: BudgetRepository;
let mockRecurringRepo: RecurringTransactionRepository;

// Mock DI container
jest.mock('../../core/di', () => ({
    getCategoryRepository: () => mockCategoryRepo,
    getTransactionRepository: () => mockTransactionRepo,
    getWalletRepository: () => mockWalletRepo,
    getRecurringTransactionRepository: () => mockRecurringRepo,
    getUseCaseDeps: () => ({
        runInTransaction: (work: any) => mockDb.runInTransaction(work),
        transactionRepo: mockTransactionRepo,
        walletRepo: mockWalletRepo,
        categoryRepo: mockCategoryRepo,
        budgetRepo: mockBudgetRepo,
        recurringRepo: mockRecurringRepo,
        eventBus: { emit: jest.fn(), emitMultiple: jest.fn() },
    }),
}));

// Mock events
jest.mock('../../core/events', () => ({
    dataEvents: {
        subscribe: jest.fn(() => jest.fn()),
        emit: jest.fn(),
        emitMultiple: jest.fn(),
    },
}));

import { useCategories } from '../useCategories';

describe('useCategories', () => {
    beforeEach(async () => {
        mockDb = await createTestDb();
        mockCategoryRepo = new CategoryRepository(mockDb);
        mockTransactionRepo = new TransactionRepository(mockDb);
        mockWalletRepo = new WalletRepository(mockDb);
        mockBudgetRepo = new BudgetRepository(mockDb);
        mockRecurringRepo = new RecurringTransactionRepository(mockDb);
    });

    it('loads categories on mount', async () => {
        await mockCategoryRepo.create({
            name: 'Food',
            type: CategoryType.EXPENSE,
            icon: '🍔',
            color: '#FF5722',
        });

        const { result } = renderHook(() => useCategories());

        await waitFor(() => {
            expect(result.current.loading).toBe(false);
        });

        expect(result.current.categories).toHaveLength(1);
        expect(result.current.categories[0].name).toBe('Food');
        expect(result.current.error).toBeNull();
    });

    it('creates category and refreshes list', async () => {
        const { result } = renderHook(() => useCategories());

        await waitFor(() => {
            expect(result.current.loading).toBe(false);
        });

        await act(async () => {
            await result.current.createCategory({
                name: 'Transport',
                type: CategoryType.EXPENSE,
                icon: '🚗',
                color: '#2196F3',
            });
        });

        expect(result.current.categories).toHaveLength(1);
        expect(result.current.categories[0].name).toBe('Transport');
    });

    it('separates expense and income categories', async () => {
        await mockCategoryRepo.create({ name: 'Food', type: CategoryType.EXPENSE });
        await mockCategoryRepo.create({ name: 'Transport', type: CategoryType.EXPENSE });
        await mockCategoryRepo.create({ name: 'Salary', type: CategoryType.INCOME });

        const { result } = renderHook(() => useCategories());

        await waitFor(() => {
            expect(result.current.loading).toBe(false);
        });

        expect(result.current.expenseCategories).toHaveLength(2);
        expect(result.current.incomeCategories).toHaveLength(1);
        expect(result.current.incomeCategories[0].name).toBe('Salary');
    });

    it('updates category', async () => {
        const created = await mockCategoryRepo.create({
            name: 'Food',
            type: CategoryType.EXPENSE,
        });

        const { result } = renderHook(() => useCategories());

        await waitFor(() => {
            expect(result.current.loading).toBe(false);
        });

        await act(async () => {
            await result.current.updateCategory({
                id: created.id,
                name: 'Groceries',
            });
        });

        expect(result.current.categories[0].name).toBe('Groceries');
    });

    // Two categories, not one: deleting the only category is refused by the
    // use case, so a single-category fixture would exercise the floor rather
    // than the delete this test is named for.
    it('deletes unreferenced category', async () => {
        const created = await mockCategoryRepo.create({
            name: 'Unused',
            type: CategoryType.EXPENSE,
            icon: '🗑️',
            color: '#999999',
        });
        await mockCategoryRepo.create({
            name: 'Kept',
            type: CategoryType.EXPENSE,
            icon: '🛒',
            color: '#00FF00',
        });

        const { result } = renderHook(() => useCategories());

        await waitFor(() => {
            expect(result.current.loading).toBe(false);
        });

        expect(result.current.categories).toHaveLength(2);

        await act(async () => {
            await result.current.deleteCategory(created.id);
        });

        expect(result.current.categories).toHaveLength(1);
        expect(result.current.categories[0].name).toBe('Kept');
    });

    it('deleteCategory hands back the exact error instance it caught', async () => {
        const cat = await mockCategoryRepo.create({
            name: 'Food',
            type: CategoryType.EXPENSE,
            icon: '🍔',
            color: '#FF5722',
        });

        // A sentinel the test holds a reference to, thrown from below the hook.
        // Identity is the whole point: the re-wrap this pass removed produced a
        // NEW Error carrying the same message, which a message assertion cannot
        // tell apart from the original but `toBe` can. Asserting identity rather
        // than a stack string also keeps the test independent of the transform -
        // a stack describes how the code was compiled, not how it behaves.
        //
        // getByCategoryId is the first call deleteCategory (the use case) makes,
        // so the sentinel leaves the use case and passes through the hook, which
        // no longer has a catch at all.
        const sentinel = new Error('category reference lookup exploded');
        mockTransactionRepo.getByCategoryId = jest.fn().mockRejectedValue(sentinel);

        const { result } = renderHook(() => useCategories());

        await waitFor(() => {
            expect(result.current.loading).toBe(false);
        });

        let caught: unknown;
        await act(async () => {
            try {
                await result.current.deleteCategory(cat.id);
            } catch (err) {
                caught = err;
            }
        });

        expect(caught).toBe(sentinel);
        expect((caught as Error).message).toBe('category reference lookup exploded');
    });

    // --- V-29: the hook must not flatten a typed error ------------------
    //
    // All three operations below used to end in `throw new Error(msg)`, which
    // produced a bare Error and made `instanceof` useless at the call site.
    // CategoriesScreen had to re-query the recurring repository to recover a
    // count the error already carried; that workaround is gone.

    it('createCategory preserves the typed error class', async () => {
        const { result } = renderHook(() => useCategories());

        await waitFor(() => {
            expect(result.current.loading).toBe(false);
        });

        let caught: unknown;
        await act(async () => {
            try {
                // An empty name fails CategoryRepository's own validate, which
                // raises a RepositoryError.
                await result.current.createCategory({
                    name: '',
                    type: CategoryType.EXPENSE,
                    icon: 'food',
                    color: '#FF5722',
                });
            } catch (err) {
                caught = err;
            }
        });

        expect(caught).toBeInstanceOf(RepositoryError);
    });

    it('updateCategory preserves the typed error class', async () => {
        const { result } = renderHook(() => useCategories());

        await waitFor(() => {
            expect(result.current.loading).toBe(false);
        });

        let caught: unknown;
        await act(async () => {
            try {
                // No such category: updateFromDTO raises RepositoryError NOT_FOUND.
                await result.current.updateCategory({
                    id: 'no-such-category',
                    name: 'Renamed',
                });
            } catch (err) {
                caught = err;
            }
        });

        expect(caught).toBeInstanceOf(RepositoryError);
    });

    it('deleteCategory preserves the typed error class and its rule count', async () => {
        const cat = await mockCategoryRepo.create({
            name: 'Subscriptions',
            type: CategoryType.EXPENSE,
            icon: 'tv',
            color: '#3F51B5',
        });
        // A second category, so the use case's "at least one category" floor is
        // not what refuses the delete.
        await mockCategoryRepo.create({
            name: 'Kept',
            type: CategoryType.EXPENSE,
            icon: 'cart',
            color: '#00FF00',
        });

        const wallet = await mockWalletRepo.create({
            name: 'Cash',
            balance: 100000,
            type: WalletType.CASH,
        });

        await mockRecurringRepo.create({
            type: TransactionType.EXPENSE,
            amount: 1200,
            walletId: wallet.id,
            categoryId: cat.id,
            startDate: new Date(2026, 0, 1),
            frequency: RecurrenceFrequency.MONTHLY,
            interval: 1,
        });

        const { result } = renderHook(() => useCategories());

        await waitFor(() => {
            expect(result.current.loading).toBe(false);
        });

        let caught: unknown;
        await act(async () => {
            try {
                await result.current.deleteCategory(cat.id);
            } catch (err) {
                caught = err;
            }
        });

        expect(caught).toBeInstanceOf(CategoryHasRecurringRulesError);
        // The count travels on the error. This is the field CategoriesScreen
        // used to re-read from the repository because the class did not survive.
        expect((caught as CategoryHasRecurringRulesError).ruleCount).toBe(1);
    });

    it('handles empty categories list', async () => {
        const { result } = renderHook(() => useCategories());

        await waitFor(() => {
            expect(result.current.loading).toBe(false);
        });

        expect(result.current.categories).toEqual([]);
        expect(result.current.expenseCategories).toEqual([]);
        expect(result.current.incomeCategories).toEqual([]);
    });
});
