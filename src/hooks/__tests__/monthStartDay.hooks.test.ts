/**
 * The hooks follow the stored "month starts on" day (REGISTRE C20 step 2,
 * pass 98 items 4, 6 and 7).
 *
 * The clock is pinned to 25 November 2026, noon, device-local, and the stored
 * start day is 20. The period on the clock is then 20 Nov - 19 Dec 2026, named
 * 2026-12 (start days 16-31 name the month after the start), and the one
 * before it 20 Oct - 19 Nov 2026, named 2026-11. An expense dated the 19th and
 * one dated the 20th of November fall in those two different periods; with the
 * calendar month they would both be November.
 *
 * Zones (policy no. 9): fixtures use the local constructor and pinClock fixes
 * only `new Date()`, so the file holds under TZ=UTC, Africa/Lagos and
 * America/New_York.
 *
 * core/events is NOT mocked here: the last block emits the real 'settings'
 * event, the one useSettings emits after a change.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import { createTestDb } from '../../../tests/helpers/createTestDb';
import { pinClock, restoreZoneClock } from '../../../tests/helpers/zoneClock';
import { dataEvents } from '../../core/events';
import { BudgetRepository } from '../../data/repositories/BudgetRepository';
import { CategoryRepository } from '../../data/repositories/CategoryRepository';
import { TransactionRepository } from '../../data/repositories/TransactionRepository';
import { WalletRepository } from '../../data/repositories/WalletRepository';
import { StorageKeys } from '../../data/storage';
import type { SqlDatabase } from '../../data/storage/sql/SqlDatabase';
import { CategoryType, TransactionType } from '../../domain/entities';
import { BudgetMonthClosedError } from '../../domain/useCases/errors';
import i18n from '../../localization/i18n';
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

// --- Fixtures ---------------------------------------------------------------

const NOW = () => new Date(2026, 10, 25, 12, 0).getTime();

const BEFORE_20TH = 19000; // 19 Nov 2026
const FROM_20TH = 20000; // 20 Nov 2026
const INCOME_21ST = 50000; // 21 Nov 2026
const LATE_DECEMBER_2025 = 1000; // 21 Dec 2025: year 2026 with start day 20
const LIMIT = 30000;

const SETTINGS = {
    theme: 'system',
    currency: 'USD',
    currencyLocked: true,
    notificationsEnabled: false,
    language: 'en',
    dateFormat: 'YYYY-MM-DD',
    firstDayOfWeek: 'monday',
    decimalSeparator: 'dot',
    onboardingCompleted: true,
    dateFormatLocaleApplied: true,
};

async function storeStartDay(monthStartDay: number | undefined): Promise<void> {
    const blob = monthStartDay === undefined ? SETTINGS : { ...SETTINGS, monthStartDay };
    await AsyncStorage.setItem(StorageKeys.SETTINGS, JSON.stringify(blob));
}

let before20thId = '';
let from20thId = '';

async function seed(): Promise<void> {
    before20thId = (await mockCategoryRepo.create({ name: 'Before the 20th', type: CategoryType.EXPENSE, color: '#111111' })).id;
    from20thId = (await mockCategoryRepo.create({ name: 'From the 20th', type: CategoryType.EXPENSE, color: '#222222' })).id;

    await mockTransactionRepo.create({ type: TransactionType.EXPENSE, amount: BEFORE_20TH, categoryId: before20thId, walletId: 'w-1', date: new Date(2026, 10, 19, 12, 0) });
    await mockTransactionRepo.create({ type: TransactionType.EXPENSE, amount: FROM_20TH, categoryId: from20thId, walletId: 'w-1', date: new Date(2026, 10, 20, 12, 0) });
    await mockTransactionRepo.create({ type: TransactionType.INCOME, amount: INCOME_21ST, categoryId: 'cat-salary', walletId: 'w-1', date: new Date(2026, 10, 21, 12, 0) });
    await mockTransactionRepo.create({ type: TransactionType.EXPENSE, amount: LATE_DECEMBER_2025, categoryId: before20thId, walletId: 'w-1', date: new Date(2025, 11, 21, 12, 0) });
}

/** A budget for each named period: 2026-11 on the first category, 2026-12 on the second. */
async function seedBudgets(): Promise<{ november: string; december: string }> {
    const november = await mockDb.runInTransaction(() =>
        mockBudgetRepo.create({ categoryId: before20thId, month: '2026-11', limitAmount: LIMIT }));
    const december = await mockDb.runInTransaction(() =>
        mockBudgetRepo.create({ categoryId: from20thId, month: '2026-12', limitAmount: LIMIT }));
    return { november: november.id, december: december.id };
}

beforeEach(async () => {
    await AsyncStorage.clear();
    await i18n.changeLanguage('en');
    mockDb = await createTestDb();
    mockTransactionRepo = new TransactionRepository(mockDb);
    mockCategoryRepo = new CategoryRepository(mockDb);
    mockBudgetRepo = new BudgetRepository(mockDb);
    mockWalletRepo = new WalletRepository(mockDb);
    pinClock(NOW());
});

afterEach(() => {
    restoreZoneClock();
});

// --- Dashboard --------------------------------------------------------------

describe('pass 98 item 4. useDashboard with start day 20', () => {
    it('pass 98 item 4. counts the 20th in the current period and the 19th in the one before', async () => {
        await storeStartDay(20);
        await seed();

        const { result } = renderHook(() => useDashboard());

        await waitFor(() => {
            expect(result.current.loading).toBe(false);
            expect(result.current.currentMonthExpense).toBe(FROM_20TH);
        });
        expect(result.current.previousMonthExpense).toBe(BEFORE_20TH);
        expect(result.current.currentMonthIncome).toBe(INCOME_21ST);
        expect(result.current.spendingByCategory.map(c => c.name)).toEqual(['From the 20th']);
    });
});

// --- Budgets ----------------------------------------------------------------

describe('pass 98 item 4. useBudgets with start day 20', () => {
    it('pass 98 item 4. shows the 2026-12 budgets, spent from the 20th only', async () => {
        await storeStartDay(20);
        await seed();
        await seedBudgets();

        const { result } = renderHook(() => useBudgets());

        await waitFor(() => {
            expect(result.current.currentMonth).toBe('2026-12');
            expect(result.current.budgetSummaries).toHaveLength(1);
        });
        expect(result.current.budgetSummaries[0].categoryName).toBe('From the 20th');
        expect(result.current.budgetSummaries[0].spentAmount).toBe(FROM_20TH);
    });

    it('pass 98 item 4. refuses to edit the 2026-11 budget: that period ended on the 19th', async () => {
        await storeStartDay(20);
        await seed();
        const { november } = await seedBudgets();

        const { result } = renderHook(() => useBudgets());
        await waitFor(() => {
            expect(result.current.currentMonth).toBe('2026-12');
        });

        let caught: unknown = null;
        await act(async () => {
            try {
                await result.current.updateBudget({ id: november, limitAmount: LIMIT + 1 });
            } catch (error) {
                caught = error;
            }
        });

        expect(caught).toBeInstanceOf(BudgetMonthClosedError);
    });
});

// --- Reports and YTD --------------------------------------------------------

describe('pass 98 items 4 and 6. useReports with start day 20', () => {
    it('pass 98 item 6. labels the periods with their dates and files the 19th and 20th apart', async () => {
        await storeStartDay(20);
        await seed();

        const { result } = renderHook(() => useReports());

        await waitFor(() => {
            expect(result.current.loading).toBe(false);
            expect(result.current.monthLabel).toBe('20 Nov - 19 Dec 2026');
        });
        expect(result.current.selectedMonth).toBe('2026-12');
        expect(result.current.totalExpense).toBe(FROM_20TH);

        act(() => {
            result.current.goToPreviousMonth();
        });

        await waitFor(() => {
            expect(result.current.monthLabel).toBe('20 Oct - 19 Nov 2026');
        });
        expect(result.current.totalExpense).toBe(BEFORE_20TH);
    });

    it('pass 98 item 6. sums the year over its 12 periods and states their dates', async () => {
        await storeStartDay(20);
        await seed();

        const { result } = renderHook(() => useReports());

        await waitFor(() => {
            expect(result.current.loading).toBe(false);
            expect(result.current.ytdPeriodLabel).toBe('20 Dec 2025 - 19 Dec 2026');
        });
        expect(result.current.ytdYear).toBe(2026);
        // 21 Dec 2025 is in period 2026-01 (20 Dec 2025 - 19 Jan 2026).
        expect(result.current.ytdSummary.totalExpenses).toBe(BEFORE_20TH + FROM_20TH + LATE_DECEMBER_2025);
    });

    it('pass 98 item 6. a period crossing 1 January names both years', async () => {
        await storeStartDay(20);
        await seed();

        const { result } = renderHook(() => useReports());
        await waitFor(() => {
            expect(result.current.selectedMonth).toBe('2026-12');
        });

        act(() => {
            result.current.goToNextMonth();
        });

        await waitFor(() => {
            expect(result.current.monthLabel).toBe('20 Dec 2026 - 19 Jan 2027');
        });
    });
});

// --- Budget pace ------------------------------------------------------------

describe('pass 98 item 7. budget pace with start day 20', () => {
    it('pass 98 item 7. paces the 2026-12 budget on 6 of its 30 days', async () => {
        await storeStartDay(20);
        await seed();
        await seedBudgets();

        const { result } = renderHook(() => useFinancialInsights());

        await waitFor(() => {
            expect(result.current.budgetPace).not.toBeNull();
            // 20 Nov - 19 Dec is 30 days; 25 Nov is its 6th.
            expect(result.current.budgetPace!.expectedSpentByNow).toBe((6 / 30) * LIMIT);
        });
    });
});

// --- A change of the setting --------------------------------------------------

describe('pass 98 item 4. the hooks follow a change of the setting', () => {
    it('pass 98 item 4. regroups the dashboard and the reports after the settings event', async () => {
        await storeStartDay(undefined);
        await seed();

        const { result } = renderHook(() => ({ dashboard: useDashboard(), reports: useReports() }));

        await waitFor(() => {
            expect(result.current.dashboard.loading).toBe(false);
            expect(result.current.dashboard.currentMonthExpense).toBe(BEFORE_20TH + FROM_20TH);
        });
        expect(result.current.reports.monthLabel).toBe('November 2026');

        await storeStartDay(20);
        act(() => {
            dataEvents.emit('settings');
        });

        await waitFor(() => {
            expect(result.current.dashboard.currentMonthExpense).toBe(FROM_20TH);
        });
        await waitFor(() => {
            expect(result.current.reports.monthLabel).toBe('20 Nov - 19 Dec 2026');
        });
    });
});
