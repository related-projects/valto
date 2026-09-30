/**
 * V-98: one recurring occurrence is written once, whatever the zone and
 * whatever interrupts the run.
 *
 * The only guard used to be lastGeneratedDate: the instant of local midnight in
 * the zone that wrote it, read back as a local day in the zone that reads it.
 * After a westward move the watermark falls on the previous local day, the
 * strict `cursor > fence` test lets the last occurrence through again, and
 * nothing downstream catches the second row: no unique constraint, no link
 * from a transaction to its rule. The watermark was also written outside the
 * transaction that wrote the occurrence.
 *
 * Zones (register policy no. 9): every fixture is built with the LOCAL Date
 * constructor and the clock is pinned with pinClock, which leaves the zone to
 * the process. The suite therefore holds in whatever zone it runs in; CI runs
 * it under TZ=UTC, Africa/Lagos and America/New_York, and the zone-shift case
 * was also run under Pacific/Honolulu and Pacific/Kiritimati. The zone is set
 * on the process (TZ=... npx jest), never from inside a test.
 */

import { createTestDb } from '../../../tests/helpers/createTestDb';
import { FaultInjectingDatabase } from '../../../tests/helpers/FaultInjectingDatabase';
import { pinClock, restoreZoneClock } from '../../../tests/helpers/zoneClock';
import { CategoryType } from '../../domain/entities/Category';
import { RecurrenceFrequency } from '../../domain/entities/RecurringTransaction';
import { type Transaction, TransactionType } from '../../domain/entities/Transaction';
import { WalletType } from '../../domain/entities/Wallet';
import { CategoryRepository } from '../repositories/CategoryRepository';
import { RecurringTransactionRepository } from '../repositories/RecurringTransactionRepository';
import { TransactionRepository } from '../repositories/TransactionRepository';
import { WalletRepository } from '../repositories/WalletRepository';
import { processRecurringRules } from '../services/RecurringTransactionEngine';
import { sqlInsert, transactionMapper } from '../storage/sql/mappers';
import type { SqlDatabase } from '../storage/sql/SqlDatabase';

const WALLET_ID = 'w-main';
const CATEGORY_ID = 'cat-main';
const OPENING_BALANCE = 10000000;

/** Local midnight of a calendar day, in the process zone. */
function localDay(year: number, monthIndex: number, day: number): number {
    return new Date(year, monthIndex, day).getTime();
}

/** Local noon of a calendar day, in the process zone. */
function localNoon(year: number, monthIndex: number, day: number): Date {
    return new Date(year, monthIndex, day, 12, 0);
}

let db: SqlDatabase;
let recurringRepo: RecurringTransactionRepository;
let transactionRepo: TransactionRepository;
let walletRepo: WalletRepository;

/** Engine deps over `database`, so a faulty decorator can be swapped in. */
function depsOver(database: SqlDatabase) {
    return {
        recurringRepo: new RecurringTransactionRepository(database),
        transactionRepo: new TransactionRepository(database),
        walletRepo: new WalletRepository(database),
        categoryRepo: new CategoryRepository(database),
        eventBus: { emit: jest.fn(), emitMultiple: jest.fn() },
        runInTransaction: database.runInTransaction.bind(database),
    };
}

function createExpenseRule(
    description: string,
    amount: number,
    startDate: Date,
    frequency: RecurrenceFrequency,
    interval = 1,
) {
    return recurringRepo.create({
        type: TransactionType.EXPENSE,
        amount,
        walletId: WALLET_ID,
        categoryId: CATEGORY_ID,
        description,
        startDate,
        frequency,
        interval,
    });
}

/** Every ledger row a rule produced; the rule's description is the row's note. */
async function rowsOf(description: string): Promise<Transaction[]> {
    const all = await transactionRepo.getAll();
    return all.filter((t) => t.note === description);
}

async function balance(): Promise<number> {
    return (await walletRepo.getById(WALLET_ID))!.balance;
}

/**
 * Rewrite every instant the engine wrote as a local midnight - each rule's
 * watermark and each occurrence's date - as if a zone `hours` east of the
 * process zone had written it: its midnight is that many hours earlier in UTC.
 */
async function simulateWriterZoneEast(hours: number): Promise<void> {
    const shift = (iso: unknown) => new Date(new Date(String(iso)).getTime() - hours * 3600000).toISOString();

    const { rows: rules } = await db.execute('SELECT id, last_generated_date FROM recurring_rules');
    for (const r of rules) {
        await db.execute('UPDATE recurring_rules SET last_generated_date = ? WHERE id = ?', [
            shift(r.last_generated_date),
            r.id,
        ]);
    }
    const { rows: txs } = await db.execute('SELECT id, date FROM transactions');
    for (const t of txs) {
        await db.execute('UPDATE transactions SET date = ? WHERE id = ?', [shift(t.date), t.id]);
    }
}

beforeEach(async () => {
    db = await createTestDb();
    recurringRepo = new RecurringTransactionRepository(db);
    transactionRepo = new TransactionRepository(db);
    walletRepo = new WalletRepository(db);

    // A bank wallet: the funds guard covers cash and mobile only, and this
    // suite is about how often an occurrence is written, not about pricing.
    await walletRepo.save({
        id: WALLET_ID,
        name: 'Main',
        balance: OPENING_BALANCE,
        type: WalletType.BANK,
        createdAt: new Date(2025, 0, 1),
    });
    await new CategoryRepository(db).save({
        id: CATEGORY_ID,
        name: 'Bills',
        type: CategoryType.EXPENSE,
    });
});

afterEach(() => {
    restoreZoneClock();
});

// The clock every case starts from: 20 June 2026, local noon.
const NOW = localNoon(2026, 5, 20).getTime();

describe('V-98 a. zone shift (process zone; run under TZ=UTC, Africa/Lagos, America/New_York, Pacific/Honolulu, Pacific/Kiritimati)', () => {
    it('zone shift: after a writer zone 6 h east, a second run writes no occurrence twice and debits nothing', async () => {
        pinClock(NOW);
        // 10 Mar, 10 Apr, 10 May, 10 Jun are due by 20 Jun.
        await createExpenseRule('Rent', 12000, localNoon(2026, 2, 10), RecurrenceFrequency.MONTHLY);
        // 15 to 20 Jun are due.
        await createExpenseRule('Transit', 2000, localNoon(2026, 5, 15), RecurrenceFrequency.DAILY);

        const first = await processRecurringRules(depsOver(db));
        expect(first.errors).toEqual([]);
        expect(await rowsOf('Rent')).toHaveLength(4);
        expect(await rowsOf('Transit')).toHaveLength(6);
        const balanceAfterFirst = await balance();
        expect(balanceAfterFirst).toBe(OPENING_BALANCE - 4 * 12000 - 6 * 2000);

        await simulateWriterZoneEast(6);

        const second = await processRecurringRules(depsOver(db));

        expect(second.errors).toEqual([]);
        expect(await rowsOf('Rent')).toHaveLength(4);
        expect(await rowsOf('Transit')).toHaveLength(6);
        expect(await balance()).toBe(balanceAfterFirst);
    });
});

describe('V-98 b. interrupted run (process zone; CI: UTC, Africa/Lagos, America/New_York)', () => {
    it('interrupted run: a failed watermark write leaves no occurrence behind to be written again', async () => {
        pinClock(NOW);
        // 10 Apr, 10 May, 10 Jun are due.
        await createExpenseRule('Insurance', 1000, localNoon(2026, 3, 10), RecurrenceFrequency.MONTHLY);

        // The first write to the rules table - the watermark of the first
        // occurrence - throws.
        const faulty = FaultInjectingDatabase.failOnNthMatch(db, /^\s*UPDATE recurring_rules/i, 1);
        const interrupted = await processRecurringRules(depsOver(faulty));
        expect(interrupted.errors).toHaveLength(1);

        const rerun = await processRecurringRules(depsOver(db));

        expect(rerun.errors).toEqual([]);
        const dates = (await rowsOf('Insurance')).map((t) => t.date.getTime()).sort((a, b) => a - b);
        expect(dates).toEqual([localDay(2026, 3, 10), localDay(2026, 4, 10), localDay(2026, 5, 10)]);
        expect(await balance()).toBe(OPENING_BALANCE - 3 * 1000);
    });
});

describe('V-98 c. unique occurrence key (process zone; CI: UTC, Africa/Lagos, America/New_York)', () => {
    function keyedRow(id: string, extra: Partial<Transaction> = {}): Transaction {
        return {
            id,
            type: TransactionType.EXPENSE,
            amount: 500,
            categoryId: CATEGORY_ID,
            walletId: WALLET_ID,
            date: new Date(2026, 5, 10),
            note: 'Keyed',
            createdAt: new Date(2026, 5, 10, 8, 0),
            ...extra,
        };
    }

    it('unique key: the database refuses a second row for the same rule, schedule version and occurrence', async () => {
        const key = { recurringRuleId: 'rule-x', recurringScheduleVersion: 0, recurringOccurrenceIndex: 3 };
        await sqlInsert(db, transactionMapper, keyedRow('tx-1', key));

        // Matched on the message, not with toThrow: better-sqlite3 registers its
        // error constructor once per process (lib/database.js, isInitialized),
        // so in a jest worker that loaded it for an earlier file the error's
        // prototype belongs to that file's realm, and toThrow does not
        // recognise it as an Error.
        await expect(sqlInsert(db, transactionMapper, keyedRow('tx-2', key))).rejects.toHaveProperty(
            'message',
            expect.stringMatching(/UNIQUE constraint failed/),
        );
        expect(await transactionRepo.getAll()).toHaveLength(1);
    });

    it('control: rows without a recurring key are not constrained by the index', async () => {
        await sqlInsert(db, transactionMapper, keyedRow('tx-1'));
        await sqlInsert(db, transactionMapper, keyedRow('tx-2'));

        expect(await transactionRepo.getAll()).toHaveLength(2);
    });

    it('unique key: the engine treats a key conflict as already generated - no row, no debit, no error, index advanced', async () => {
        pinClock(NOW);
        // Only 10 Jun is due: occurrence 0.
        const rule = await createExpenseRule('Phone', 1000, localNoon(2026, 5, 10), RecurrenceFrequency.MONTHLY);

        // The ledger already holds occurrence 0 of this rule under its key,
        // while the rule's own record still says nothing was generated.
        await sqlInsert(
            db,
            transactionMapper,
            keyedRow('already-there', {
                amount: 1000,
                note: 'Phone',
                recurringRuleId: rule.id,
                recurringScheduleVersion: 0,
                recurringOccurrenceIndex: 0,
            }),
        );
        const before = await balance();

        const result = await processRecurringRules(depsOver(db));

        expect(result.errors).toEqual([]);
        expect(result.transactionsGenerated).toBe(0);
        expect(await rowsOf('Phone')).toHaveLength(1);
        expect(await balance()).toBe(before);
        expect((await recurringRepo.getById(rule.id))!.lastGeneratedIndex).toBe(0);
    });
});

/**
 * A rule edit that changes the schedule must not make things worse than the
 * unfixed engine did in a constant zone. The expectation below IS the unfixed
 * behaviour - new-schedule occurrences strictly after the old watermark's day,
 * up to today - so this is a non-regression control: it cannot fail on the
 * unfixed code by construction. Correcting that behaviour is V-105.
 */
describe('V-98 e. control: schedule edits in a constant zone (process zone; CI: UTC, Africa/Lagos, America/New_York)', () => {
    async function newDatesAfter(description: string, known: Set<string>): Promise<number[]> {
        return (await rowsOf(description))
            .filter((t) => !known.has(t.id))
            .map((t) => t.date.getTime())
            .sort((a, b) => a - b);
    }

    it('control (non-regression): an interval 1 -> 2 edit emits what the unfixed engine emits', async () => {
        pinClock(localNoon(2026, 2, 15).getTime());
        // 10 Jan, 10 Feb, 10 Mar.
        const rule = await createExpenseRule('Club', 1000, localNoon(2026, 0, 10), RecurrenceFrequency.MONTHLY, 1);
        await processRecurringRules(depsOver(db));
        const known = new Set((await rowsOf('Club')).map((t) => t.id));
        expect(known.size).toBe(3);

        await recurringRepo.updateFromDTO({ id: rule.id, interval: 2 });
        pinClock(localNoon(2026, 6, 15).getTime());
        const result = await processRecurringRules(depsOver(db));

        // New schedule: 10 Jan, 10 Mar, 10 May, 10 Jul. After 10 Mar: May, Jul.
        expect(result.errors).toEqual([]);
        expect(await newDatesAfter('Club', known)).toEqual([localDay(2026, 4, 10), localDay(2026, 6, 10)]);
        expect(await balance()).toBe(OPENING_BALANCE - 5 * 1000);
    });

    it('control (non-regression): an interval 2 -> 1 edit emits what the unfixed engine emits', async () => {
        pinClock(localNoon(2026, 2, 15).getTime());
        // 10 Jan, 10 Mar.
        const rule = await createExpenseRule('Gym', 1000, localNoon(2026, 0, 10), RecurrenceFrequency.MONTHLY, 2);
        await processRecurringRules(depsOver(db));
        const known = new Set((await rowsOf('Gym')).map((t) => t.id));
        expect(known.size).toBe(2);

        await recurringRepo.updateFromDTO({ id: rule.id, interval: 1 });
        pinClock(localNoon(2026, 4, 15).getTime());
        const result = await processRecurringRules(depsOver(db));

        // New schedule: every 10th from 10 Jan. After 10 Mar: Apr, May.
        expect(result.errors).toEqual([]);
        expect(await newDatesAfter('Gym', known)).toEqual([localDay(2026, 3, 10), localDay(2026, 4, 10)]);
        expect(await balance()).toBe(OPENING_BALANCE - 4 * 1000);
    });

    it('control (non-regression): a monthly -> weekly edit emits what the unfixed engine emits', async () => {
        pinClock(localNoon(2026, 2, 15).getTime());
        // 10 Jan, 10 Feb, 10 Mar.
        const rule = await createExpenseRule('Lessons', 1000, localNoon(2026, 0, 10), RecurrenceFrequency.MONTHLY, 1);
        await processRecurringRules(depsOver(db));
        const known = new Set((await rowsOf('Lessons')).map((t) => t.id));
        expect(known.size).toBe(3);

        await recurringRepo.updateFromDTO({ id: rule.id, frequency: RecurrenceFrequency.WEEKLY });
        pinClock(localNoon(2026, 2, 31).getTime());
        const result = await processRecurringRules(depsOver(db));

        // New schedule: every 7 days from 10 Jan. After 10 Mar: 14, 21, 28 Mar.
        expect(result.errors).toEqual([]);
        expect(await newDatesAfter('Lessons', known)).toEqual([
            localDay(2026, 2, 14),
            localDay(2026, 2, 21),
            localDay(2026, 2, 28),
        ]);
        expect(await balance()).toBe(OPENING_BALANCE - 6 * 1000);
    });
});

describe('V-98 g. overlapping runs (process zone; CI: UTC, Africa/Lagos, America/New_York)', () => {
    it('overlapping runs: two concurrent engine runs write each occurrence once', async () => {
        pinClock(NOW);
        // 10 Mar, 10 Apr, 10 May, 10 Jun are due.
        await createExpenseRule('Loan', 3000, localNoon(2026, 2, 10), RecurrenceFrequency.MONTHLY);

        const results = await Promise.all([
            processRecurringRules(depsOver(db)),
            processRecurringRules(depsOver(db)),
        ]);

        // Reported, not asserted: which run loses a race is not the contract.
        console.log('[V-98 g] errors:', JSON.stringify(results.map((r) => r.errors)));

        const dates = (await rowsOf('Loan')).map((t) => t.date.getTime()).sort((a, b) => a - b);
        expect(dates).toEqual([
            localDay(2026, 2, 10),
            localDay(2026, 3, 10),
            localDay(2026, 4, 10),
            localDay(2026, 5, 10),
        ]);
        expect(await balance()).toBe(OPENING_BALANCE - 4 * 3000);
    });
});
