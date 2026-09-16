/**
 * Recurring Engine Watermark - one advance per occurrence
 *
 * The watermark used to be written once, after the whole generation loop had
 * finished. Every occurrence createTransaction had already committed stayed
 * committed when a later one threw, but the watermark never moved, so the next
 * run recomputed from the old fence and re-emitted the occurrences that were
 * already in the ledger. Real duplication, with no unique constraint and no
 * rule-to-transaction link to detect it afterwards.
 *
 * It stayed latent while a run covered one or two occurrences. The restore now
 * runs a catch-up over whatever window the backup file is old by, so
 * multi-occurrence runs are normal and the window for the failure is wide.
 */

import { createTestDb } from '../../../tests/helpers/createTestDb';
import { FaultInjectingDatabase } from '../../../tests/helpers/FaultInjectingDatabase';
import { dataEvents } from '../../core/events/dataEvents';
import { CategoryType } from '../../domain/entities/Category';
import {
    RecurrenceFrequency,
    type RecurringTransaction,
} from '../../domain/entities/RecurringTransaction';
import { TransactionType } from '../../domain/entities/Transaction';
import { WalletType } from '../../domain/entities/Wallet';
import { CategoryRepository } from '../repositories/CategoryRepository';
import { RecurringTransactionRepository } from '../repositories/RecurringTransactionRepository';
import { TransactionRepository } from '../repositories/TransactionRepository';
import { WalletRepository } from '../repositories/WalletRepository';
import { computeDueDates, processRecurringRules } from '../services/RecurringTransactionEngine';
import type { SqlDatabase } from '../storage/sql/SqlDatabase';

/**
 * First day of the month `monthsBack` months before the current month.
 *
 * Same anchoring discipline as recurringTransactions.test.ts: the engine
 * computes due dates against the real clock, so a fixture pinned to an absolute
 * date grows one due occurrence per month of elapsed time. startDate at
 * monthStart(4) with the watermark at monthStart(5) yields exactly 5 due dates
 * on any run date.
 */
function monthStart(monthsBack: number): Date {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth() - monthsBack, 1);
}

const FIVE_DUE_RULE: RecurringTransaction = {
    id: 'rule-wm',
    type: TransactionType.EXPENSE,
    amount: 1000,
    walletId: 'w-live',
    categoryId: 'cat-live',
    description: 'Five occurrences behind',
    startDate: monthStart(4),
    frequency: RecurrenceFrequency.MONTHLY,
    interval: 1,
    lastGeneratedDate: monthStart(5),
    isPaused: false,
    createdAt: monthStart(6),
};

describe('the watermark advances once per generated occurrence', () => {
    let db: SqlDatabase;
    let recurringRepo: RecurringTransactionRepository;
    let transactionRepo: TransactionRepository;
    let walletRepo: WalletRepository;
    let categoryRepo: CategoryRepository;
    let dueDates: Date[];

    /** Engine deps over `database`, so a faulty decorator can be swapped in. */
    function depsOver(database: SqlDatabase) {
        return {
            recurringRepo: new RecurringTransactionRepository(database),
            transactionRepo: new TransactionRepository(database),
            walletRepo: new WalletRepository(database),
            categoryRepo: new CategoryRepository(database),
            eventBus: dataEvents,
            runInTransaction: database.runInTransaction.bind(database),
        };
    }

    beforeEach(async () => {
        db = await createTestDb();
        recurringRepo = new RecurringTransactionRepository(db);
        transactionRepo = new TransactionRepository(db);
        walletRepo = new WalletRepository(db);
        categoryRepo = new CategoryRepository(db);

        // Balance far above 5 * 1000, so the funds guard never fires: this test
        // is about the watermark, not about the all-or-nothing pricing.
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
        await recurringRepo.save(FIVE_DUE_RULE);

        dueDates = computeDueDates(FIVE_DUE_RULE, new Date());
        expect(dueDates).toHaveLength(5);
    });

    it('leaves the watermark on the last committed occurrence when a later one fails', async () => {
        const faulty = FaultInjectingDatabase.failOnNthMatch(db, /INSERT INTO transactions/i, 3);

        const result = await processRecurringRules(depsOver(faulty));

        // Occurrence 3 of 5 threw: its own write rolled back, the two before it
        // did not, and the rule is reported as failed.
        expect(result.errors).toHaveLength(1);
        expect(result.errors[0].ruleId).toBe('rule-wm');
        expect(await transactionRepo.getAll()).toHaveLength(2);

        const rule = await recurringRepo.getById('rule-wm');
        expect(rule!.lastGeneratedDate.getTime()).toBe(dueDates[1].getTime());
    });

    it('emits only the occurrences that were never committed on the next run', async () => {
        const faulty = FaultInjectingDatabase.failOnNthMatch(db, /INSERT INTO transactions/i, 3);
        await processRecurringRules(depsOver(faulty));

        const second = await processRecurringRules(depsOver(db));

        expect(second.errors).toHaveLength(0);
        expect(second.transactionsGenerated).toBe(3);

        const all = await transactionRepo.getAll();
        expect(all).toHaveLength(5);

        // Every due date present exactly once - nothing re-emitted.
        const written = all.map((t) => t.date.getTime()).sort((a, b) => a - b);
        expect(written).toEqual(dueDates.map((d) => d.getTime()).sort((a, b) => a - b));

        const rule = await recurringRepo.getById('rule-wm');
        expect(rule!.lastGeneratedDate.getTime()).toBe(dueDates[4].getTime());
    });

    it('still advances to the final occurrence when the whole run succeeds', async () => {
        const result = await processRecurringRules(depsOver(db));

        expect(result.transactionsGenerated).toBe(5);
        const rule = await recurringRepo.getById('rule-wm');
        expect(rule!.lastGeneratedDate.getTime()).toBe(dueDates[4].getTime());
    });
});
