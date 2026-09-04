/**
 * Recurring Engine Funds Guard - single definition
 *
 * The sufficiency decision was inline in generateForRule and is now
 * checkInsufficientFunds in the domain, because the rules screen has to answer
 * the same question without running the engine.
 *
 * These assertions go through processRecurringRules, not through the extracted
 * function: what matters is that the ENGINE refuses the same cases, on the same
 * all-or-nothing grain, and that the figure it reports is the one the extracted
 * function computes. Two copies of "insufficient" that agree today do not stay
 * agreed, so the agreement is asserted rather than assumed.
 *
 * The grain itself is untouched by this pass and stays open.
 */

import { CategoryType } from '../../domain/entities/Category';
import { TransactionType } from '../../domain/entities/Transaction';
import { WalletType } from '../../domain/entities/Wallet';
import { RecurrenceFrequency, type RecurringTransaction } from '../../domain/entities/RecurringTransaction';
import { checkInsufficientFunds } from '../../domain/recurring';
import { computeDueDates } from '../../domain/calculations/recurrenceDates';
import { CategoryRepository } from '../repositories/CategoryRepository';
import { RecurringTransactionRepository } from '../repositories/RecurringTransactionRepository';
import { TransactionRepository } from '../repositories/TransactionRepository';
import { WalletRepository } from '../repositories/WalletRepository';
import { createTestDb } from '../../../tests/helpers/createTestDb';
import type { SqlDatabase } from '../storage/sql/SqlDatabase';
import { processRecurringRules, SkipReason } from '../services/RecurringTransactionEngine';
import { dataEvents } from '../../core/events/dataEvents';

/** First day of the month `monthsBack` months before the current month (local timezone). */
function monthStart(monthsBack: number): Date {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth() - monthsBack, 1);
}

describe('the engine refuses through the extracted funds check', () => {
    let db: SqlDatabase;
    let recurringRepo: RecurringTransactionRepository;
    let transactionRepo: TransactionRepository;
    let walletRepo: WalletRepository;
    let categoryRepo: CategoryRepository;

    beforeEach(async () => {
        db = await createTestDb();
        recurringRepo = new RecurringTransactionRepository(db);
        transactionRepo = new TransactionRepository(db);
        walletRepo = new WalletRepository(db);
        categoryRepo = new CategoryRepository(db);

        await categoryRepo.save({
            id: 'cat-1',
            name: 'Test Category',
            type: CategoryType.EXPENSE,
        });
    });

    function rule(overrides: Partial<RecurringTransaction> = {}): RecurringTransaction {
        return {
            id: 'rule-1',
            type: TransactionType.EXPENSE,
            amount: 100,
            walletId: 'w-1',
            categoryId: 'cat-1',
            description: 'Test subscription',
            startDate: monthStart(2),
            frequency: RecurrenceFrequency.MONTHLY,
            interval: 1,
            lastGeneratedDate: monthStart(3),
            isPaused: false,
            createdAt: monthStart(4),
            ...overrides,
        };
    }

    const run = () =>
        processRecurringRules({
            recurringRepo,
            transactionRepo,
            walletRepo,
            categoryRepo,
            eventBus: dataEvents,
            runInTransaction: db.runInTransaction,
        });

    it('reports exactly the shortfall the extracted check computes', async () => {
        const wallet = {
            id: 'w-1',
            name: 'Cash Wallet',
            balance: 150,
            type: WalletType.CASH,
            createdAt: monthStart(6),
        };
        await walletRepo.save(wallet);

        const pending = rule();
        await recurringRepo.save(pending);

        const expected = checkInsufficientFunds(
            pending,
            wallet,
            computeDueDates(pending, new Date()),
        );
        expect(expected).not.toBeNull();

        const result = await run();

        expect(result.skipped).toHaveLength(1);
        expect(result.skipped[0].reason).toBe(SkipReason.INSUFFICIENT_FUNDS);
        expect(result.skipped[0].amount).toBe(expected!.totalCost);
        expect(result.skipped[0].availableBalance).toBe(expected!.availableBalance);
        expect(result.errors).toHaveLength(0);

        // All-or-nothing, unchanged: 150 covers a single 100 due and still nothing
        // is written.
        expect(result.transactionsGenerated).toBe(0);
        expect(await transactionRepo.getAll()).toHaveLength(0);
        const stored = await recurringRepo.getById('rule-1');
        expect(stored!.lastGeneratedDate.getTime()).toBe(monthStart(3).getTime());
    });

    it('agrees with the extracted check on every case it lets through', async () => {
        const cases = [
            { name: 'funded cash wallet', type: WalletType.CASH, balance: 100000, ruleType: TransactionType.EXPENSE },
            { name: 'income on an empty cash wallet', type: WalletType.CASH, balance: 0, ruleType: TransactionType.INCOME },
            { name: 'expense on an empty bank wallet', type: WalletType.BANK, balance: 0, ruleType: TransactionType.EXPENSE },
            { name: 'expense on an empty savings wallet', type: WalletType.SAVINGS, balance: 0, ruleType: TransactionType.EXPENSE },
        ];

        for (const testCase of cases) {
            db = await createTestDb();
            recurringRepo = new RecurringTransactionRepository(db);
            transactionRepo = new TransactionRepository(db);
            walletRepo = new WalletRepository(db);
            categoryRepo = new CategoryRepository(db);
            await categoryRepo.save({ id: 'cat-1', name: 'Test Category', type: CategoryType.EXPENSE });

            const wallet = {
                id: 'w-1',
                name: testCase.name,
                balance: testCase.balance,
                type: testCase.type,
                createdAt: monthStart(6),
            };
            await walletRepo.save(wallet);

            const pending = rule({ type: testCase.ruleType });
            await recurringRepo.save(pending);

            expect(
                checkInsufficientFunds(pending, wallet, computeDueDates(pending, new Date())),
            ).toBeNull();

            const result = await run();
            expect(result.skipped).toHaveLength(0);
            expect(result.transactionsGenerated).toBeGreaterThan(0);
        }
    });

    it('guards mobile wallets exactly as it guards cash wallets', async () => {
        const wallet = {
            id: 'w-1',
            name: 'Mobile Money',
            balance: 0,
            type: WalletType.MOBILE,
            createdAt: monthStart(6),
        };
        await walletRepo.save(wallet);

        const pending = rule();
        await recurringRepo.save(pending);

        const expected = checkInsufficientFunds(
            pending,
            wallet,
            computeDueDates(pending, new Date()),
        );

        const result = await run();
        expect(result.skipped).toHaveLength(1);
        expect(result.skipped[0].amount).toBe(expected!.totalCost);
    });
});
