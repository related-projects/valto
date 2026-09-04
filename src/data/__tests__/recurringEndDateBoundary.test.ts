/**
 * Recurring Rule End-Date Boundary
 *
 * A rule is active THROUGH the end of its endDate day.
 *
 * getActiveRules compared `endDate > now` against a wall-clock instant while
 * every other date decision in the recurring path runs on startOfDay. A rule
 * whose endDate was today therefore stopped being active at midnight and lost
 * its final occurrence: the money it stood for was never recorded, and nothing
 * anywhere said so. The rule then reads as ended, which it is, so the missing
 * occurrence leaves no trace at all.
 */

import { CategoryType } from '../../domain/entities/Category';
import { TransactionType } from '../../domain/entities/Transaction';
import { WalletType } from '../../domain/entities/Wallet';
import { RecurrenceFrequency } from '../../domain/entities/RecurringTransaction';
import { CategoryRepository } from '../repositories/CategoryRepository';
import { RecurringTransactionRepository } from '../repositories/RecurringTransactionRepository';
import { TransactionRepository } from '../repositories/TransactionRepository';
import { WalletRepository } from '../repositories/WalletRepository';
import { createTestDb } from '../../../tests/helpers/createTestDb';
import type { SqlDatabase } from '../storage/sql/SqlDatabase';
import { processRecurringRules } from '../services/RecurringTransactionEngine';
import { dataEvents } from '../../core/events/dataEvents';

/** Midnight today, local time - the day the engine's arithmetic works in. */
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

/** Format a Date to 'YYYY-MM-DD' using local timezone */
function toLocalDateString(d: Date): string {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}

describe('a rule ending today still generates today', () => {
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

        await walletRepo.save({
            id: 'w-1',
            name: 'Bank Account',
            balance: 100000,
            type: WalletType.BANK,
            createdAt: daysAgo(30),
        });

        await categoryRepo.save({
            id: 'cat-1',
            name: 'Test Category',
            type: CategoryType.EXPENSE,
        });

        // Daily rule that started yesterday and ends today. Yesterday is already
        // generated, so today's occurrence is the only one pending - and it is
        // the last one this rule will ever produce.
        await recurringRepo.save({
            id: 'rule-1',
            type: TransactionType.EXPENSE,
            amount: 100,
            walletId: 'w-1',
            categoryId: 'cat-1',
            description: 'Final instalment',
            startDate: daysAgo(1),
            endDate: todayStart(),
            frequency: RecurrenceFrequency.DAILY,
            interval: 1,
            lastGeneratedDate: daysAgo(1),
            isPaused: false,
            createdAt: daysAgo(2),
        });
    });

    it('records the final occurrence on the day the rule ends', async () => {
        const result = await processRecurringRules({
            recurringRepo,
            transactionRepo,
            walletRepo,
            categoryRepo,
            eventBus: dataEvents,
            runInTransaction: db.runInTransaction,
        });

        expect(result.errors).toHaveLength(0);
        expect(result.transactionsGenerated).toBe(1);

        const txs = await transactionRepo.getAll();
        expect(txs).toHaveLength(1);
        expect(toLocalDateString(txs[0].date)).toBe(toLocalDateString(todayStart()));
    });

    it('does not produce anything the day after the rule ended', async () => {
        // Watermark already on the endDate: the final occurrence is recorded and
        // the rule has genuinely finished. Nothing more may be generated.
        await recurringRepo.updateLastGeneratedDate('rule-1', todayStart());

        const result = await processRecurringRules({
            recurringRepo,
            transactionRepo,
            walletRepo,
            categoryRepo,
            eventBus: dataEvents,
            runInTransaction: db.runInTransaction,
        });

        expect(result.transactionsGenerated).toBe(0);
        expect(await transactionRepo.getAll()).toHaveLength(0);
    });

    it('leaves a rule that ended yesterday out of the active set', async () => {
        await recurringRepo.update({
            ...(await recurringRepo.getById('rule-1'))!,
            startDate: daysAgo(3),
            endDate: daysAgo(1),
            lastGeneratedDate: daysAgo(2),
        });

        const active = await recurringRepo.getActiveRules();
        expect(active).toHaveLength(0);
    });
});
