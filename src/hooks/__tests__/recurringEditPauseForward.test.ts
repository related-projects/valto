/**
 * V-105: a rule edit or a pause acts at a point in time and never rewrites
 * what was due before it (REGISTRE V-105, Owner decisions 1 to 6 and 8 of 01/10).
 *
 *  - Edit of an active rule: what is due under the stored rule is generated
 *    first, with the old values; then the edit is saved, and the new state
 *    generates nothing on or before the day of the edit. A funds refusal of
 *    that catch-up refuses the edit.
 *  - Pause: what is due is generated first; a refused catch-up still pauses,
 *    and the unrecorded debits are returned so the screen can name them.
 *  - While paused nothing is due; an edit is saved and catches up nothing.
 *  - Resume generates nothing from the paused period: the next debit is the
 *    first schedule date on or after the day of the resume.
 *  - A missing wallet or category: an edit that keeps the schedule is saved
 *    and keeps the pending occurrences due; one that changes the frequency or
 *    the interval is refused.
 *
 * Every case drives useRecurringRules, the hook the rules screen calls, over a
 * real SQLite database; the engine is run the way the app runs it at launch.
 *
 * Zones (register policy no. 9): fixtures use the LOCAL Date constructor and
 * the clock is pinned with pinClock, so the suite holds in whatever zone the
 * process runs in; it is run under TZ=UTC, Africa/Lagos and America/New_York.
 * A zone change is simulated in the stored data, as in
 * recurringOccurrenceKey.test.ts: every instant the engine wrote as a local
 * midnight is moved as if a zone N hours east (or west) of the process zone
 * had written it. installZoneClock cannot be used here: it moves the local
 * getters only, and startOfDay calls a local setter.
 */

import { act, renderHook, waitFor } from '@testing-library/react-native';
import { createTestDb } from '../../../tests/helpers/createTestDb';
import { pinClock, restoreZoneClock } from '../../../tests/helpers/zoneClock';
import { CategoryRepository } from '../../data/repositories/CategoryRepository';
import { RecurringTransactionRepository } from '../../data/repositories/RecurringTransactionRepository';
import { TransactionRepository } from '../../data/repositories/TransactionRepository';
import { WalletRepository } from '../../data/repositories/WalletRepository';
import { processRecurringRules } from '../../data/services/RecurringTransactionEngine';
import type { SqlDatabase } from '../../data/storage/sql/SqlDatabase';
import { CategoryType } from '../../domain/entities/Category';
import { RecurrenceFrequency } from '../../domain/entities/RecurringTransaction';
import { TransactionType } from '../../domain/entities/Transaction';
import { WalletType } from '../../domain/entities/Wallet';
import {
    RecurringCatchUpRefusedError,
    RecurringRuleReferenceMissingError,
} from '../../domain/useCases/errors';
// jest.mock below is hoisted above every import, so the hook sees the mocks.
import { useRecurringRules } from '../useRecurringRules';

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
        runInTransaction: (work: () => Promise<unknown>) => mockDb.runInTransaction(work),
        transactionRepo: mockTransactionRepo,
        walletRepo: mockWalletRepo,
        categoryRepo: mockCategoryRepo,
        recurringRepo: mockRecurringRepo,
        eventBus: { emit: jest.fn(), emitMultiple: jest.fn() },
    }),
}));

jest.mock('../../core/events/dataEvents', () => ({
    dataEvents: {
        subscribe: () => () => undefined,
        emit: jest.fn(),
        emitMultiple: jest.fn(),
    },
}));

const BANK = 'w-bank';
const CASH = 'w-cash';
const OTHER = 'w-other';
const CATEGORY = 'cat-bills';
const NOTE = 'Rent';
const HOUR_MS = 60 * 60 * 1000;

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

interface Row {
    id: string;
    day: string;
    amount: number;
    walletId: string;
    version?: number;
    index?: number;
}

/** Every row the rule wrote, oldest first; its day is the local day in the process zone. */
async function ledger(): Promise<Row[]> {
    return (await mockTransactionRepo.getAll())
        .filter((t) => t.note === NOTE)
        .sort((a, b) => a.date.getTime() - b.date.getTime())
        .map((t) => ({
            id: t.id,
            day: ymd(t.date),
            amount: t.amount,
            walletId: t.walletId,
            version: t.recurringScheduleVersion,
            index: t.recurringOccurrenceIndex,
        }));
}

/** The rows written since `before` was read. */
async function addedSince(before: Row[]): Promise<Row[]> {
    const known = new Set(before.map((r) => r.id));
    return (await ledger()).filter((r) => !known.has(r.id));
}

function engineDeps() {
    return {
        recurringRepo: mockRecurringRepo,
        transactionRepo: mockTransactionRepo,
        walletRepo: mockWalletRepo,
        categoryRepo: mockCategoryRepo,
        eventBus: { emit: jest.fn(), emitMultiple: jest.fn() },
        runInTransaction: mockDb.runInTransaction.bind(mockDb),
    };
}

/** One engine run, as at launch. */
async function runEngine() {
    const result = await processRecurringRules(engineDeps());
    expect(result.errors).toEqual([]);
    return result;
}

/**
 * The fixture: a monthly expense of 1000 from 15 Jan 2026 12:00, generated on
 * 20 Sep up to 15 Sep (occurrences 0 to 8).
 */
async function seedRent(walletId = BANK, interval = 1): Promise<string> {
    pinAt(2026, 9, 20);
    const rule = await mockRecurringRepo.create({
        type: TransactionType.EXPENSE,
        amount: 1000,
        walletId,
        categoryId: CATEGORY,
        description: NOTE,
        startDate: localDate(2026, 1, 15),
        frequency: RecurrenceFrequency.MONTHLY,
        interval,
    });
    await runEngine();
    return rule.id;
}

/**
 * Rewrite every instant the engine wrote as a local midnight - the rules'
 * watermark and the occurrences' dates - as if a zone `hoursEast` east of the
 * process zone had written it (negative: west). Its midnight is that many
 * hours earlier in UTC.
 */
async function simulateWriterZone(hoursEast: number): Promise<void> {
    const shift = (iso: unknown) => new Date(new Date(String(iso)).getTime() - hoursEast * HOUR_MS).toISOString();
    const { rows: rules } = await mockDb.execute('SELECT id, last_generated_date FROM recurring_rules');
    for (const r of rules) {
        await mockDb.execute('UPDATE recurring_rules SET last_generated_date = ? WHERE id = ?', [
            shift(r.last_generated_date),
            r.id,
        ]);
    }
    const { rows: txs } = await mockDb.execute('SELECT id, date FROM transactions');
    for (const t of txs) {
        await mockDb.execute('UPDATE transactions SET date = ? WHERE id = ?', [shift(t.date), t.id]);
    }
}

/** A wallet gone without passing the deletion guard, as a v1 restore leaves it. */
async function orphanWallet(walletId: string): Promise<void> {
    await mockDb.execute('DELETE FROM wallets WHERE id = ?', [walletId]);
}

async function mountHook() {
    const view = renderHook(() => useRecurringRules());
    await waitFor(() => {
        expect(view.result.current.loading).toBe(false);
    });
    return view.result;
}

type HookResult = Awaited<ReturnType<typeof mountHook>>;

async function editRule(result: HookResult, dto: Parameters<HookResult['current']['updateRule']>[0]) {
    let outcome: unknown;
    await act(async () => {
        outcome = await result.current.updateRule(dto).catch((error: unknown) => error);
    });
    return outcome;
}

async function pauseRule(result: HookResult, id: string) {
    let outcome: unknown;
    await act(async () => {
        outcome = await result.current.pauseRule(id);
    });
    return outcome as { unrecorded?: Date[] } | undefined;
}

async function resumeRule(result: HookResult, id: string) {
    await act(async () => {
        await result.current.resumeRule(id);
    });
}

const days = (rows: Row[]) => rows.map((r) => r.day);

beforeEach(async () => {
    mockDb = await createTestDb();
    mockRecurringRepo = new RecurringTransactionRepository(mockDb);
    mockWalletRepo = new WalletRepository(mockDb);
    mockCategoryRepo = new CategoryRepository(mockDb);
    mockTransactionRepo = new TransactionRepository(mockDb);

    await mockWalletRepo.save({ id: BANK, name: 'Bank', balance: 10000000, type: WalletType.BANK, createdAt: new Date(2025, 0, 1) });
    // Cash is guarded by the funds check; 9500 covers the nine occurrences up
    // to 15 Sep and leaves 500, short of the 1000 due on 15 Oct.
    await mockWalletRepo.save({ id: CASH, name: 'Cash', balance: 9500, type: WalletType.CASH, createdAt: new Date(2025, 0, 1) });
    await mockWalletRepo.save({ id: OTHER, name: 'Other', balance: 10000000, type: WalletType.BANK, createdAt: new Date(2025, 0, 1) });
    await mockCategoryRepo.save({ id: CATEGORY, name: 'Bills', type: CategoryType.EXPENSE });
});

afterEach(() => {
    restoreZoneClock();
});

describe('V-105 edit after a zone change (process zone; run under TZ=UTC, Africa/Lagos, America/New_York)', () => {
    it('a1. writer zone 5 h east (Lagos -> Toronto shape), interval 1 -> 2 edit on 1 Oct: 15 Sep is debited once', async () => {
        const id = await seedRent();
        await simulateWriterZone(5);
        const before = await ledger();

        pinAt(2026, 10, 1);
        const result = await mountHook();
        await editRule(result, { id, interval: 2 });
        await runEngine();
        pinAt(2026, 12, 1);
        await runEngine();

        const added = await addedSince(before);
        expect(added.map((r) => [r.day, r.version])).toEqual([['2026-11-15', 1]]);
    });

    it('a2. writer zone 5 h east (Lagos -> Toronto shape), monthly -> daily edit on 1 Oct: 15 Sep is debited once, nothing new on or before 1 Oct', async () => {
        const id = await seedRent();
        await simulateWriterZone(5);
        const before = await ledger();

        pinAt(2026, 10, 1);
        const result = await mountHook();
        await editRule(result, { id, frequency: RecurrenceFrequency.DAILY });
        await runEngine();
        pinAt(2026, 10, 5);
        await runEngine();

        const added = await addedSince(before);
        expect(days(added)).toEqual(['2026-10-02', '2026-10-03', '2026-10-04', '2026-10-05']);
    });

    it('a3. writer zone 5 h west, rule started 21:00 writer time (21:00-start Toronto -> Lagos shape), interval 1 -> 2 edit: the September due date is debited once', async () => {
        const id = await seedRent();
        await simulateWriterZone(-5);
        // Created at 21:00 on 15 Jan in the writer zone: 02:00 on 16 Jan here,
        // so the process zone reads the rule as anchored on the 16th.
        const writerStart = new Date(localDate(2026, 1, 15, 21, 0).getTime() + 5 * HOUR_MS);
        await mockDb.execute('UPDATE recurring_rules SET start_date = ? WHERE id = ?', [writerStart.toISOString(), id]);
        const before = await ledger();

        pinAt(2026, 10, 1);
        const result = await mountHook();
        await editRule(result, { id, interval: 2 });
        await runEngine();
        pinAt(2026, 12, 1);
        await runEngine();

        const added = await addedSince(before);
        expect(added.map((r) => [r.day, r.version])).toEqual([['2026-11-16', 1]]);
    });

    it('a4. writer zone 5 h east, edit made 30 minutes after the writer generated 15 Sep, while the process zone is still on 14 Sep: 15 Sep is debited once', async () => {
        const id = await seedRent();
        // The writer's 15 Sep midnight is 19:00 on 14 Sep here.
        await simulateWriterZone(5);
        const before = await ledger();

        pinAt(2026, 9, 14, 20, 0);
        const result = await mountHook();
        await editRule(result, { id, frequency: RecurrenceFrequency.DAILY });
        await runEngine();
        pinAt(2026, 9, 16);
        await runEngine();

        const added = await addedSince(before);
        expect(days(added)).toEqual(['2026-09-16']);
    });
});

describe('V-105 edit with a backlog (process zone; run under TZ=UTC, Africa/Lagos, America/New_York)', () => {
    it('b1. 15 Oct due and not generated on 20 Oct, interval 1 -> 2 edit: 15 Oct is generated once, with the old rule', async () => {
        const id = await seedRent();
        const before = await ledger();

        pinAt(2026, 10, 20);
        const result = await mountHook();
        await editRule(result, { id, interval: 2 });
        await runEngine();
        pinAt(2026, 12, 1);
        await runEngine();

        const added = await addedSince(before);
        expect(added.map((r) => [r.day, r.amount, r.version, r.index])).toEqual([
            ['2026-10-15', 1000, 0, 9],
            ['2026-11-15', 1000, 1, 5],
        ]);
    });

    it('b2. 15 Oct due and not generated on 20 Oct, monthly -> yearly edit: 15 Oct is generated once, with the old rule', async () => {
        const id = await seedRent();
        const before = await ledger();

        pinAt(2026, 10, 20);
        const result = await mountHook();
        await editRule(result, { id, frequency: RecurrenceFrequency.YEARLY });
        await runEngine();
        pinAt(2027, 1, 20);
        await runEngine();

        const added = await addedSince(before);
        expect(added.map((r) => [r.day, r.version, r.index])).toEqual([
            ['2026-10-15', 0, 9],
            ['2027-01-15', 1, 1],
        ]);
    });

    it('c. 15 Oct due and not generated on 20 Oct, amount-only edit: 15 Oct at the old amount, the next one at the new amount', async () => {
        const id = await seedRent();
        const before = await ledger();

        pinAt(2026, 10, 20);
        const result = await mountHook();
        await editRule(result, { id, amount: 2500 });
        await runEngine();
        pinAt(2026, 11, 20);
        await runEngine();

        const added = await addedSince(before);
        expect(added.map((r) => [r.day, r.amount])).toEqual([
            ['2026-10-15', 1000],
            ['2026-11-15', 2500],
        ]);
    });

    it('d. endDate set on 20 Oct to 16 Oct while 15 Oct is pending: 15 Oct is generated', async () => {
        const id = await seedRent();
        const before = await ledger();

        pinAt(2026, 10, 20);
        const result = await mountHook();
        await editRule(result, { id, endDate: localDate(2026, 10, 16) });
        await runEngine();
        pinAt(2026, 11, 20);
        await runEngine();

        const added = await addedSince(before);
        expect(days(added)).toEqual(['2026-10-15']);
    });
});

describe('V-105 edit applies going forward (process zone; run under TZ=UTC, Africa/Lagos, America/New_York)', () => {
    it('e. monthly -> weekly edit saved on 20 Sep: no new-version row on or before 20 Sep, the first is the first weekly date after it', async () => {
        const id = await seedRent();
        const before = await ledger();

        const result = await mountHook();
        await editRule(result, { id, frequency: RecurrenceFrequency.WEEKLY });
        pinAt(2026, 10, 20);
        await runEngine();

        // 15 Jan 2026 is a Thursday: the weekly dates after 20 Sep are 24 Sep, 1, 8, 15 Oct.
        const added = await addedSince(before);
        expect(added.map((r) => [r.day, r.version])).toEqual([
            ['2026-09-24', 1],
            ['2026-10-01', 1],
            ['2026-10-08', 1],
            ['2026-10-15', 1],
        ]);
    });

    it('f. a funds refusal of the pre-edit catch-up refuses the edit: the rule is unchanged in storage and nothing is generated', async () => {
        const id = await seedRent(CASH);
        pinAt(2026, 10, 20);
        const stored = await mockRecurringRepo.getById(id);
        const before = await ledger();

        const result = await mountHook();
        const outcome = await editRule(result, { id, interval: 2 });

        expect(outcome).toBeInstanceOf(RecurringCatchUpRefusedError);
        const refusal = outcome as RecurringCatchUpRefusedError;
        expect(refusal.dueDates.map(ymd)).toEqual(['2026-10-15']);
        expect(refusal.totalCost).toBe(1000);
        expect(refusal.availableBalance).toBe(500);
        expect(await mockRecurringRepo.getById(id)).toEqual(stored);
        expect(await addedSince(before)).toEqual([]);
    });

    it('control: an amount edit with nothing pending applies from the next occurrence', async () => {
        const id = await seedRent();
        const before = await ledger();

        const result = await mountHook();
        await editRule(result, { id, amount: 2500 });
        pinAt(2026, 10, 20);
        await runEngine();

        const added = await addedSince(before);
        expect(added.map((r) => [r.day, r.amount, r.version])).toEqual([['2026-10-15', 2500, 0]]);
    });

    it('control: an interval 2 -> 1 edit with nothing pending continues on the next monthly date', async () => {
        // 15 Jan, 15 Mar, 15 May, 15 Jul, 15 Sep generated.
        const id = await seedRent(BANK, 2);
        const before = await ledger();

        const result = await mountHook();
        await editRule(result, { id, interval: 1 });
        pinAt(2026, 10, 20);
        await runEngine();

        const added = await addedSince(before);
        expect(added.map((r) => [r.day, r.version, r.index])).toEqual([['2026-10-15', 1, 9]]);
    });
});

describe('V-105 pause and resume (process zone; run under TZ=UTC, Africa/Lagos, America/New_York)', () => {
    it('g. paused on 20 Sep, resumed on 20 Nov: nothing from the paused period, the next debit is 15 Dec', async () => {
        const id = await seedRent();
        const before = await ledger();

        const result = await mountHook();
        await pauseRule(result, id);
        pinAt(2026, 11, 20);
        const indexBefore = (await mockRecurringRepo.getById(id))!.lastGeneratedIndex!;
        await resumeRule(result, id);
        expect((await mockRecurringRepo.getById(id))!.lastGeneratedIndex!).toBeGreaterThanOrEqual(indexBefore);
        await runEngine();
        expect(await addedSince(before)).toEqual([]);

        pinAt(2026, 12, 20);
        await runEngine();
        expect(days(await addedSince(before))).toEqual(['2026-12-15']);
    });

    it('h. paused on 20 Sep, resumed on its due day 15 Nov: 15 Nov is due, once', async () => {
        const id = await seedRent();
        const before = await ledger();

        const result = await mountHook();
        await pauseRule(result, id);
        pinAt(2026, 11, 15);
        await resumeRule(result, id);
        await runEngine();
        await runEngine();

        expect(days(await addedSince(before))).toEqual(['2026-11-15']);
    });

    it('i. paused on 20 Oct with 15 Oct pending: 15 Oct is generated before the pause', async () => {
        const id = await seedRent();
        const before = await ledger();

        pinAt(2026, 10, 20);
        const result = await mountHook();
        const outcome = await pauseRule(result, id);

        expect((await mockRecurringRepo.getById(id))!.isPaused).toBe(true);
        expect((await addedSince(before)).map((r) => [r.day, r.amount, r.version])).toEqual([['2026-10-15', 1000, 0]]);
        expect(outcome?.unrecorded).toEqual([]);
    });

    it('j. paused on 20 Oct with 15 Oct pending and the funds guard refusing: the rule is paused, 15 Oct is not generated and is returned as unrecorded', async () => {
        const id = await seedRent(CASH);
        const before = await ledger();

        pinAt(2026, 10, 20);
        const result = await mountHook();
        const outcome = await pauseRule(result, id);

        expect((await mockRecurringRepo.getById(id))!.isPaused).toBe(true);
        expect(await addedSince(before)).toEqual([]);
        expect(outcome?.unrecorded?.map(ymd)).toEqual(['2026-10-15']);
    });

    it('k. paused on 20 Sep, edited (interval 1 -> 2) on 10 Oct, resumed on 20 Nov: nothing from the paused period, the next is the first new-schedule date on or after 20 Nov', async () => {
        const id = await seedRent();
        const before = await ledger();

        const result = await mountHook();
        await pauseRule(result, id);
        pinAt(2026, 10, 10);
        await editRule(result, { id, interval: 2 });
        pinAt(2026, 11, 20);
        await resumeRule(result, id);
        await runEngine();
        expect(await addedSince(before)).toEqual([]);

        // Every other month from 15 Jan: 15 Nov is before the resume, 15 Jan 2027 is next.
        pinAt(2027, 1, 20);
        await runEngine();
        expect((await addedSince(before)).map((r) => [r.day, r.version])).toEqual([['2027-01-15', 1]]);
    });

    it('control: l. paused and resumed on 15 Oct after 15 Oct was generated: it is not generated again', async () => {
        const id = await seedRent();
        pinAt(2026, 10, 15);
        await runEngine();
        const before = await ledger();
        expect(before.filter((r) => r.day === '2026-10-15')).toHaveLength(1);

        const result = await mountHook();
        await pauseRule(result, id);
        await resumeRule(result, id);
        await runEngine();

        expect(await addedSince(before)).toEqual([]);
    });

    it('control: a paused rule edited twice on its due day (1 -> 2 -> 1) and resumed that day debits that day once', async () => {
        const id = await seedRent();
        pinAt(2026, 10, 15);
        await runEngine();
        const before = await ledger();

        const result = await mountHook();
        await pauseRule(result, id);
        await editRule(result, { id, interval: 2 });
        await editRule(result, { id, interval: 1 });
        await resumeRule(result, id);
        await runEngine();
        expect(await addedSince(before)).toEqual([]);

        pinAt(2026, 11, 20);
        await runEngine();
        expect(days(await addedSince(before))).toEqual(['2026-11-15']);
    });

    it('policy no. 10 exception (REGISTRE V-105, Owner decision 6): a rule paused before 1.1.3 is resumed without catching up its paused period', async () => {
        const id = await seedRent();
        const before = await ledger();
        // The pause as 1.1.2 wrote it: the flag only, nothing caught up.
        await mockRecurringRepo.pauseRule(id);

        pinAt(2026, 11, 20);
        const result = await mountHook();
        await resumeRule(result, id);
        await runEngine();
        expect(await addedSince(before)).toEqual([]);

        pinAt(2026, 12, 20);
        await runEngine();
        expect(days(await addedSince(before))).toEqual(['2026-12-15']);
    });
});

describe('V-105 missing wallet (REGISTRE V-105, Owner decision 8; process zone; run under TZ=UTC, Africa/Lagos, America/New_York)', () => {
    it('o. decision 8 guard: an edit that repoints the wallet AND changes the interval is refused and names the missing wallet; the rule is unchanged', async () => {
        const id = await seedRent();
        pinAt(2026, 10, 20);
        await orphanWallet(BANK);
        const stored = await mockRecurringRepo.getById(id);
        const before = await ledger();

        const result = await mountHook();
        const outcome = await editRule(result, { id, walletId: OTHER, interval: 2 });

        expect(outcome).toBeInstanceOf(RecurringRuleReferenceMissingError);
        expect((outcome as RecurringRuleReferenceMissingError).missing).toEqual(['wallet']);
        expect(await mockRecurringRepo.getById(id)).toEqual(stored);
        expect(await addedSince(before)).toEqual([]);
    });

    it('control: decision 8, an edit that keeps the schedule is saved without a catch-up, the pending 15 Oct stays due and the next run debits the repaired wallet', async () => {
        const id = await seedRent();
        pinAt(2026, 10, 20);
        await orphanWallet(BANK);
        const stored = (await mockRecurringRepo.getById(id))!;
        const before = await ledger();

        const result = await mountHook();
        await editRule(result, { id, walletId: OTHER });

        const saved = (await mockRecurringRepo.getById(id))!;
        expect(saved.walletId).toBe(OTHER);
        expect(saved.scheduleVersion).toBe(stored.scheduleVersion);
        expect(saved.lastGeneratedIndex).toBe(stored.lastGeneratedIndex);
        expect(await addedSince(before)).toEqual([]);

        await runEngine();
        expect((await addedSince(before)).map((r) => [r.day, r.walletId, r.amount])).toEqual([['2026-10-15', OTHER, 1000]]);
    });

    it('q. paused on 20 Oct with 15 Oct pending and the wallet missing: the rule is paused and 15 Oct is returned as unrecorded', async () => {
        const id = await seedRent();
        pinAt(2026, 10, 20);
        await orphanWallet(BANK);
        const before = await ledger();

        const result = await mountHook();
        const outcome = await pauseRule(result, id);

        expect((await mockRecurringRepo.getById(id))!.isPaused).toBe(true);
        expect(await addedSince(before)).toEqual([]);
        expect(outcome?.unrecorded?.map(ymd)).toEqual(['2026-10-15']);
    });
});
