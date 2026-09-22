/**
 * useBudgets Hook Tests
 *
 * Tests core budget management behavior: loading, creation, deletion,
 * summary computation with spending data.
 */

import { act, renderHook, waitFor } from '@testing-library/react-native';
import { AppState, type AppStateStatus } from 'react-native';
import { installZoneClock, restoreZoneClock } from '../../../tests/helpers/zoneClock';
import { createTestDb } from '../../../tests/helpers/createTestDb';
import type { SqlDatabase } from '../../data/storage/sql/SqlDatabase';
import { BudgetRepository } from '../../data/repositories/BudgetRepository';
import { CategoryRepository } from '../../data/repositories/CategoryRepository';
import { RepositoryError } from '../../data/repositories/IRepository';
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

    // --- V-29: the hook must not flatten a typed error ------------------
    //
    // Both operations below used to end in `throw new Error(msg)`, which
    // produced a bare Error and made `instanceof` useless at the call site.

    it('createBudget preserves the typed error class', async () => {
        const { result } = renderHook(() => useBudgets());

        await waitFor(() => {
            expect(result.current.loading).toBe(false);
        });

        let caught: unknown;
        await act(async () => {
            try {
                // A malformed month is refused by BudgetRepository.create with a
                // RepositoryError.
                await result.current.createBudget({
                    categoryId: 'cat-1',
                    month: 'not-a-month',
                    limitAmount: 50000,
                });
            } catch (err) {
                caught = err;
            }
        });

        expect(caught).toBeInstanceOf(RepositoryError);
    });

    it('deleteBudget preserves the typed error class', async () => {
        const { result } = renderHook(() => useBudgets());

        await waitFor(() => {
            expect(result.current.loading).toBe(false);
        });

        let caught: unknown;
        await act(async () => {
            try {
                // No such budget: delete raises RepositoryError NOT_FOUND.
                await result.current.deleteBudget('no-such-budget');
            } catch (err) {
                caught = err;
            }
        });

        expect(caught).toBeInstanceOf(RepositoryError);
    });

    // --- F-09: the month must not stay frozen at mount -------------------
    //
    // The Dashboard tab stays mounted. An app left in the background across a
    // month boundary used to come back still showing last month's budgets.

    it('follows the month when the app returns to the foreground', async () => {
        // The month this asserts on is the DEVICE'S month (V-91), so the zone is
        // pinned as well as the instant - otherwise 31 May 12:00 UTC is already
        // 1 June on a device at UTC+14 and the first assertion reads June. UTC is
        // the zone chosen here so the literals below mean what they say.
        // installZoneClock fakes only Date: the SQLite test driver and waitFor
        // need real timers.
        installZoneClock('UTC', Date.parse('2026-05-31T12:00:00.000Z'));
        let onAppStateChange: ((state: AppStateStatus) => void) | undefined;
        const appStateSpy = jest
            .spyOn(AppState, 'addEventListener')
            .mockImplementation((_type, handler) => {
                onAppStateChange = handler as (state: AppStateStatus) => void;
                return { remove: jest.fn() } as unknown as ReturnType<typeof AppState.addEventListener>;
            });

        try {
            await mockBudgetRepo.create({ categoryId: 'cat-may', month: '2026-05', limitAmount: 10000 });
            await mockBudgetRepo.create({ categoryId: 'cat-june', month: '2026-06', limitAmount: 20000 });

            const { result } = renderHook(() => useBudgets());

            await waitFor(() => {
                expect(result.current.budgets.map((b) => b.categoryId)).toEqual(['cat-may']);
            });
            expect(result.current.currentMonth).toBe('2026-05');

            jest.setSystemTime(new Date('2026-06-01T12:00:00.000Z'));
            act(() => {
                onAppStateChange?.('background');
                onAppStateChange?.('active');
            });

            await waitFor(() => {
                expect(result.current.currentMonth).toBe('2026-06');
                expect(result.current.budgets.map((b) => b.categoryId)).toEqual(['cat-june']);
            });
        } finally {
            appStateSpy.mockRestore();
            restoreZoneClock();
        }
    });
});
