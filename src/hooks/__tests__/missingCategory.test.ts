/**
 * Missing-category label and merge - hook layer (V-64, T1 to T4).
 *
 * A phantom is a transaction or budget whose categoryId no longer resolves to a
 * Category row. Before this fix every surface printed the English literal
 * 'Unknown', and the Reports breakdown emitted one look-alike row per phantom id.
 *
 * D1: every surface uses components.transactionList.unknown, in the app language.
 * D2: unresolved ids merge into ONE row per breakdown, amounts summed.
 * D3: budgets take the label but do NOT merge - each budget owns its limit.
 * D4: the insights lose no amount.
 *
 * The expected copy is read back out of the fr bundle rather than restated, for
 * the reason given in YtdSummaryCard.test.tsx: asserting through the key fails
 * loudly if the key is renamed, and keeps this source ASCII. The guard test
 * below proves fr and en differ, so none of these tests can pass on a key echo.
 *
 * Time zone: fixtures are built with the local-calendar constructor at midday
 * mid-month, so they land in the same local month in every zone - the month the
 * three hooks bucket by (useReports.ts:141, useDashboard.ts:82, useBudgets.ts:117).
 */

import { renderHook, waitFor } from '@testing-library/react-native';
import { createTestDb } from '../../../tests/helpers/createTestDb';
import type { SqlDatabase } from '../../data/storage/sql/SqlDatabase';
import { BudgetRepository } from '../../data/repositories/BudgetRepository';
import { CategoryRepository } from '../../data/repositories/CategoryRepository';
import { TransactionRepository } from '../../data/repositories/TransactionRepository';
import { WalletRepository } from '../../data/repositories/WalletRepository';
import { CategoryType, TransactionType, getCurrentMonth } from '../../domain/entities';
import i18n from '../../localization/i18n';
import { MISSING_CATEGORY_LABEL_KEY } from '../../utils/missingCategory';
import { useBudgets } from '../useBudgets';
import { useDashboard } from '../useDashboard';
import { useFinancialInsights } from '../useFinancialInsights';
import { useReports } from '../useReports';

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

const frLabel = i18n.getFixedT('fr')(MISSING_CATEGORY_LABEL_KEY);
const enLabel = i18n.getFixedT('en')(MISSING_CATEGORY_LABEL_KEY);

const PHANTOM_A = 'phantom-a';
const PHANTOM_B = 'phantom-b';

describe('missing category - label and merge', () => {
    const currentMonth = getCurrentMonth();
    const [year, month] = currentMonth.split('-').map(Number);

    /** Local noon, mid-month: the same local month in every time zone. */
    const dayInMonth = (day: number) => new Date(year, month - 1, day, 12, 0);

    const expense = (amount: number, categoryId: string, day: number) =>
        mockTransactionRepo.create({
            type: TransactionType.EXPENSE,
            amount,
            categoryId,
            walletId: 'w-1',
            date: dayInMonth(day),
        });

    beforeAll(async () => {
        await i18n.changeLanguage('fr');
    });

    afterAll(async () => {
        await i18n.changeLanguage('en');
    });

    beforeEach(async () => {
        mockDb = await createTestDb();
        mockBudgetRepo = new BudgetRepository(mockDb);
        mockCategoryRepo = new CategoryRepository(mockDb);
        mockTransactionRepo = new TransactionRepository(mockDb);
        mockWalletRepo = new WalletRepository(mockDb);
    });

    it('the fr label differs from en, so no test below can pass on a key echo', () => {
        expect(frLabel).not.toBe(enLabel);
        expect(frLabel).not.toBe(MISSING_CATEGORY_LABEL_KEY);
        expect(frLabel.trim()).not.toBe('');
    });

    // --- T1 - Reports ---
    it('T1: two phantoms and one real category give exactly one unresolved row', async () => {
        const food = await mockCategoryRepo.create({ name: 'Food', type: CategoryType.EXPENSE });

        await expense(40000, food.id, 10);
        await expense(10000, PHANTOM_A, 11);
        await expense(20000, PHANTOM_B, 12);

        const { result } = renderHook(() => useReports());

        await waitFor(() => {
            expect(result.current.loading).toBe(false);
            expect(result.current.totalExpense).toBe(70000);
        });

        const breakdown = result.current.categoryBreakdown;
        const unresolved = breakdown.filter(row => row.categoryName === frLabel);

        expect(unresolved).toHaveLength(1);
        expect(unresolved[0].amount).toBe(30000);

        // One real row plus the single merged row - the two phantoms do not
        // survive as two look-alike rows.
        expect(breakdown).toHaveLength(2);
        expect(breakdown.map(row => row.categoryName)).toContain('Food');

        const totalPercentage = breakdown.reduce((sum, row) => sum + row.percentage, 0);
        expect(totalPercentage).toBeCloseTo(100, 5);
    });

    // --- T2 - Dashboard ---
    it('T2: the dashboard breakdown merges the same phantoms into one entry', async () => {
        const food = await mockCategoryRepo.create({ name: 'Food', type: CategoryType.EXPENSE });

        await expense(40000, food.id, 10);
        await expense(10000, PHANTOM_A, 11);
        await expense(20000, PHANTOM_B, 12);

        const { result } = renderHook(() => useDashboard());

        await waitFor(() => {
            expect(result.current.loading).toBe(false);
            expect(result.current.currentMonthExpense).toBe(70000);
        });

        const spending = result.current.spendingByCategory;
        const unresolved = spending.filter(item => item.name === frLabel);

        expect(unresolved).toHaveLength(1);
        expect(unresolved[0].value).toBe(30000);

        // Two categories, so the top-5 slice keeps them all and the
        // percentages are complete.
        expect(spending).toHaveLength(2);

        const totalPercentage = spending.reduce((sum, item) => sum + item.percentage, 0);
        expect(totalPercentage).toBeCloseTo(100, 5);
    });

    // --- T3 - Budgets ---
    it('T3: a budget whose category is missing shows the translated label', async () => {
        await mockBudgetRepo.create({
            categoryId: PHANTOM_A,
            month: currentMonth,
            limitAmount: 50000,
        });

        const { result } = renderHook(() => useBudgets());

        await waitFor(() => {
            expect(result.current.loading).toBe(false);
            expect(result.current.budgetSummaries).toHaveLength(1);
        });

        expect(result.current.budgetSummaries[0].categoryName).toBe(frLabel);
    });

    // --- T4 - Insights ---
    it('T4: phantoms of 100 and 200 count as 300 in the unresolved bucket', async () => {
        const food = await mockCategoryRepo.create({ name: 'Food', type: CategoryType.EXPENSE });

        await expense(10000, food.id, 10);
        await expense(10000, PHANTOM_A, 11);
        await expense(20000, PHANTOM_B, 12);

        const { result } = renderHook(() => useFinancialInsights());

        await waitFor(() => {
            expect(result.current.categoryRisk).toBeDefined();
            expect(result.current.categoryRisk.topCategory).not.toBe('None');
        });

        // The unresolved bucket is 30000 of 40000 total: it outweighs Food and
        // is 75% of spending. Losing either phantom would show 50% or 25%.
        expect(result.current.categoryRisk.topCategory).toBe(frLabel);
        expect(result.current.categoryRisk.percentage).toBeCloseTo(75, 5);
    });

    it('T4b: two real categories sharing a name are summed, not overwritten', async () => {
        const food = await mockCategoryRepo.create({ name: 'Food', type: CategoryType.EXPENSE });
        const first = await mockCategoryRepo.create({ name: 'Courses', type: CategoryType.EXPENSE });
        const second = await mockCategoryRepo.create({ name: 'Courses', type: CategoryType.EXPENSE });

        await expense(40000, food.id, 10);
        await expense(10000, first.id, 11);
        await expense(20000, second.id, 12);

        const { result } = renderHook(() => useFinancialInsights());

        await waitFor(() => {
            expect(result.current.categoryRisk).toBeDefined();
            expect(result.current.categoryRisk.topCategory).not.toBe('None');
        });

        // Food is 40000 of 70000. If the two Courses rows overwrote each other
        // the denominator would drop and Food would read 80% or 66.7%.
        expect(result.current.categoryRisk.topCategory).toBe('Food');
        expect(result.current.categoryRisk.percentage).toBeCloseTo(57.142857, 4);
    });
});
