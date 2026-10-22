/**
 * Month change on return to the foreground (REGISTRE V-99).
 *
 * The Dashboard and Reports tabs stay mounted. An app left in the background
 * across a month boundary must come back on the new month: the dashboard
 * totals, breakdown and insights, the budget pace, and Reports - the last one
 * only when the user was still on the month that had been current (V-99, Owner
 * decision 2, pass 78).
 *
 * Time zones: pinClock fixes what `new Date()` returns and nothing else, every
 * fixture is built with the local constructor, and this file is run under
 * TZ=UTC, TZ=Africa/Lagos and TZ=America/New_York (registry policy no. 9). The
 * month literals below then mean the device's month in every one of them.
 *
 * Witness: each test also mounts useBudgets, which already follows the month
 * (useBudgets.test.ts, F-09). Its currentMonth moving to November proves the
 * clock moved and the AppState event reached the listeners, independently of
 * the hook under test - so a failure below is the hook's, not the harness's.
 *
 * Tests that pass on a build without the fix are labelled CONTROL.
 */

import { act, renderHook, waitFor } from '@testing-library/react-native';
import { AppState, type AppStateStatus } from 'react-native';
import { createTestDb } from '../../../tests/helpers/createTestDb';
import { pinClock, restoreZoneClock } from '../../../tests/helpers/zoneClock';
import { BudgetRepository } from '../../data/repositories/BudgetRepository';
import { CategoryRepository } from '../../data/repositories/CategoryRepository';
import { TransactionRepository } from '../../data/repositories/TransactionRepository';
import { WalletRepository } from '../../data/repositories/WalletRepository';
import type { SqlDatabase } from '../../data/storage/sql/SqlDatabase';
import { CategoryType, TransactionType } from '../../domain/entities';
import { useBudgets } from '../useBudgets';
import { useDashboard } from '../useDashboard';
import { useFinancialInsights } from '../useFinancialInsights';
import { useReports } from '../useReports';

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

// --- AppState: every subscriber, not only the last one --------------------

const appStateHandlers = new Set<(state: AppStateStatus) => void>();
let appStateSpy: jest.SpyInstance;

/** Background then foreground, delivered to every live subscriber. */
function returnToForeground(): void {
    act(() => {
        const handlers = [...appStateHandlers];
        handlers.forEach(handler => handler('background'));
        handlers.forEach(handler => handler('active'));
    });
}

// --- Fixtures ---------------------------------------------------------------

/** 31 October 23:50 and 1 November 00:10, device-local. */
const BEFORE_MIDNIGHT = () => new Date(2026, 9, 31, 23, 50).getTime();
const AFTER_MIDNIGHT = () => new Date(2026, 10, 1, 0, 10).getTime();

const OCT_INCOME = 100000;
const OCT_EXPENSE = 40000;
const NOV_INCOME = 300000;
const NOV_EXPENSE = 70000;
const BUDGET_LIMIT = 30000;

/**
 * One month of activity on each side of the boundary, each month spending in
 * its own category so the breakdown shows which month is on screen.
 */
async function seedTwoMonths(): Promise<void> {
    const october = await mockCategoryRepo.create({ name: 'October groceries', type: CategoryType.EXPENSE, color: '#111111' });
    const november = await mockCategoryRepo.create({ name: 'November transport', type: CategoryType.EXPENSE, color: '#222222' });

    await mockTransactionRepo.create({ type: TransactionType.INCOME, amount: OCT_INCOME, categoryId: 'cat-salary', walletId: 'w-1', date: new Date(2026, 9, 10, 12, 0) });
    await mockTransactionRepo.create({ type: TransactionType.EXPENSE, amount: OCT_EXPENSE, categoryId: october.id, walletId: 'w-1', date: new Date(2026, 9, 20, 12, 0) });
    await mockTransactionRepo.create({ type: TransactionType.INCOME, amount: NOV_INCOME, categoryId: 'cat-salary', walletId: 'w-1', date: new Date(2026, 10, 1, 0, 5) });
    await mockTransactionRepo.create({ type: TransactionType.EXPENSE, amount: NOV_EXPENSE, categoryId: november.id, walletId: 'w-1', date: new Date(2026, 10, 1, 0, 6) });
}

/**
 * Same limit in both months on a category nothing is ever spent in: spent,
 * limit and hasBudgets are identical on both sides of the boundary, so only
 * the date can move the pace.
 */
async function seedBudgets(): Promise<void> {
    const { id: categoryId } = await mockCategoryRepo.create({ name: 'Budgeted, unspent', type: CategoryType.EXPENSE, color: '#333333' });
    await mockDb.runInTransaction(() => mockBudgetRepo.create({ categoryId, month: '2026-10', limitAmount: BUDGET_LIMIT }));
    await mockDb.runInTransaction(() => mockBudgetRepo.create({ categoryId, month: '2026-11', limitAmount: BUDGET_LIMIT }));
}

beforeEach(async () => {
    mockDb = await createTestDb();
    mockTransactionRepo = new TransactionRepository(mockDb);
    mockCategoryRepo = new CategoryRepository(mockDb);
    mockBudgetRepo = new BudgetRepository(mockDb);
    mockWalletRepo = new WalletRepository(mockDb);

    appStateHandlers.clear();
    appStateSpy = jest
        .spyOn(AppState, 'addEventListener')
        .mockImplementation((_type, handler) => {
            const typed = handler as (state: AppStateStatus) => void;
            appStateHandlers.add(typed);
            return { remove: () => { appStateHandlers.delete(typed); } } as unknown as ReturnType<typeof AppState.addEventListener>;
        });
});

afterEach(() => {
    appStateSpy.mockRestore();
    appStateHandlers.clear();
    restoreZoneClock();
});

// --- B1 ---------------------------------------------------------------------

describe('B1 useDashboard follows the month on return to the foreground', () => {
    it('shows November totals and breakdown after 31 Oct 23:50 -> 1 Nov 00:10', async () => {
        pinClock(BEFORE_MIDNIGHT());
        await seedTwoMonths();

        const { result } = renderHook(() => ({ dashboard: useDashboard(), witness: useBudgets() }));

        await waitFor(() => {
            expect(result.current.dashboard.loading).toBe(false);
            expect(result.current.dashboard.currentMonthIncome).toBe(OCT_INCOME);
        });
        expect(result.current.dashboard.currentMonthExpense).toBe(OCT_EXPENSE);
        expect(result.current.dashboard.spendingByCategory.map(c => c.name)).toEqual(['October groceries']);
        expect(result.current.witness.currentMonth).toBe('2026-10');

        pinClock(AFTER_MIDNIGHT());
        returnToForeground();

        await waitFor(() => {
            expect(result.current.witness.currentMonth).toBe('2026-11');
        });
        await waitFor(() => {
            expect(result.current.dashboard.currentMonthIncome).toBe(NOV_INCOME);
        });
        expect(result.current.dashboard.currentMonthExpense).toBe(NOV_EXPENSE);
        expect(result.current.dashboard.netBalance).toBe(NOV_INCOME - NOV_EXPENSE);
        expect(result.current.dashboard.spendingByCategory.map(c => c.name)).toEqual(['November transport']);
        expect(result.current.dashboard.previousMonthExpense).toBe(OCT_EXPENSE);
    });
});

// --- B2 ---------------------------------------------------------------------

describe('B2 useReports follows the month only when it was on the current one', () => {
    it('moves from October to November when it was showing October', async () => {
        pinClock(BEFORE_MIDNIGHT());
        await seedTwoMonths();

        const { result } = renderHook(() => ({ reports: useReports(), witness: useBudgets() }));

        await waitFor(() => {
            expect(result.current.reports.loading).toBe(false);
            expect(result.current.reports.totalIncome).toBe(OCT_INCOME);
        });
        expect(result.current.reports.selectedMonth).toBe('2026-10');

        pinClock(AFTER_MIDNIGHT());
        returnToForeground();

        await waitFor(() => {
            expect(result.current.witness.currentMonth).toBe('2026-11');
        });
        await waitFor(() => {
            expect(result.current.reports.selectedMonth).toBe('2026-11');
        });
        expect(result.current.reports.totalIncome).toBe(NOV_INCOME);
        expect(result.current.reports.totalExpense).toBe(NOV_EXPENSE);
    });

    it('CONTROL: stays on August when the user had navigated there', async () => {
        pinClock(BEFORE_MIDNIGHT());
        await seedTwoMonths();

        const { result } = renderHook(() => ({ reports: useReports(), witness: useBudgets() }));

        await waitFor(() => {
            expect(result.current.reports.loading).toBe(false);
        });
        act(() => { result.current.reports.goToPreviousMonth(); });
        act(() => { result.current.reports.goToPreviousMonth(); });
        expect(result.current.reports.selectedMonth).toBe('2026-08');

        pinClock(AFTER_MIDNIGHT());
        returnToForeground();

        await waitFor(() => {
            expect(result.current.witness.currentMonth).toBe('2026-11');
        });
        expect(result.current.reports.selectedMonth).toBe('2026-08');
    });
});

// --- B3 ---------------------------------------------------------------------

describe('B3 budgetPace follows the month on return to the foreground', () => {
    it('paces against 1 November, not 31 October', async () => {
        pinClock(BEFORE_MIDNIGHT());
        await seedTwoMonths();
        await seedBudgets();

        const { result } = renderHook(() => ({ insights: useFinancialInsights(), witness: useBudgets() }));

        // 31 of 31 days elapsed: the whole October limit is expected by now.
        await waitFor(() => {
            expect(result.current.insights.budgetPace).not.toBeNull();
            expect(result.current.insights.budgetPace?.expectedSpentByNow).toBeCloseTo(BUDGET_LIMIT);
        });

        pinClock(AFTER_MIDNIGHT());
        returnToForeground();

        await waitFor(() => {
            expect(result.current.witness.currentMonth).toBe('2026-11');
        });
        // 1 of 30 days elapsed.
        await waitFor(() => {
            expect(result.current.insights.budgetPace?.expectedSpentByNow).toBeCloseTo(BUDGET_LIMIT / 30);
        });
    });
});

// --- Controls ---------------------------------------------------------------

describe('CONTROL: an AppState change within the same month changes nothing', () => {
    it('keeps October on dashboard, reports and pace from 15 Oct 10:00 to 18:00', async () => {
        pinClock(new Date(2026, 9, 15, 10, 0).getTime());
        await seedTwoMonths();
        await seedBudgets();

        const { result } = renderHook(() => ({
            dashboard: useDashboard(),
            reports: useReports(),
            insights: useFinancialInsights(),
            witness: useBudgets(),
        }));

        await waitFor(() => {
            expect(result.current.dashboard.currentMonthIncome).toBe(OCT_INCOME);
            expect(result.current.reports.totalIncome).toBe(OCT_INCOME);
            expect(result.current.insights.budgetPace).not.toBeNull();
        });
        const paceBefore = result.current.insights.budgetPace?.expectedSpentByNow;
        expect(paceBefore).toBeCloseTo((15 / 31) * BUDGET_LIMIT);

        pinClock(new Date(2026, 9, 15, 18, 0).getTime());
        returnToForeground();

        expect(result.current.witness.currentMonth).toBe('2026-10');
        expect(result.current.dashboard.currentMonthIncome).toBe(OCT_INCOME);
        expect(result.current.dashboard.currentMonthExpense).toBe(OCT_EXPENSE);
        expect(result.current.reports.selectedMonth).toBe('2026-10');
        expect(result.current.reports.totalIncome).toBe(OCT_INCOME);
        expect(result.current.insights.budgetPace?.expectedSpentByNow).toBeCloseTo(paceBefore ?? NaN);
    });
});
