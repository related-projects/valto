/**
 * useRecurringRules - per-rule status
 *
 * The rules screen listed a rule as active while it produced nothing. The hook
 * now derives one status per rule from the rule and its two references, so the
 * row can say which of the four non-producing states it is in.
 *
 * The wallets and categories are the ones useWallets and useCategories already
 * hold - no query is duplicated for this. These tests seed the same repositories
 * those hooks read.
 */

import { renderHook, waitFor } from '@testing-library/react-native';
import { createTestDb } from '../../../tests/helpers/createTestDb';
import type { SqlDatabase } from '../../data/storage/sql/SqlDatabase';
import { CategoryRepository } from '../../data/repositories/CategoryRepository';
import { RecurringTransactionRepository } from '../../data/repositories/RecurringTransactionRepository';
import { TransactionRepository } from '../../data/repositories/TransactionRepository';
import { WalletRepository } from '../../data/repositories/WalletRepository';
import { CategoryType, RecurrenceFrequency, TransactionType, WalletType } from '../../domain/entities';
import { RecurringRuleStatus } from '../../domain/recurring';

let mockDb: SqlDatabase;
let mockRecurringRepo: RecurringTransactionRepository;
let mockWalletRepo: WalletRepository;
let mockCategoryRepo: CategoryRepository;
let mockTransactionRepo: TransactionRepository;

jest.mock('../../core/di/container', () => ({
    container: {
        get recurringTransactionRepository() {
            return mockRecurringRepo;
        },
        get walletRepository() {
            return mockWalletRepo;
        },
        get categoryRepository() {
            return mockCategoryRepo;
        },
        get transactionRepository() {
            return mockTransactionRepo;
        },
    },
    getRecurringTransactionRepository: () => mockRecurringRepo,
    getWalletRepository: () => mockWalletRepo,
    getCategoryRepository: () => mockCategoryRepo,
    getTransactionRepository: () => mockTransactionRepo,
    getBudgetRepository: () => undefined,
    getUseCaseDeps: () => ({
        runInTransaction: (work: any) => mockDb.runInTransaction(work),
        transactionRepo: mockTransactionRepo,
        walletRepo: mockWalletRepo,
        categoryRepo: mockCategoryRepo,
        eventBus: { emit: jest.fn(), emitMultiple: jest.fn() },
    }),
}));

jest.mock('../../core/events/dataEvents', () => ({
    dataEvents: {
        subscribe: jest.fn(() => jest.fn()),
        emit: jest.fn(),
        emitMultiple: jest.fn(),
    },
}));

import { useRecurringRules } from '../useRecurringRules';

/** Midnight today, local time. */
function todayStart(): Date {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
}

/** Midnight `days` days before today, local time. */
function daysAgo(days: number): Date {
    const d = todayStart();
    d.setDate(d.getDate() - days);
    return d;
}

async function seedWallet(balance: number, type: WalletType = WalletType.CASH) {
    await mockWalletRepo.save({
        id: 'w-1',
        name: 'Cash Wallet',
        balance,
        type,
        createdAt: daysAgo(90),
    });
}

async function seedCategory() {
    await mockCategoryRepo.save({
        id: 'cat-1',
        name: 'Test Category',
        type: CategoryType.EXPENSE,
    });
}

/**
 * A daily expense rule with exactly one occurrence pending (yesterday's
 * watermark, today's due date).
 */
async function seedRule(overrides: Record<string, unknown> = {}) {
    await mockRecurringRepo.save({
        id: 'rule-1',
        type: TransactionType.EXPENSE,
        amount: 100,
        walletId: 'w-1',
        categoryId: 'cat-1',
        description: 'Test subscription',
        startDate: daysAgo(2),
        frequency: RecurrenceFrequency.DAILY,
        interval: 1,
        lastGeneratedDate: daysAgo(1),
        isPaused: false,
        createdAt: daysAgo(3),
        ...overrides,
    } as any);
}

async function statusOfSeededRule(): Promise<RecurringRuleStatus> {
    const { result } = renderHook(() => useRecurringRules());

    await waitFor(() => {
        expect(result.current.loading).toBe(false);
        expect(result.current.rules).toHaveLength(1);
        expect(result.current.statuses['rule-1']).toBeDefined();
    });

    return result.current.statuses['rule-1'];
}

describe('useRecurringRules statuses', () => {
    beforeEach(async () => {
        mockDb = await createTestDb();
        mockRecurringRepo = new RecurringTransactionRepository(mockDb);
        mockWalletRepo = new WalletRepository(mockDb);
        mockCategoryRepo = new CategoryRepository(mockDb);
        mockTransactionRepo = new TransactionRepository(mockDb);
    });

    it('reports ACTIVE for a rule that can run', async () => {
        await seedWallet(100000);
        await seedCategory();
        await seedRule();

        await expect(statusOfSeededRule()).resolves.toBe(RecurringRuleStatus.ACTIVE);
    });

    it('reports PAUSED for a paused rule', async () => {
        await seedWallet(100000);
        await seedCategory();
        await seedRule({ isPaused: true });

        await expect(statusOfSeededRule()).resolves.toBe(RecurringRuleStatus.PAUSED);
    });

    it('reports EXPIRED for a rule that the screen renders as Active', async () => {
        await seedWallet(100000);
        await seedCategory();
        await seedRule({ endDate: daysAgo(1), lastGeneratedDate: daysAgo(2) });

        await expect(statusOfSeededRule()).resolves.toBe(RecurringRuleStatus.EXPIRED);
    });

    it('reports MISSING_REFERENCE when the wallet is gone', async () => {
        await seedCategory();
        await seedRule();

        await expect(statusOfSeededRule()).resolves.toBe(RecurringRuleStatus.MISSING_REFERENCE);
    });

    it('reports MISSING_REFERENCE when the category is gone', async () => {
        await seedWallet(100000);
        await seedRule();

        await expect(statusOfSeededRule()).resolves.toBe(RecurringRuleStatus.MISSING_REFERENCE);
    });

    it('reports INSUFFICIENT_FUNDS when the wallet cannot cover what is pending', async () => {
        await seedWallet(50);
        await seedCategory();
        await seedRule();

        await expect(statusOfSeededRule()).resolves.toBe(
            RecurringRuleStatus.INSUFFICIENT_FUNDS,
        );
    });
});
