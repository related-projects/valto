import { renderHook, waitFor } from '@testing-library/react-native';
import { installZoneClock, restoreZoneClock } from '../../../tests/helpers/zoneClock';
import { createTestDb } from '../../../tests/helpers/createTestDb';
import type { SqlDatabase } from '../../data/storage/sql/SqlDatabase';
import { BudgetRepository } from '../../data/repositories/BudgetRepository';
import { CategoryRepository } from '../../data/repositories/CategoryRepository';
import { TransactionRepository } from '../../data/repositories/TransactionRepository';
import { WalletRepository } from '../../data/repositories/WalletRepository';
import { CategoryType, TransactionType } from '../../domain/entities';
// Imported at the top, unlike the older hook suites: babel hoists the
// jest.mock calls below above every import, and their factories return arrow
// functions that only dereference the mock refs when the hook renders - long
// after beforeEach has assigned them.
import { useBudgets } from '../useBudgets';
import { useDashboard } from '../useDashboard';
import { useReports } from '../useReports';

/**
 * Local month buckets - hook layer (REGISTRE V-91, T1/T2/T3).
 *
 * A Valto month is the DEVICE'S LOCAL month. The dashboard, the budget spend
 * tally and the monthly report each built their YYYY-MM key from the UTC
 * calendar, so east of UTC every transaction entered between local midnight and
 * 01:00 on the 1st was filed under the month that had just ended - money
 * disappearing from the month the user was looking at.
 *
 * All three cases share one fixture: a single expense at local midnight on
 * 1 March in Lagos (UTC+1), with the device clock a few hours later the same
 * local day. A second expense in late February is carried alongside, so a fix
 * that simply pushed everything forward would fail too.
 *
 * The zone is read from the ICU tz database through tests/helpers/zoneClock,
 * never from TZ - jest hands each test file a copied process.env, so setting TZ
 * in a test would change nothing.
 */

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

const LAGOS = 'Africa/Lagos';
// 2026-02-28T23:00Z is 2026-03-01 00:00 in Lagos: the first minute of March on
// the device, still February in UTC.
const MARCH_FIRST_LOCAL_MIDNIGHT = Date.UTC(2026, 1, 28, 23, 0);
// 2026-02-28T11:00Z is 2026-02-28 12:00 in Lagos: unambiguously February.
const FEBRUARY_MIDDAY = Date.UTC(2026, 1, 28, 11, 0);
// 2026-03-01T05:00Z is 2026-03-01 06:00 in Lagos: the device is a few hours
// into March when it reads its dashboard.
const DEVICE_CLOCK = Date.UTC(2026, 2, 1, 5, 0);

const MARCH_AMOUNT = 31000;
const FEBRUARY_AMOUNT = 12000;

describe('V-91 T1/T2/T3 - month buckets follow the local calendar', () => {
    beforeEach(async () => {
        mockDb = await createTestDb();
        mockBudgetRepo = new BudgetRepository(mockDb);
        mockCategoryRepo = new CategoryRepository(mockDb);
        mockTransactionRepo = new TransactionRepository(mockDb);
        mockWalletRepo = new WalletRepository(mockDb);

        await mockCategoryRepo.create({
            name: 'Nourriture',
            type: CategoryType.EXPENSE,
            color: '#E57373',
        });

        await mockTransactionRepo.create({
            type: TransactionType.EXPENSE,
            amount: MARCH_AMOUNT,
            categoryId: 'cat-food',
            walletId: 'w-1',
            date: new Date(MARCH_FIRST_LOCAL_MIDNIGHT),
        });

        await mockTransactionRepo.create({
            type: TransactionType.EXPENSE,
            amount: FEBRUARY_AMOUNT,
            categoryId: 'cat-food',
            walletId: 'w-1',
            date: new Date(FEBRUARY_MIDDAY),
        });

        installZoneClock(LAGOS, DEVICE_CLOCK);
    });

    afterEach(() => {
        restoreZoneClock();
    });

    // --- T1. Dashboard ---------------------------------------------

    it('T1 - the dashboard counts a local-midnight row in March, not February', async () => {
        const { result } = renderHook(() => useDashboard());

        await waitFor(() => {
            expect(result.current.loading).toBe(false);
        });

        expect(result.current.currentMonthExpense).toBe(MARCH_AMOUNT);
        expect(result.current.previousMonthExpense).toBe(FEBRUARY_AMOUNT);
    });

    // --- T2. Budgets -----------------------------------------------

    it('T2 - the row counts toward the March budget spending', async () => {
        await mockBudgetRepo.create({
            categoryId: 'cat-food',
            month: '2026-03',
            limitAmount: 100000,
        });

        const { result } = renderHook(() => useBudgets());

        await waitFor(() => {
            expect(result.current.loading).toBe(false);
        });

        expect(result.current.currentMonth).toBe('2026-03');
        expect(result.current.budgetSummaries).toHaveLength(1);
        expect(result.current.budgetSummaries[0].spentAmount).toBe(MARCH_AMOUNT);
        expect(result.current.totalBudgetSpent).toBe(MARCH_AMOUNT);
    });

    // --- T3. Reports -----------------------------------------------

    it('T3 - the monthly report lands the row in March', async () => {
        const { result } = renderHook(() => useReports());

        await waitFor(() => {
            expect(result.current.loading).toBe(false);
        });

        expect(result.current.selectedMonth).toBe('2026-03');
        expect(result.current.totalExpense).toBe(MARCH_AMOUNT);
        // False if the row had been filed under February, since March would then
        // hold nothing at all.
        expect(result.current.hasMonthActivity).toBe(true);
    });
});
