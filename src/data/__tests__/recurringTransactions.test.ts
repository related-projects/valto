/**
 * Recurring Transactions Tests
 *
 * Tests for:
 * - RecurringTransactionRepository CRUD and validation
 * - RecurringTransactionEngine idempotency and generation logic
 * - computeDueDates date arithmetic
 */

import { TransactionType } from '../../domain/entities/Transaction';
import { WalletType } from '../../domain/entities/Wallet';
import { CategoryType } from '../../domain/entities/Category';
import { RecurrenceFrequency, type RecurringTransaction } from '../../domain/entities/RecurringTransaction';
import { CategoryRepository } from '../repositories/CategoryRepository';
import { RecurringTransactionRepository } from '../repositories/RecurringTransactionRepository';
import { TransactionRepository } from '../repositories/TransactionRepository';
import { WalletRepository } from '../repositories/WalletRepository';
import { RepositoryErrorType } from '../repositories/IRepository';
import { createTestDb } from '../../../tests/helpers/createTestDb';
import type { SqlDatabase } from '../storage/sql/SqlDatabase';
import { processRecurringRules, computeDueDates, retryRule, SkipReason } from '../services/RecurringTransactionEngine';
import { dataEvents } from '../../core/events/dataEvents';

// ─── Helpers ──────────────────────────────────────────────────────────

/** Create a local-timezone date (avoids UTC-parsing issues with 'YYYY-MM-DD' strings) */
function localDate(y: number, m: number, d: number): Date {
    return new Date(y, m - 1, d);
}

/**
 * Build a local date and throw if that day does not exist in the given month.
 *
 * `new Date(y, m - 1, 31)` silently rolls into the next month - that is the exact overflow
 * these anchor tests exist to catch, so a fixture built that way would reproduce the bug it
 * is meant to detect. Day 1 can never overflow, so the day is applied with `setDate` and the
 * result is verified before it is handed back.
 */
function anchorDate(y: number, m: number, d: number): Date {
    const date = new Date(y, m - 1, 1);
    date.setDate(d);
    if (date.getFullYear() !== y || date.getMonth() !== m - 1 || date.getDate() !== d) {
        throw new Error(`anchorDate: ${y}-${m}-${d} is not a real calendar date`);
    }
    return date;
}

/**
 * First day of the month `monthsBack` months before the current month (local timezone).
 *
 * Engine tests must anchor rule fixtures to the run date: the engine computes due dates
 * against the real clock, so absolute fixture dates make the due count grow one per month
 * of elapsed time. With a monthly rule anchored on day 1,
 * `startDate = monthStart(k)` + `lastGeneratedDate = monthStart(k + 1)` yields exactly
 * `k + 1` due dates on any run date - the current month's occurrence is always on or before
 * today, the next month's always after it.
 */
function monthStart(monthsBack: number): Date {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth() - monthsBack, 1);
}

/** Format a Date to 'YYYY-MM-DD' using local timezone */
function toLocalDateString(d: Date): string {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}

function validRule(overrides: Partial<RecurringTransaction> = {}): RecurringTransaction {
    return {
        id: 'rule-1',
        type: TransactionType.EXPENSE,
        amount: 100,
        walletId: 'w-1',
        categoryId: 'cat-1',
        description: 'Test subscription',
        startDate: localDate(2026, 1, 1),
        frequency: RecurrenceFrequency.MONTHLY,
        interval: 1,
        lastGeneratedDate: localDate(2025, 12, 1), // One month before start
        isPaused: false,
        createdAt: localDate(2025, 12, 15),
        ...overrides,
    };
}

// ─── Repository Tests ─────────────────────────────────────────────────

describe('RecurringTransactionRepository', () => {
    let db: SqlDatabase;
    let repo: RecurringTransactionRepository;

    beforeEach(async () => {
        db = await createTestDb();
        repo = new RecurringTransactionRepository(db);
    });

    it('saves and retrieves a rule', async () => {
        const rule = await repo.save(validRule());
        expect(rule.id).toBe('rule-1');

        const retrieved = await repo.getById('rule-1');
        expect(retrieved).not.toBeNull();
        expect(retrieved!.amount).toBe(100);
    });

    it('rejects duplicate IDs', async () => {
        await repo.save(validRule());
        await expect(repo.save(validRule())).rejects.toMatchObject({
            type: RepositoryErrorType.DUPLICATE_ERROR,
        });
    });

    it('rejects rule with empty id', async () => {
        await expect(repo.save(validRule({ id: '' }))).rejects.toMatchObject({
            type: RepositoryErrorType.VALIDATION_ERROR,
        });
    });

    it('rejects rule with negative amount', async () => {
        await expect(repo.save(validRule({ amount: -50 }))).rejects.toMatchObject({
            type: RepositoryErrorType.VALIDATION_ERROR,
        });
    });

    it('rejects rule with interval < 1', async () => {
        await expect(repo.save(validRule({ interval: 0 }))).rejects.toMatchObject({
            type: RepositoryErrorType.VALIDATION_ERROR,
        });
    });

    it('rejects rule with endDate before startDate', async () => {
        await expect(repo.save(validRule({
            endDate: new Date('2025-06-01'),
        }))).rejects.toMatchObject({
            type: RepositoryErrorType.VALIDATION_ERROR,
        });
    });

    it('pauses a rule', async () => {
        await repo.save(validRule());
        const paused = await repo.pauseRule('rule-1');
        expect(paused.isPaused).toBe(true);
    });

    it('resumes a paused rule', async () => {
        await repo.save(validRule({ isPaused: true }));
        const resumed = await repo.resumeRule('rule-1');
        expect(resumed.isPaused).toBe(false);
    });

    it('getActiveRules excludes paused rules', async () => {
        await repo.save(validRule({ id: 'active-1' }));
        await repo.save(validRule({ id: 'paused-1', isPaused: true }));
        const active = await repo.getActiveRules();
        expect(active).toHaveLength(1);
        expect(active[0].id).toBe('active-1');
    });

    it('deletes a rule', async () => {
        await repo.save(validRule());
        await repo.delete('rule-1');
        const all = await repo.getAll();
        expect(all).toHaveLength(0);
    });

    it('updates rule without affecting other rules', async () => {
        await repo.save(validRule({ id: 'rule-1' }));
        await repo.save(validRule({ id: 'rule-2', amount: 200 }));
        await repo.update({ ...validRule({ id: 'rule-1' }), amount: 999 });

        const r1 = await repo.getById('rule-1');
        const r2 = await repo.getById('rule-2');
        expect(r1!.amount).toBe(999);
        expect(r2!.amount).toBe(200);
    });

    // The initial watermark is computed one interval BEFORE startDate, so it steps months in
    // the opposite direction and clamps the same way: one month before the 31st of March is
    // the last day of February, not the 3rd of March.
    it('clamps the initial watermark of a monthly day-31 rule to the end of the short month', async () => {
        const rule = await repo.create({
            type: TransactionType.EXPENSE,
            amount: 100,
            walletId: 'w-1',
            categoryId: 'cat-1',
            startDate: anchorDate(2025, 3, 31),
            frequency: RecurrenceFrequency.MONTHLY,
            interval: 1,
        });

        expect(toLocalDateString(rule.lastGeneratedDate)).toBe('2025-02-28');
    });

    it('clamps the initial watermark of a yearly February 29 rule to February 28', async () => {
        const rule = await repo.create({
            type: TransactionType.EXPENSE,
            amount: 100,
            walletId: 'w-1',
            categoryId: 'cat-1',
            startDate: anchorDate(2024, 2, 29),
            frequency: RecurrenceFrequency.YEARLY,
            interval: 1,
        });

        expect(toLocalDateString(rule.lastGeneratedDate)).toBe('2023-02-28');
    });
});

// ─── computeDueDates Tests ────────────────────────────────────────────

describe('computeDueDates', () => {
    it('generates monthly dates from January to April', () => {
        const rule = validRule({
            startDate: localDate(2026, 1, 1),
            lastGeneratedDate: localDate(2025, 12, 1),
        });
        const today = localDate(2026, 4, 10);
        const dates = computeDueDates(rule, today);

        expect(dates).toHaveLength(4); // Jan, Feb, Mar, Apr
        expect(toLocalDateString(dates[0])).toBe('2026-01-01');
        expect(toLocalDateString(dates[3])).toBe('2026-04-01');
    });

    it('skips already-generated dates (idempotency)', () => {
        const rule = validRule({
            startDate: localDate(2026, 1, 1),
            lastGeneratedDate: localDate(2026, 2, 1), // Already generated Jan + Feb
        });
        const today = localDate(2026, 4, 10);
        const dates = computeDueDates(rule, today);

        expect(dates).toHaveLength(2); // Mar, Apr
        expect(toLocalDateString(dates[0])).toBe('2026-03-01');
    });

    it('respects endDate', () => {
        const rule = validRule({
            startDate: localDate(2026, 1, 1),
            lastGeneratedDate: localDate(2025, 12, 1),
            endDate: localDate(2026, 2, 15),
        });
        const today = localDate(2026, 4, 10);
        const dates = computeDueDates(rule, today);

        expect(dates).toHaveLength(2); // Jan + Feb only
    });

    it('handles every-2-weeks frequency', () => {
        const rule = validRule({
            startDate: localDate(2026, 1, 1),
            lastGeneratedDate: localDate(2025, 12, 25),
            frequency: RecurrenceFrequency.WEEKLY,
            interval: 2,
        });
        const today = localDate(2026, 2, 1);
        const dates = computeDueDates(rule, today);

        expect(dates).toHaveLength(3); // Jan 1, Jan 15, Jan 29
    });

    it('returns empty array when nothing is due', () => {
        const rule = validRule({
            startDate: localDate(2026, 6, 1),
            lastGeneratedDate: localDate(2026, 5, 1),
        });
        const today = localDate(2026, 4, 10);
        const dates = computeDueDates(rule, today);
        expect(dates).toHaveLength(0);
    });

    it('generates daily transactions', () => {
        const rule = validRule({
            startDate: localDate(2026, 1, 1),
            lastGeneratedDate: localDate(2025, 12, 31),
            frequency: RecurrenceFrequency.DAILY,
            interval: 1,
        });
        const today = localDate(2026, 1, 5);
        const dates = computeDueDates(rule, today);
        expect(dates).toHaveLength(5); // Jan 1-5
    });
});

// --- computeDueDates: day-of-month anchors ---------------------------
//
// These cases pass an explicit `today`, so absolute dates are safe here (unlike the engine
// integration tests below, which read the real clock and must stay relative to it).
//
// Contract under test: an anchor day that does not exist in the target month is clamped to
// the last day of that month, and the series returns to the anchor day the next month that
// is long enough. The clamp must never propagate.

describe('computeDueDates - day-of-month anchors', () => {
    /** Map due dates to 'YYYY-MM-DD' strings for readable assertions */
    function asStrings(dates: Date[]): string[] {
        return dates.map(toLocalDateString);
    }

    it('clamps a day-31 anchor to February and returns to 31 in March (non-leap year)', () => {
        const rule = validRule({
            startDate: anchorDate(2025, 1, 31),
            lastGeneratedDate: anchorDate(2024, 12, 31),
        });
        const dates = computeDueDates(rule, anchorDate(2025, 5, 31));

        expect(asStrings(dates)).toEqual([
            '2025-01-31',
            '2025-02-28',
            '2025-03-31',
            '2025-04-30',
            '2025-05-31',
        ]);
    });

    it('clamps a day-31 anchor to February 29 in a leap year and returns to 31 in March', () => {
        const rule = validRule({
            startDate: anchorDate(2024, 1, 31),
            lastGeneratedDate: anchorDate(2023, 12, 31),
        });
        const dates = computeDueDates(rule, anchorDate(2024, 3, 31));

        expect(asStrings(dates)).toEqual(['2024-01-31', '2024-02-29', '2024-03-31']);
    });

    it('clamps a day-30 anchor to February and returns to 30 in March', () => {
        const rule = validRule({
            startDate: anchorDate(2025, 1, 30),
            lastGeneratedDate: anchorDate(2024, 12, 30),
        });
        const dates = computeDueDates(rule, anchorDate(2025, 3, 31));

        expect(asStrings(dates)).toEqual(['2025-01-30', '2025-02-28', '2025-03-30']);
    });

    it('clamps a day-29 anchor to February in a non-leap year and returns to 29 in March', () => {
        const rule = validRule({
            startDate: anchorDate(2025, 1, 29),
            lastGeneratedDate: anchorDate(2024, 12, 29),
        });
        const dates = computeDueDates(rule, anchorDate(2025, 3, 31));

        expect(asStrings(dates)).toEqual(['2025-01-29', '2025-02-28', '2025-03-29']);
    });

    it('clamps a day-31 anchor in a 30-day month with no February involved', () => {
        const rule = validRule({
            startDate: anchorDate(2025, 3, 31),
            lastGeneratedDate: anchorDate(2025, 2, 28),
        });
        const dates = computeDueDates(rule, anchorDate(2025, 5, 31));

        expect(asStrings(dates)).toEqual(['2025-03-31', '2025-04-30', '2025-05-31']);
    });

    it('clamps a February 29 yearly anchor to February 28 in non-leap years, restoring it in the next leap year', () => {
        const rule = validRule({
            startDate: anchorDate(2024, 2, 29),
            lastGeneratedDate: anchorDate(2023, 2, 28),
            frequency: RecurrenceFrequency.YEARLY,
            interval: 1,
        });
        const dates = computeDueDates(rule, anchorDate(2028, 3, 1));

        expect(asStrings(dates)).toEqual([
            '2024-02-29',
            '2025-02-28',
            '2026-02-28',
            '2027-02-28',
            '2028-02-29',
        ]);
    });

    it('yields 12 occurrences for a day-31 monthly anchor over a full year', () => {
        const rule = validRule({
            startDate: anchorDate(2025, 1, 31),
            lastGeneratedDate: anchorDate(2024, 12, 31),
        });
        const dates = computeDueDates(rule, anchorDate(2025, 12, 31));

        expect(dates).toHaveLength(12);
        expect(asStrings(dates)).toEqual([
            '2025-01-31',
            '2025-02-28',
            '2025-03-31',
            '2025-04-30',
            '2025-05-31',
            '2025-06-30',
            '2025-07-31',
            '2025-08-31',
            '2025-09-30',
            '2025-10-31',
            '2025-11-30',
            '2025-12-31',
        ]);
    });
});

// ─── Engine Integration Tests ─────────────────────────────────────────

describe('RecurringTransactionEngine', () => {
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

        // Seed a wallet for transaction creation
        await walletRepo.save({
            id: 'w-1',
            name: 'Test Wallet',
            balance: 10000,
            type: 'cash' as any,
            createdAt: new Date('2025-01-01'),
        });

        // Seed the category validRule() points at. It was missing: these tests
        // ran the engine on rules whose category did not exist, and were green,
        // because nothing checked the category. See the pre-flight in
        // generateForRule and recurringRuleReferences.test.ts.
        await categoryRepo.save({
            id: 'cat-1',
            name: 'Test Category',
            type: CategoryType.EXPENSE,
        });
    });

    it('generates missing transactions for a rule', async () => {
        // Rule started two months ago, watermark one month before that
        // -> three dues: two months ago, last month, this month
        await recurringRepo.save(validRule({
            startDate: monthStart(2),
            lastGeneratedDate: monthStart(3),
        }));

        const result = await processRecurringRules({
            recurringRepo,
            transactionRepo,
            walletRepo,
            categoryRepo,
            eventBus: dataEvents, runInTransaction: db.runInTransaction,
        });

        expect(result.rulesEvaluated).toBe(1);
        expect(result.transactionsGenerated).toBe(3);
        expect(result.errors).toHaveLength(0);

        // Transactions should exist
        const txs = await transactionRepo.getAll();
        expect(txs).toHaveLength(3);
        expect(txs[0].walletId).toBe('w-1');
        expect(txs[0].categoryId).toBe('cat-1');
    });

    it('is idempotent — running twice produces no duplicates', async () => {
        await recurringRepo.save(validRule({
            startDate: monthStart(2),
            lastGeneratedDate: monthStart(3),
        }));

        await processRecurringRules({
            recurringRepo, transactionRepo, walletRepo, categoryRepo, eventBus: dataEvents, runInTransaction: db.runInTransaction,
        });

        const countAfterFirst = (await transactionRepo.getAll()).length;
        // Guard against a vacuous 0 === 0 pass if the first run generated nothing
        expect(countAfterFirst).toBe(3);

        await processRecurringRules({
            recurringRepo, transactionRepo, walletRepo, categoryRepo, eventBus: dataEvents, runInTransaction: db.runInTransaction,
        });

        const countAfterSecond = (await transactionRepo.getAll()).length;
        expect(countAfterSecond).toBe(countAfterFirst);
    });

    it('skips paused rules', async () => {
        await recurringRepo.save(validRule({ isPaused: true }));

        const result = await processRecurringRules({
            recurringRepo, transactionRepo, walletRepo, categoryRepo, eventBus: dataEvents, runInTransaction: db.runInTransaction,
        });

        expect(result.rulesEvaluated).toBe(0);
        expect(result.transactionsGenerated).toBe(0);
    });

    it('updates lastGeneratedDate after generation', async () => {
        await recurringRepo.save(validRule({
            startDate: monthStart(2),
            lastGeneratedDate: monthStart(3),
        }));

        await processRecurringRules({
            recurringRepo, transactionRepo, walletRepo, categoryRepo, eventBus: dataEvents, runInTransaction: db.runInTransaction,
        });

        // Watermark advanced to the last due date - this month's occurrence
        const updatedRule = await recurringRepo.getById('rule-1');
        expect(updatedRule!.lastGeneratedDate.getTime()).toBe(monthStart(0).getTime());
    });
});

// ─── Insufficient Funds Handling Tests ────────────────────────────────

describe('RecurringTransactionEngine — Insufficient Funds', () => {
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

        // The category validRule() points at - see the note in the describe
        // above. Each test here seeds its own wallet; the category is constant.
        await categoryRepo.save({
            id: 'cat-1',
            name: 'Test Category',
            type: CategoryType.EXPENSE,
        });
    });

    it('skips expense rule when cash wallet has insufficient funds', async () => {
        // Wallet with only $50
        await walletRepo.save({
            id: 'w-1',
            name: 'Cash Wallet',
            balance: 50,
            type: WalletType.CASH,
            createdAt: new Date('2025-01-01'),
        });

        // Rule: $100/month expense, two dues pending -> $200 needed, only $50 available
        await recurringRepo.save(validRule({
            type: TransactionType.EXPENSE,
            amount: 100,
            walletId: 'w-1',
            startDate: monthStart(1),
            lastGeneratedDate: monthStart(2),
        }));

        const result = await processRecurringRules({
            recurringRepo, transactionRepo, walletRepo, categoryRepo, eventBus: dataEvents, runInTransaction: db.runInTransaction,
        });

        // Rule was evaluated and skipped - not errored
        expect(result.rulesEvaluated).toBe(1);
        expect(result.skipped).toHaveLength(1);
        expect(result.skipped[0].reason).toBe(SkipReason.INSUFFICIENT_FUNDS);
        expect(result.skipped[0].ruleId).toBe('rule-1');
        expect(result.errors).toHaveLength(0);

        // No transaction created
        const txs = await transactionRepo.getAll();
        expect(txs).toHaveLength(0);

        // lastGeneratedDate NOT advanced
        const rule = await recurringRepo.getById('rule-1');
        expect(rule!.lastGeneratedDate.getTime()).toBe(monthStart(2).getTime());
    });

    it('skips rule when cumulative dues exceed balance (all-or-nothing)', async () => {
        // Wallet with $150 - enough for 1 month but not 3
        await walletRepo.save({
            id: 'w-1',
            name: 'Cash Wallet',
            balance: 150,
            type: WalletType.CASH,
            createdAt: new Date('2025-01-01'),
        });

        // 3 overdue months x $100 = $300 needed
        await recurringRepo.save(validRule({
            type: TransactionType.EXPENSE,
            amount: 100,
            walletId: 'w-1',
            startDate: monthStart(2),
            lastGeneratedDate: monthStart(3),
        }));

        const result = await processRecurringRules({
            recurringRepo, transactionRepo, walletRepo, categoryRepo, eventBus: dataEvents, runInTransaction: db.runInTransaction,
        });

        // ALL skipped - no partial generation, even though $150 covers a single due
        expect(result.skipped).toHaveLength(1);
        expect(result.skipped[0].amount).toBe(300);
        expect(result.transactionsGenerated).toBe(0);

        const txs = await transactionRepo.getAll();
        expect(txs).toHaveLength(0);
    });

    it('never skips income rules regardless of balance', async () => {
        // Wallet with $0 balance
        await walletRepo.save({
            id: 'w-1',
            name: 'Cash Wallet',
            balance: 0,
            type: WalletType.CASH,
            createdAt: new Date('2025-01-01'),
        });

        // Income rule - should always succeed
        await recurringRepo.save(validRule({
            type: TransactionType.INCOME,
            amount: 500,
            walletId: 'w-1',
            startDate: monthStart(1),
            lastGeneratedDate: monthStart(2),
        }));

        const result = await processRecurringRules({
            recurringRepo, transactionRepo, walletRepo, categoryRepo, eventBus: dataEvents, runInTransaction: db.runInTransaction,
        });

        expect(result.skipped).toHaveLength(0);
        expect(result.transactionsGenerated).toBe(2);
    });

    it('never skips expense rules on bank wallets (overdraft allowed)', async () => {
        // Bank wallet with $0 balance - overdraft is allowed
        await walletRepo.save({
            id: 'w-1',
            name: 'Bank Account',
            balance: 0,
            type: WalletType.BANK,
            createdAt: new Date('2025-01-01'),
        });

        await recurringRepo.save(validRule({
            type: TransactionType.EXPENSE,
            amount: 100,
            walletId: 'w-1',
            startDate: monthStart(1),
            lastGeneratedDate: monthStart(2),
        }));

        const result = await processRecurringRules({
            recurringRepo, transactionRepo, walletRepo, categoryRepo, eventBus: dataEvents, runInTransaction: db.runInTransaction,
        });

        expect(result.skipped).toHaveLength(0);
        expect(result.transactionsGenerated).toBe(2);
        expect(result.errors).toHaveLength(0);
    });

    it('does not console.error for insufficient funds (business case)', async () => {
        const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
        const infoSpy = jest.spyOn(console, 'info').mockImplementation(() => {});
        const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

        await walletRepo.save({
            id: 'w-1',
            name: 'Cash Wallet',
            balance: 10,
            type: WalletType.CASH,
            createdAt: new Date('2025-01-01'),
        });

        await recurringRepo.save(validRule({
            type: TransactionType.EXPENSE,
            amount: 100,
            walletId: 'w-1',
            startDate: monthStart(1),
            lastGeneratedDate: monthStart(2),
        }));

        await processRecurringRules({
            recurringRepo, transactionRepo, walletRepo, categoryRepo, eventBus: dataEvents, runInTransaction: db.runInTransaction,
        });

        // console.error should NOT have been called for this business case
        expect(errorSpy).not.toHaveBeenCalled();

        // console.info SHOULD have been called with skip info
        expect(infoSpy).toHaveBeenCalledWith(
            expect.stringContaining('skipped'),
        );

        errorSpy.mockRestore();
        infoSpy.mockRestore();
        logSpy.mockRestore();
    });

    it('retryRule succeeds after funds are added', async () => {
        const RULE_AMOUNT = 100;
        const DUE_COUNT = 2; // monthStart(1) and monthStart(0)
        const EXPECTED_COST = RULE_AMOUNT * DUE_COUNT;
        const INITIAL_BALANCE = 10; // below EXPECTED_COST -> the first run must skip

        // Start with low balance
        await walletRepo.save({
            id: 'w-1',
            name: 'Cash Wallet',
            balance: INITIAL_BALANCE,
            type: WalletType.CASH,
            createdAt: new Date('2025-01-01'),
        });

        await recurringRepo.save(validRule({
            type: TransactionType.EXPENSE,
            amount: RULE_AMOUNT,
            walletId: 'w-1',
            startDate: monthStart(1),
            lastGeneratedDate: monthStart(2),
        }));

        // First run - should be skipped
        const firstResult = await processRecurringRules({
            recurringRepo, transactionRepo, walletRepo, categoryRepo, eventBus: dataEvents, runInTransaction: db.runInTransaction,
        });
        expect(firstResult.skipped).toHaveLength(1);
        expect(firstResult.skipped[0].amount).toBe(EXPECTED_COST);

        // Top the wallet up to exactly what the pending dues cost (updateBalance adds a delta)
        await walletRepo.updateBalance('w-1', EXPECTED_COST - INITIAL_BALANCE);

        // Retry the specific rule
        const retryResult = await retryRule(
            { recurringRepo, transactionRepo, walletRepo, categoryRepo, eventBus: dataEvents, runInTransaction: db.runInTransaction },
            'rule-1',
        );

        expect(retryResult.generated).toBe(DUE_COUNT);
        expect(retryResult.skipped).toBeUndefined();

        // Transactions should now exist
        const txs = await transactionRepo.getAll();
        expect(txs).toHaveLength(DUE_COUNT);
    });
});
