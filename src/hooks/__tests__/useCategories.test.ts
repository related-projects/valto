/**
 * useCategories Hook Tests
 *
 * Tests the useCategories hook behavior using mocked DI repositories.
 * Verifies loading, CRUD operations, and type filtering.
 */

import { act, renderHook, waitFor } from '@testing-library/react-native';
import { InMemoryStorage } from '../../../tests/helpers/InMemoryStorage';
import { CategoryRepository } from '../../data/repositories/CategoryRepository';
import { TransactionRepository } from '../../data/repositories/TransactionRepository';
import { WalletRepository } from '../../data/repositories/WalletRepository';
import { CategoryType, TransactionType, WalletType } from '../../domain/entities';

// Shared state — mock-prefixed for jest.mock() hoisting
let mockStorage: InMemoryStorage;
let mockCategoryRepo: CategoryRepository;
let mockTransactionRepo: TransactionRepository;
let mockWalletRepo: WalletRepository;

// Mock DI container
jest.mock('../../core/di', () => ({
    getCategoryRepository: () => mockCategoryRepo,
    getTransactionRepository: () => mockTransactionRepo,
    getWalletRepository: () => mockWalletRepo,
    getUseCaseDeps: () => ({
        transactionRepo: mockTransactionRepo,
        walletRepo: mockWalletRepo,
        categoryRepo: mockCategoryRepo,
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
    beforeEach(() => {
        mockStorage = new InMemoryStorage();
        mockCategoryRepo = new CategoryRepository(mockStorage);
        mockTransactionRepo = new TransactionRepository(mockStorage);
        mockWalletRepo = new WalletRepository(mockStorage);
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

    it('deletes unreferenced category', async () => {
        const created = await mockCategoryRepo.create({
            name: 'Unused',
            type: CategoryType.EXPENSE,
            icon: '🗑️',
            color: '#999999',
        });

        const { result } = renderHook(() => useCategories());

        await waitFor(() => {
            expect(result.current.loading).toBe(false);
        });

        expect(result.current.categories).toHaveLength(1);

        await act(async () => {
            await result.current.deleteCategory(created.id);
        });

        expect(result.current.categories).toHaveLength(0);
    });

    it('throws when deleting category with references', async () => {
        const cat = await mockCategoryRepo.create({
            name: 'Food',
            type: CategoryType.EXPENSE,
            icon: '🍔',
            color: '#FF5722',
        });

        const wallet = await mockWalletRepo.create({
            name: 'Cash',
            balance: 100000,
            type: WalletType.CASH,
        });

        await mockTransactionRepo.create({
            type: TransactionType.EXPENSE,
            amount: 5000,
            categoryId: cat.id,
            walletId: wallet.id,
            date: new Date(),
        });

        const { result } = renderHook(() => useCategories());

        await waitFor(() => {
            expect(result.current.loading).toBe(false);
        });

        await expect(
            act(async () => {
                await result.current.deleteCategory(cat.id);
            })
        ).rejects.toThrow('Cannot delete category');
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
