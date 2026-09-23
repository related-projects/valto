import { renderHook, waitFor } from '@testing-library/react-native';

import { createTestDb } from '../../../tests/helpers/createTestDb';
import { BudgetRepository } from '../../data/repositories/BudgetRepository';
import { CategoryRepository } from '../../data/repositories/CategoryRepository';
import { TransactionRepository } from '../../data/repositories/TransactionRepository';
import { WalletRepository } from '../../data/repositories/WalletRepository';
import type { SqlDatabase } from '../../data/storage/sql/SqlDatabase';
import i18n from '../../localization/i18n';
import { useReports } from '../useReports';

/**
 * useReports - the month header follows the app language
 *
 * Registry F-06, finding 5. formatMonthLabel held its own hard-coded English
 * MONTH_NAMES array, so the Reports header read "March 2026" on a Russian
 * device while the Export screen, one tap away, read the same month in Russian
 * from export.months.*.
 *
 * D2: the label is built from those same keys, so the two screens cannot
 * disagree. The expected string is derived from the bundle and from the hook's
 * own selectedMonth, never restated: that keeps the test off the machine time
 * zone, since whichever month the clock lands on is the one compared.
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

/** The same ordered keys the export service and the Export screen already use. */
const MONTH_KEYS = [
    'export.months.january', 'export.months.february', 'export.months.march',
    'export.months.april', 'export.months.may', 'export.months.june',
    'export.months.july', 'export.months.august', 'export.months.september',
    'export.months.october', 'export.months.november', 'export.months.december',
] as const;

const expectedLabel = (language: string, selectedMonth: string): string => {
    const [year, month] = selectedMonth.split('-').map(Number);
    return `${i18n.getFixedT(language)(MONTH_KEYS[month - 1])} ${year}`;
};

describe('useReports month label', () => {
    beforeEach(async () => {
        mockDb = await createTestDb();
        mockBudgetRepo = new BudgetRepository(mockDb);
        mockCategoryRepo = new CategoryRepository(mockDb);
        mockTransactionRepo = new TransactionRepository(mockDb);
        mockWalletRepo = new WalletRepository(mockDb);
    });

    afterAll(async () => {
        await i18n.changeLanguage('en');
    });

    it.each(['ru', 'fr'])('names the month in %s', async (language) => {
        await i18n.changeLanguage(language);

        const { result } = renderHook(() => useReports());

        await waitFor(() => {
            expect(result.current.loading).toBe(false);
        });

        expect(result.current.monthLabel).toBe(
            expectedLabel(language, result.current.selectedMonth),
        );
    });
});
