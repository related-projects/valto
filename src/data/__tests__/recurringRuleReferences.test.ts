/**
 * Recurring Rule Reference Integrity - engine pre-flight
 *
 * A recurring rule is a standing order. Its wallet and its category are both
 * required for it to execute, and neither reference is backed by a database
 * constraint, so a rule can outlive either one. The engine must refuse such a
 * rule BEFORE it writes anything, for every rule type and for both references.
 *
 * Past data may lose its link; a future instruction may not. An orphaned
 * transaction is a past fact that remains true. An orphaned recurring rule is a
 * standing order that will never execute - and, before this pre-flight existed,
 * a dangling category did not even fail: it wrote a transaction pointing at a
 * category that does not exist and advanced the watermark past the occurrence.
 */

import { TransactionType } from '../../domain/entities/Transaction';
import { WalletType } from '../../domain/entities/Wallet';
import { CategoryType } from '../../domain/entities/Category';
import {
    RecurrenceFrequency,
    type RecurringTransaction,
} from '../../domain/entities/RecurringTransaction';
import { CategoryRepository } from '../repositories/CategoryRepository';
import { RecurringTransactionRepository } from '../repositories/RecurringTransactionRepository';
import { TransactionRepository } from '../repositories/TransactionRepository';
import { WalletRepository } from '../repositories/WalletRepository';
import { createTestDb } from '../../../tests/helpers/createTestDb';
import type { SqlDatabase } from '../storage/sql/SqlDatabase';
import { processRecurringRules } from '../services/RecurringTransactionEngine';
import { dataEvents } from '../../core/events/dataEvents';

// --- Helpers ---

/**
 * First day of the month `monthsBack` months before the current month.
 *
 * Same anchoring discipline as recurringTransactions.test.ts: the engine
 * computes due dates against the real clock, so a fixture pinned to an absolute
 * date grows one due occurrence per month of elapsed time.
 */
function monthStart(monthsBack: number): Date {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth() - monthsBack, 1);
}

/** A rule with exactly two due occurrences on any run date. */
function dueRule(overrides: Partial<RecurringTransaction> = {}): RecurringTransaction {
    return {
        id: 'rule-ref',
        type: TransactionType.EXPENSE,
        amount: 1000,
        walletId: 'w-live',
        categoryId: 'cat-live',
        description: 'Reference integrity fixture',
        startDate: monthStart(1),
        frequency: RecurrenceFrequency.MONTHLY,
        interval: 1,
        lastGeneratedDate: monthStart(2),
        isPaused: false,
        createdAt: monthStart(3),
        ...overrides,
    };
}

describe('recurring engine reference pre-flight', () => {
    let db: SqlDatabase;
    let recurringRepo: RecurringTransactionRepository;
    let transactionRepo: TransactionRepository;
    let walletRepo: WalletRepository;
    let categoryRepo: CategoryRepository;
    let runInTransaction: jest.Mock;

    function deps() {
        return {
            recurringRepo,
            transactionRepo,
            walletRepo,
            categoryRepo,
            eventBus: dataEvents,
            runInTransaction: runInTransaction as unknown as SqlDatabase['runInTransaction'],
        };
    }

    beforeEach(async () => {
        db = await createTestDb();
        recurringRepo = new RecurringTransactionRepository(db);
        transactionRepo = new TransactionRepository(db);
        walletRepo = new WalletRepository(db);
        categoryRepo = new CategoryRepository(db);

        // The write boundary is spied on, never stubbed: a pre-flight refusal
        // must not even open a transaction, and "was a transaction opened" is
        // the observable that separates "refused before any write" from
        // "attempted a write and it blew up somewhere inside".
        runInTransaction = jest.fn((work: () => Promise<unknown>) =>
            db.runInTransaction(work),
        );

        await walletRepo.save({
            id: 'w-live',
            name: 'Live Wallet',
            balance: 1000000,
            type: WalletType.CASH,
            createdAt: monthStart(6),
        });
        await categoryRepo.save({
            id: 'cat-live',
            name: 'Live Category',
            type: CategoryType.EXPENSE,
        });
    });

    it('refuses an expense rule whose category no longer exists, writing nothing', async () => {
        await recurringRepo.save(dueRule({ categoryId: 'cat-deleted' }));

        const result = await processRecurringRules(deps());

        expect(result.transactionsGenerated).toBe(0);
        expect(result.errors).toHaveLength(1);
        expect(result.errors[0].ruleId).toBe('rule-ref');
        expect(result.skipped).toHaveLength(0);
        expect(runInTransaction).not.toHaveBeenCalled();
        expect(await transactionRepo.getAll()).toHaveLength(0);
    });

    it('refuses an income rule whose category no longer exists, writing nothing', async () => {
        await recurringRepo.save(
            dueRule({ type: TransactionType.INCOME, categoryId: 'cat-deleted' }),
        );

        const result = await processRecurringRules(deps());

        expect(result.transactionsGenerated).toBe(0);
        expect(result.errors).toHaveLength(1);
        expect(runInTransaction).not.toHaveBeenCalled();
        expect(await transactionRepo.getAll()).toHaveLength(0);
    });

    it('refuses an income rule whose wallet no longer exists before opening a write', async () => {
        await recurringRepo.save(
            dueRule({ type: TransactionType.INCOME, walletId: 'w-deleted' }),
        );

        const result = await processRecurringRules(deps());

        expect(result.transactionsGenerated).toBe(0);
        expect(result.errors).toHaveLength(1);
        // The income path used to reach createTransaction and fail inside
        // WalletRepository.updateBalance - which means it had already opened a
        // transaction and inserted a row before the rollback undid it.
        expect(runInTransaction).not.toHaveBeenCalled();
        expect(await transactionRepo.getAll()).toHaveLength(0);
    });

    it('refuses an expense rule whose wallet no longer exists before opening a write', async () => {
        await recurringRepo.save(dueRule({ walletId: 'w-deleted' }));

        const result = await processRecurringRules(deps());

        expect(result.transactionsGenerated).toBe(0);
        expect(result.errors).toHaveLength(1);
        expect(runInTransaction).not.toHaveBeenCalled();
    });

    it('checks references before funds - a rule pointing nowhere is not a funding problem', async () => {
        await walletRepo.save({
            id: 'w-broke',
            name: 'Empty Cash',
            balance: 0,
            type: WalletType.CASH,
            createdAt: monthStart(6),
        });

        await recurringRepo.save(
            dueRule({ walletId: 'w-broke', categoryId: 'cat-deleted' }),
        );

        const result = await processRecurringRules(deps());

        // Reported as a broken reference, NOT as INSUFFICIENT_FUNDS: the funds
        // guard would tell the user to add money to a rule that would still
        // never execute afterwards.
        expect(result.skipped).toHaveLength(0);
        expect(result.errors).toHaveLength(1);
        expect(result.transactionsGenerated).toBe(0);
    });

    it('leaves the watermark unadvanced when a reference is broken', async () => {
        const rule = dueRule({ categoryId: 'cat-deleted' });
        await recurringRepo.save(rule);

        await processRecurringRules(deps());

        const after = await recurringRepo.getById('rule-ref');
        expect(after).not.toBeNull();
        expect(after!.lastGeneratedDate.getTime()).toBe(
            rule.lastGeneratedDate.getTime(),
        );
    });

    it('stays silent for a broken rule with nothing due', async () => {
        // Watermark already at this month: nothing is due, so a rule whose
        // references are both gone must not be reported. The pre-flight runs
        // after the "nothing due" early return, not before it.
        await recurringRepo.save(
            dueRule({
                startDate: monthStart(1),
                lastGeneratedDate: monthStart(0),
                walletId: 'w-deleted',
                categoryId: 'cat-deleted',
            }),
        );

        const result = await processRecurringRules(deps());

        expect(result.errors).toHaveLength(0);
        expect(result.skipped).toHaveLength(0);
        expect(result.transactionsGenerated).toBe(0);
    });

    it('still generates normally when both references resolve', async () => {
        await recurringRepo.save(dueRule());

        const result = await processRecurringRules(deps());

        expect(result.errors).toHaveLength(0);
        expect(result.transactionsGenerated).toBe(2);
        expect(await transactionRepo.getAll()).toHaveLength(2);
    });
});
