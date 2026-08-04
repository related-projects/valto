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
import { RecurrenceFrequency, type RecurringTransaction } from '../../domain/entities/RecurringTransaction';
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
 * First day of the month `monthsBack` months before the current month (local timezone).
 *
 * Engine tests must anchor rule fixtures to the run date: the engine computes due dates
 * against the real clock, so absolute fixture dates make the due count grow one per month
 * of elapsed time. With a monthly rule anchored on day 1,
 * `startDate = monthStart(k)` + `lastGeneratedDate = monthStart(k + 1)` yields exactly
 * `k + 1` due dates on any run date — the current month's occurrence is always on or before
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

// ─── Engine Integration Tests ─────────────────────────────────────────

describe('RecurringTransactionEngine', () => {
    let db: SqlDatabase;
    let recurringRepo: RecurringTransactionRepository;
    let transactionRepo: TransactionRepository;
    let walletRepo: WalletRepository;

    beforeEach(async () => {
        db = await createTestDb();
        recurringRepo = new RecurringTransactionRepository(db);
        transactionRepo = new TransactionRepository(db);
        walletRepo = new WalletRepository(db);

        // Seed a wallet for transaction creation
        await walletRepo.save({
            id: 'w-1',
            name: 'Test Wallet',
            balance: 10000,
            type: 'cash' as any,
            createdAt: new Date('2025-01-01'),
        });
    });

    it('generates missing transactions for a rule', async () => {
        // Rule started two months ago, watermark one month before that
        // → three dues: two months ago, last month, this month
        await recurringRepo.save(validRule({
            startDate: monthStart(2),
            lastGeneratedDate: monthStart(3),
        }));

        const result = await processRecurringRules({
            recurringRepo,
            transactionRepo,
            walletRepo,
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
            recurringRepo, transactionRepo, walletRepo, eventBus: dataEvents, runInTransaction: db.runInTransaction,
        });

        const countAfterFirst = (await transactionRepo.getAll()).length;
        // Guard against a vacuous 0 === 0 pass if the first run generated nothing
        expect(countAfterFirst).toBe(3);

        await processRecurringRules({
            recurringRepo, transactionRepo, walletRepo, eventBus: dataEvents, runInTransaction: db.runInTransaction,
        });

        const countAfterSecond = (await transactionRepo.getAll()).length;
        expect(countAfterSecond).toBe(countAfterFirst);
    });

    it('skips paused rules', async () => {
        await recurringRepo.save(validRule({ isPaused: true }));

        const result = await processRecurringRules({
            recurringRepo, transactionRepo, walletRepo, eventBus: dataEvents, runInTransaction: db.runInTransaction,
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
            recurringRepo, transactionRepo, walletRepo, eventBus: dataEvents, runInTransaction: db.runInTransaction,
        });

        // Watermark advanced to the last due date — this month's occurrence
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

    beforeEach(async () => {
        db = await createTestDb();
        recurringRepo = new RecurringTransactionRepository(db);
        transactionRepo = new TransactionRepository(db);
        walletRepo = new WalletRepository(db);
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

        // Rule: $100/month expense, two dues pending → $200 needed, only $50 available
        await recurringRepo.save(validRule({
            type: TransactionType.EXPENSE,
            amount: 100,
            walletId: 'w-1',
            startDate: monthStart(1),
            lastGeneratedDate: monthStart(2),
        }));

        const result = await processRecurringRules({
            recurringRepo, transactionRepo, walletRepo, eventBus: dataEvents, runInTransaction: db.runInTransaction,
        });

        // Rule was evaluated and skipped — not errored
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
        // Wallet with $150 — enough for 1 month but not 3
        await walletRepo.save({
            id: 'w-1',
            name: 'Cash Wallet',
            balance: 150,
            type: WalletType.CASH,
            createdAt: new Date('2025-01-01'),
        });

        // 3 overdue months × $100 = $300 needed
        await recurringRepo.save(validRule({
            type: TransactionType.EXPENSE,
            amount: 100,
            walletId: 'w-1',
            startDate: monthStart(2),
            lastGeneratedDate: monthStart(3),
        }));

        const result = await processRecurringRules({
            recurringRepo, transactionRepo, walletRepo, eventBus: dataEvents, runInTransaction: db.runInTransaction,
        });

        // ALL skipped — no partial generation, even though $150 covers a single due
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

        // Income rule — should always succeed
        await recurringRepo.save(validRule({
            type: TransactionType.INCOME,
            amount: 500,
            walletId: 'w-1',
            startDate: monthStart(1),
            lastGeneratedDate: monthStart(2),
        }));

        const result = await processRecurringRules({
            recurringRepo, transactionRepo, walletRepo, eventBus: dataEvents, runInTransaction: db.runInTransaction,
        });

        expect(result.skipped).toHaveLength(0);
        expect(result.transactionsGenerated).toBe(2);
    });

    it('never skips expense rules on bank wallets (overdraft allowed)', async () => {
        // Bank wallet with $0 balance — overdraft is allowed
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
            recurringRepo, transactionRepo, walletRepo, eventBus: dataEvents, runInTransaction: db.runInTransaction,
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
            recurringRepo, transactionRepo, walletRepo, eventBus: dataEvents, runInTransaction: db.runInTransaction,
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
        const INITIAL_BALANCE = 10; // below EXPECTED_COST → the first run must skip

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

        // First run — should be skipped
        const firstResult = await processRecurringRules({
            recurringRepo, transactionRepo, walletRepo, eventBus: dataEvents, runInTransaction: db.runInTransaction,
        });
        expect(firstResult.skipped).toHaveLength(1);
        expect(firstResult.skipped[0].amount).toBe(EXPECTED_COST);

        // Top the wallet up to exactly what the pending dues cost (updateBalance adds a delta)
        await walletRepo.updateBalance('w-1', EXPECTED_COST - INITIAL_BALANCE);

        // Retry the specific rule
        const retryResult = await retryRule(
            { recurringRepo, transactionRepo, walletRepo, eventBus: dataEvents, runInTransaction: db.runInTransaction },
            'rule-1',
        );

        expect(retryResult.generated).toBe(DUE_COUNT);
        expect(retryResult.skipped).toBeUndefined();

        // Transactions should now exist
        const txs = await transactionRepo.getAll();
        expect(txs).toHaveLength(DUE_COUNT);
    });
});
