/**
 * Recurring Transactions Tests
 *
 * Tests for:
 * - RecurringTransactionRepository CRUD and validation
 * - RecurringTransactionEngine idempotency and generation logic
 * - computeDueDates date arithmetic
 */

import { TransactionType } from '../../domain/entities/Transaction';
import { RecurrenceFrequency, type RecurringTransaction } from '../../domain/entities/RecurringTransaction';
import { RecurringTransactionRepository } from '../repositories/RecurringTransactionRepository';
import { TransactionRepository } from '../repositories/TransactionRepository';
import { WalletRepository } from '../repositories/WalletRepository';
import { RepositoryErrorType } from '../repositories/IRepository';
import { InMemoryStorage } from '../../../tests/helpers/InMemoryStorage';
import { processRecurringRules, computeDueDates } from '../services/RecurringTransactionEngine';
import { dataEvents } from '../../core/events/dataEvents';

// ─── Helpers ──────────────────────────────────────────────────────────

/** Create a local-timezone date (avoids UTC-parsing issues with 'YYYY-MM-DD' strings) */
function localDate(y: number, m: number, d: number): Date {
    return new Date(y, m - 1, d);
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
    let storage: InMemoryStorage;
    let repo: RecurringTransactionRepository;

    beforeEach(() => {
        storage = new InMemoryStorage();
        repo = new RecurringTransactionRepository(storage);
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
    let storage: InMemoryStorage;
    let recurringRepo: RecurringTransactionRepository;
    let transactionRepo: TransactionRepository;
    let walletRepo: WalletRepository;

    beforeEach(async () => {
        storage = new InMemoryStorage();
        recurringRepo = new RecurringTransactionRepository(storage);
        transactionRepo = new TransactionRepository(storage);
        walletRepo = new WalletRepository(storage);

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
        // Rule started Jan 1, today is March 15 → should generate Jan, Feb, Mar
        await recurringRepo.save(validRule({
            startDate: localDate(2026, 1, 1),
            lastGeneratedDate: localDate(2025, 12, 1),
        }));

        // Mock "today" by checking the result
        const result = await processRecurringRules({
            recurringRepo,
            transactionRepo,
            walletRepo,
            eventBus: dataEvents,
        });

        expect(result.rulesEvaluated).toBe(1);
        expect(result.transactionsGenerated).toBeGreaterThan(0);
        expect(result.errors).toHaveLength(0);

        // Transactions should exist
        const txs = await transactionRepo.getAll();
        expect(txs.length).toBeGreaterThan(0);
        expect(txs[0].walletId).toBe('w-1');
        expect(txs[0].categoryId).toBe('cat-1');
    });

    it('is idempotent — running twice produces no duplicates', async () => {
        await recurringRepo.save(validRule({
            startDate: localDate(2026, 1, 1),
            lastGeneratedDate: localDate(2025, 12, 1),
        }));

        await processRecurringRules({
            recurringRepo, transactionRepo, walletRepo, eventBus: dataEvents,
        });

        const countAfterFirst = (await transactionRepo.getAll()).length;

        await processRecurringRules({
            recurringRepo, transactionRepo, walletRepo, eventBus: dataEvents,
        });

        const countAfterSecond = (await transactionRepo.getAll()).length;
        expect(countAfterSecond).toBe(countAfterFirst);
    });

    it('skips paused rules', async () => {
        await recurringRepo.save(validRule({ isPaused: true }));

        const result = await processRecurringRules({
            recurringRepo, transactionRepo, walletRepo, eventBus: dataEvents,
        });

        expect(result.rulesEvaluated).toBe(0);
        expect(result.transactionsGenerated).toBe(0);
    });

    it('updates lastGeneratedDate after generation', async () => {
        await recurringRepo.save(validRule({
            startDate: localDate(2026, 1, 1),
            lastGeneratedDate: localDate(2025, 12, 1),
        }));

        await processRecurringRules({
            recurringRepo, transactionRepo, walletRepo, eventBus: dataEvents,
        });

        const updatedRule = await recurringRepo.getById('rule-1');
        expect(updatedRule!.lastGeneratedDate.getTime()).toBeGreaterThan(
            localDate(2025, 12, 1).getTime(),
        );
    });
});
