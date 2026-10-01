/**
 * V-115: the engine never writes from a copy of a rule that no longer matches
 * the stored row.
 *
 * The engine reads its rules outside any transaction, computes what is due
 * from that copy, then writes one occurrence per transaction. A rule edit or
 * pause can commit in between - the rules screen runs the engine after a
 * create, while the list stays usable. Unchecked, the copy kept writing:
 *
 *  - S1: after a change to a coarser schedule (weekly -> monthly), the copy's
 *    occurrence number, counted in the old numbering, passed the forward-only
 *    guard of the marker write and landed in the new one: every occurrence up
 *    to it was skipped.
 *  - S2: across local midnight, the copy found an occurrence of the old
 *    schedule due the day after the edit, which the edit's catch-up had not
 *    recorded, and wrote it under the old schedule version; the new schedule
 *    then wrote the same day under its own version, debiting it twice.
 *  - a pause made after the read was ignored the same way.
 *
 * How the race is forced: a GatedDatabase holds the engine at its first wallet
 * read, made once the rules have been read and before any transaction is
 * open, so the user's edit or pause runs to completion through the same
 * connection and runner, then the engine is released. S1 holds the engine on
 * the rule itself (its due list is already computed). S2 and the pause case
 * hold it on another rule read before it, so the rule is reached - and its
 * day computed - only after the clock has passed midnight; that relies on
 * getAll returning rules in the order they were created, which each such case
 * asserts first.
 *
 * Zones (register policy no. 9): fixtures use the LOCAL Date constructor and
 * the clock is pinned with pinClock, so the suite holds in whatever zone the
 * process runs in; it is run under TZ=UTC, Africa/Lagos and America/New_York.
 */

import { createTestDb } from '../../../tests/helpers/createTestDb';
import { GatedDatabase } from '../../../tests/helpers/GatedDatabase';
import { pinClock, restoreZoneClock } from '../../../tests/helpers/zoneClock';
import { CategoryType } from '../../domain/entities/Category';
import { RecurrenceFrequency, type RecurringTransaction } from '../../domain/entities/RecurringTransaction';
import { TransactionType } from '../../domain/entities/Transaction';
import { WalletType } from '../../domain/entities/Wallet';
import { CategoryRepository } from '../repositories/CategoryRepository';
import { RecurringTransactionRepository } from '../repositories/RecurringTransactionRepository';
import { TransactionRepository } from '../repositories/TransactionRepository';
import { WalletRepository } from '../repositories/WalletRepository';
import {
    processRecurringRules,
    type RecurringEngineDeps,
    type RecurringEngineResult,
} from '../services/RecurringTransactionEngine';
import { editRecurringRule, pauseRecurringRule } from '../services/recurringRuleChanges';
import type { SqlDatabase } from '../storage/sql/SqlDatabase';

const WALLET_ID = 'w-bank';
const CATEGORY_ID = 'cat-bills';
const OPENING_BALANCE = 10000000;

/** A local wall-clock instant in the process zone. `month` is 1-based. */
function localDate(year: number, month: number, day: number, hours = 12, minutes = 0): Date {
    return new Date(year, month - 1, day, hours, minutes);
}

/** Pin the clock to a local wall-clock instant. `month` is 1-based. */
function pinAt(year: number, month: number, day: number, hours = 12, minutes = 0): void {
    pinClock(localDate(year, month, day, hours, minutes).getTime());
}

const pad = (n: number) => String(n).padStart(2, '0');
const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

let db: SqlDatabase;
let recurringRepo: RecurringTransactionRepository;
let transactionRepo: TransactionRepository;
let walletRepo: WalletRepository;

/** Engine deps over `database`, so a gated decorator can be swapped in. */
function depsOver(
    database: SqlDatabase,
    recurring: RecurringTransactionRepository = new RecurringTransactionRepository(database),
): RecurringEngineDeps {
    return {
        recurringRepo: recurring,
        transactionRepo: new TransactionRepository(database),
        walletRepo: new WalletRepository(database),
        categoryRepo: new CategoryRepository(database),
        eventBus: { emit: jest.fn(), emitMultiple: jest.fn() },
        runInTransaction: database.runInTransaction.bind(database),
    };
}

function createRule(
    description: string,
    amount: number,
    startDate: Date,
    frequency: RecurrenceFrequency,
): Promise<RecurringTransaction> {
    return db.runInTransaction(() => recurringRepo.create({
        type: TransactionType.EXPENSE,
        amount,
        walletId: WALLET_ID,
        categoryId: CATEGORY_ID,
        description,
        startDate,
        frequency,
        interval: 1,
    }));
}

interface Row {
    day: string;
    version?: number;
    index?: number;
}

/** Every ledger row a rule wrote, by day then schedule version; its day is the local day. */
async function rowsOf(ruleId: string): Promise<Row[]> {
    return (await transactionRepo.getAll())
        .filter((t) => t.recurringRuleId === ruleId)
        .sort((a, b) =>
            a.date.getTime() - b.date.getTime() ||
            (a.recurringScheduleVersion ?? 0) - (b.recurringScheduleVersion ?? 0))
        .map((t) => ({ day: ymd(t.date), version: t.recurringScheduleVersion, index: t.recurringOccurrenceIndex }));
}

async function ruleState(id: string) {
    const rule = (await recurringRepo.getById(id))!;
    return { index: rule.lastGeneratedIndex, version: rule.scheduleVersion, paused: rule.isPaused };
}

async function balance(): Promise<number> {
    return (await walletRepo.getById(WALLET_ID))!.balance;
}

/** One engine run with nothing else in flight. */
async function runEngine(): Promise<RecurringEngineResult> {
    const result = await processRecurringRules(depsOver(db));
    expect(result.errors).toEqual([]);
    return result;
}

/**
 * Start an engine run and hold it at its first wallet read: the rules are
 * read, the first rule with something due has its due list computed, and no
 * transaction is open. Returns a function that releases the run and resolves
 * with its result.
 */
async function holdEngineAtFirstWalletRead(): Promise<() => Promise<RecurringEngineResult>> {
    const gated = new GatedDatabase(db, /^\s*SELECT \* FROM wallets WHERE id/i);
    const run = processRecurringRules(depsOver(gated));
    await gated.reached;
    return () => {
        gated.release();
        return run;
    };
}

/**
 * Lead, monthly from 14 Oct, created first and so read and processed first;
 * then Rent, monthly from 15 Jan, generated on 20 Sep up to 15 Sep
 * (occurrences 0 to 8).
 */
async function seedLeadAndRent() {
    pinAt(2026, 9, 20);
    const lead = await createRule('Lead', 300, localDate(2026, 10, 14), RecurrenceFrequency.MONTHLY);
    const rent = await createRule('Rent', 1000, localDate(2026, 1, 15), RecurrenceFrequency.MONTHLY);
    await runEngine();
    expect(await ruleState(rent.id)).toEqual({ index: 8, version: 0, paused: false });

    // The engine processes rules in the order getAll returns them. The cases
    // below hold it on Lead so that Rent is reached after midnight.
    expect((await recurringRepo.getActiveRules()).map((r) => r.id)).toEqual([lead.id, rent.id]);
    return { lead, rent };
}

/** A repository whose stored rule never matches what was read before: each read returns another amount. */
class EverChangingRecurringRepository extends RecurringTransactionRepository {
    private reads = 0;

    async getById(id: string): Promise<RecurringTransaction | null> {
        const rule = await super.getById(id);
        this.reads++;
        return rule && { ...rule, amount: rule.amount + this.reads };
    }
}

beforeEach(async () => {
    db = await createTestDb({ writeGuard: true });
    recurringRepo = new RecurringTransactionRepository(db);
    transactionRepo = new TransactionRepository(db);
    walletRepo = new WalletRepository(db);

    // A bank wallet: the funds guard covers cash and mobile only, and this
    // suite is about what is written, not about pricing.
    await db.runInTransaction(() => walletRepo.save({
        id: WALLET_ID,
        name: 'Main',
        balance: OPENING_BALANCE,
        type: WalletType.BANK,
        createdAt: new Date(2025, 0, 1),
    }));
    await db.runInTransaction(() => new CategoryRepository(db).save({
        id: CATEGORY_ID,
        name: 'Bills',
        type: CategoryType.EXPENSE,
    }));
});

afterEach(() => {
    restoreZoneClock();
});

describe('V-115 a rule changed after the engine read it (process zone; run under TZ=UTC, Africa/Lagos, America/New_York)', () => {
    it('a. S1: weekly -> monthly edit saved on 20 Sep while the engine holds a copy read before it: the old-numbering index does not land, and 15 Oct is generated once as (rule, 1, 9)', async () => {
        pinAt(2026, 9, 10);
        // Thursdays from 15 Jan; 15 Jan to 10 Sep are occurrences 0 to 34.
        const rule = await createRule('Club', 1000, localDate(2026, 1, 15), RecurrenceFrequency.WEEKLY);
        await runEngine();
        expect(await ruleState(rule.id)).toEqual({ index: 34, version: 0, paused: false });

        pinAt(2026, 9, 20);
        // Held on this rule, 17 Sep (occurrence 35) due in its copy.
        const release = await holdEngineAtFirstWalletRead();
        // Meanwhile the edit records 17 Sep, then saves the rule monthly:
        // version 1, last occurrence on or before 20 Sep is 15 Sep, number 8.
        await editRecurringRule(depsOver(db), { id: rule.id, frequency: RecurrenceFrequency.MONTHLY }, localDate(2026, 9, 20));
        expect(await ruleState(rule.id)).toEqual({ index: 8, version: 1, paused: false });

        const released = await release();

        expect(released.errors).toEqual([]);
        expect(await ruleState(rule.id)).toEqual({ index: 8, version: 1, paused: false });
        expect((await rowsOf(rule.id)).filter((r) => r.day === '2026-09-17')).toEqual([
            { day: '2026-09-17', version: 0, index: 35 },
        ]);

        pinAt(2026, 10, 20);
        await runEngine();
        expect((await rowsOf(rule.id)).filter((r) => r.version === 1)).toEqual([
            { day: '2026-10-15', version: 1, index: 9 },
        ]);
    });

    it('b. S2: monthly -> weekly edit saved at 23:59 on 14 Oct while the engine holds a copy, the engine reaching the rule after midnight: 15 Oct is debited once, and no old-version row is dated after 14 Oct', async () => {
        const { rent } = await seedLeadAndRent();
        const before = await balance();

        pinAt(2026, 10, 14, 23, 59);
        // Held on Lead (14 Oct due). Rent is read: monthly, version 0, number 8.
        const release = await holdEngineAtFirstWalletRead();
        // Nothing of Rent is due on 14 Oct, so the edit saves at once: weekly,
        // version 1, last Thursday on or before 14 Oct is 8 Oct, number 38.
        await editRecurringRule(depsOver(db), { id: rent.id, frequency: RecurrenceFrequency.WEEKLY }, localDate(2026, 10, 14, 23, 59));
        expect(await ruleState(rent.id)).toEqual({ index: 38, version: 1, paused: false });

        pinAt(2026, 10, 15, 0, 1);
        const released = await release();
        pinAt(2026, 10, 15, 12);
        await runEngine();

        expect(released.errors).toEqual([]);
        const rows = await rowsOf(rent.id);
        expect(rows.filter((r) => r.day === '2026-10-15')).toEqual([{ day: '2026-10-15', version: 1, index: 39 }]);
        expect(rows.filter((r) => r.version === 0 && r.day > '2026-10-14')).toEqual([]);
        // Lead's 14 Oct and Rent's 15 Oct, each once.
        expect(await balance()).toBe(before - 300 - 1000);
    });

    it('c. a rule paused at 23:59 on 14 Oct while the engine holds a copy read before the pause, the engine reaching it after midnight: nothing is generated for it', async () => {
        const { rent } = await seedLeadAndRent();
        const before = await balance();

        pinAt(2026, 10, 14, 23, 59);
        const release = await holdEngineAtFirstWalletRead();
        // Nothing of Rent is due on 14 Oct: the pause records nothing and applies.
        await pauseRecurringRule(depsOver(db), rent.id, localDate(2026, 10, 14, 23, 59));
        expect(await ruleState(rent.id)).toEqual({ index: 8, version: 0, paused: true });

        pinAt(2026, 10, 15, 0, 1);
        const released = await release();

        expect(released.errors).toEqual([]);
        expect((await rowsOf(rent.id)).filter((r) => r.day > '2026-10-14')).toEqual([]);
        expect(await ruleState(rent.id)).toEqual({ index: 8, version: 0, paused: true });
        // Lead's 14 Oct only.
        expect(await balance()).toBe(before - 300);
    });

    it('bound: a rule found changed at every occurrence is processed again at most 3 times, then left to the next run and reported in errors; nothing is written from a copy that does not match', async () => {
        pinAt(2026, 9, 20);
        // 1, 8 and 15 Sep are due.
        const rule = await createRule('Gym', 1000, localDate(2026, 9, 1), RecurrenceFrequency.WEEKLY);

        const result = await processRecurringRules(depsOver(db, new EverChangingRecurringRepository(db)));

        expect(result.errors).toEqual([
            { ruleId: rule.id, error: expect.stringMatching(/changed while it was being processed/) },
        ]);
        expect(await rowsOf(rule.id)).toEqual([]);
        expect(await ruleState(rule.id)).toEqual({ index: -1, version: 0, paused: false });
        expect(await balance()).toBe(OPENING_BALANCE);

        // The next run, with nothing changing, generates them.
        await runEngine();
        expect((await rowsOf(rule.id)).map((r) => r.day)).toEqual(['2026-09-01', '2026-09-08', '2026-09-15']);
    });
});

describe('V-115 controls (process zone; run under TZ=UTC, Africa/Lagos, America/New_York)', () => {
    it('control: S1 with monthly -> weekly, saved on 20 Sep while the engine holds a copy: the index stays 35 under version 1, 15 Sep is written once, then 24 Sep and 1 Oct', async () => {
        pinAt(2026, 8, 20);
        // 15 Jan to 15 Aug: occurrences 0 to 7.
        const rule = await createRule('Rent', 1000, localDate(2026, 1, 15), RecurrenceFrequency.MONTHLY);
        await runEngine();

        pinAt(2026, 9, 20);
        // Held on this rule, 15 Sep (occurrence 8) due in its copy.
        const release = await holdEngineAtFirstWalletRead();
        await editRecurringRule(depsOver(db), { id: rule.id, frequency: RecurrenceFrequency.WEEKLY }, localDate(2026, 9, 20));
        const released = await release();

        expect(released.errors).toEqual([]);
        // Last Thursday on or before 20 Sep is 17 Sep, number 35.
        expect(await ruleState(rule.id)).toEqual({ index: 35, version: 1, paused: false });
        expect((await rowsOf(rule.id)).filter((r) => r.day === '2026-09-15')).toEqual([
            { day: '2026-09-15', version: 0, index: 8 },
        ]);

        pinAt(2026, 10, 1);
        await runEngine();
        expect((await rowsOf(rule.id)).filter((r) => r.version === 1)).toEqual([
            { day: '2026-09-24', version: 1, index: 36 },
            { day: '2026-10-01', version: 1, index: 37 },
        ]);
        expect(await balance()).toBe(OPENING_BALANCE - 11 * 1000);
    });

    it('control: a run with no concurrent change generates every due occurrence once, and a second run writes nothing', async () => {
        pinAt(2026, 9, 20);
        const rule = await createRule('Club', 1000, localDate(2026, 1, 15), RecurrenceFrequency.WEEKLY);

        const first = await runEngine();

        expect(first.transactionsGenerated).toBe(36);
        const rows = await rowsOf(rule.id);
        expect(rows).toHaveLength(36);
        expect(rows[0]).toEqual({ day: '2026-01-15', version: 0, index: 0 });
        expect(rows[35]).toEqual({ day: '2026-09-17', version: 0, index: 35 });
        expect(await ruleState(rule.id)).toEqual({ index: 35, version: 0, paused: false });
        expect(await balance()).toBe(OPENING_BALANCE - 36 * 1000);

        const second = await runEngine();
        expect(second.transactionsGenerated).toBe(0);
        expect(await rowsOf(rule.id)).toHaveLength(36);
        expect(await balance()).toBe(OPENING_BALANCE - 36 * 1000);
    });

    it('control: two overlapping runs over a daily rule with 20 occurrences due write each date once, with no error from either run', async () => {
        pinAt(2026, 9, 20);
        // 1 to 20 Sep are due: more than the restart bound.
        const rule = await createRule('Transit', 200, localDate(2026, 9, 1), RecurrenceFrequency.DAILY);

        const results = await Promise.all([
            processRecurringRules(depsOver(db)),
            processRecurringRules(depsOver(db)),
        ]);

        expect(results.map((r) => r.errors)).toEqual([[], []]);
        expect(results[0].transactionsGenerated + results[1].transactionsGenerated).toBe(20);
        const days = (await rowsOf(rule.id)).map((r) => r.day);
        expect(days).toHaveLength(20);
        expect(new Set(days).size).toBe(20);
        expect(days[0]).toBe('2026-09-01');
        expect(days[19]).toBe('2026-09-20');
        expect(await balance()).toBe(OPENING_BALANCE - 20 * 200);
    });

    it('control: a rule paused on 20 Sep while the engine holds a copy with 15 Sep due: the pause records 15 Sep first, and the released engine writes nothing more', async () => {
        pinAt(2026, 8, 20);
        // 15 Jan to 15 Aug: occurrences 0 to 7.
        const rule = await createRule('Rent', 1000, localDate(2026, 1, 15), RecurrenceFrequency.MONTHLY);
        await runEngine();

        pinAt(2026, 9, 20);
        const release = await holdEngineAtFirstWalletRead();
        const outcome = await pauseRecurringRule(depsOver(db), rule.id, localDate(2026, 9, 20));
        expect(outcome.unrecorded).toEqual([]);
        const released = await release();

        expect(released.errors).toEqual([]);
        expect((await rowsOf(rule.id)).filter((r) => r.day === '2026-09-15')).toEqual([
            { day: '2026-09-15', version: 0, index: 8 },
        ]);
        expect(await ruleState(rule.id)).toEqual({ index: 8, version: 0, paused: true });
        expect(await balance()).toBe(OPENING_BALANCE - 9 * 1000);
    });
});
