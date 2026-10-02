/**
 * V-103: the end day a user chose is kept across a zone change, for every
 * schedule edit (REGISTRE V-103, Owner decision D11, pass 75).
 *
 * The end is the number of the rule's last occurrence; a schedule change
 * renumbers strictly after the edit day (V-105), so the number is found again
 * in the new numbering. It is found from the calendar day the user chose,
 * stored with the rule, never from the end instant read in the zone the
 * device has moved to. recurringEndScheduleEditZone.test.ts covers a
 * frequency edit after a move west with an end just after midnight; this file
 * covers a move east with an end late in the evening, an interval-only edit,
 * and an end the user chooses again after the move.
 *
 * Every case drives the hook the rules screen calls, and the engine the way
 * the app runs it at launch, over a real SQLite database with the write guard
 * armed.
 *
 * Zones (register policy no. 9): fixtures use the LOCAL Date constructor and
 * the clock is pinned with pinClock, so the suite holds in whatever zone the
 * process runs in; it is run under TZ=UTC, Africa/Lagos and America/New_York.
 * A device moving to another zone is simulated in the stored data, as in
 * recurringEndOccurrenceIndex.test.ts - "V-103 a." and "V-103 b.": every
 * stored instant is moved by the zone difference; the stored end day is a
 * calendar day and does not move. Not proved by this: a real zone switch in
 * ICU or Hermes, a DST change at the moment of the move, or anything on a
 * device.
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
import { occurrenceDate } from '../../domain/calculations/recurrenceDates';
import { CategoryType } from '../../domain/entities/Category';
import {
    RecurrenceFrequency,
    type CreateRecurringTransactionDTO,
    type UpdateRecurringTransactionDTO,
} from '../../domain/entities/RecurringTransaction';
import { TransactionType } from '../../domain/entities/Transaction';
import { WalletType } from '../../domain/entities/Wallet';
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
}

/** Every row the rule wrote, oldest first; its day is the local day in the process zone. */
async function ledger(): Promise<Row[]> {
    return (await mockTransactionRepo.getAll())
        .filter((t) => t.note === NOTE)
        .sort((a, b) => a.date.getTime() - b.date.getTime())
        .map((t) => ({ id: t.id, day: ymd(t.date) }));
}

/** The rows written since `before` was read. */
async function addedSince(before: Row[]): Promise<Row[]> {
    const known = new Set(before.map((r) => r.id));
    return (await ledger()).filter((r) => !known.has(r.id));
}

const days = (rows: Row[]) => rows.map((r) => r.day);

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

/** One engine run, as at launch, that must not fail for any rule. */
async function runEngine() {
    const result = await processRecurringRules(engineDeps());
    expect(result.errors).toEqual([]);
    return result;
}

/** An expense of 1000 on BANK, created the way the app creates it. */
async function createRule(fields: Partial<CreateRecurringTransactionDTO> & { startDate: Date }): Promise<string> {
    const rule = await mockDb.runInTransaction(() => mockRecurringRepo.create({
        type: TransactionType.EXPENSE,
        amount: 1000,
        walletId: BANK,
        categoryId: CATEGORY,
        description: NOTE,
        frequency: RecurrenceFrequency.MONTHLY,
        interval: 1,
        ...fields,
    }));
    return rule.id;
}

/**
 * The DTO the edit form submits for a rule (RecurringRuleForm.tsx:155-165):
 * every field, and the end date as it stands unless `overrides` changes it.
 */
async function formDto(id: string, overrides: Partial<UpdateRecurringTransactionDTO>): Promise<UpdateRecurringTransactionDTO> {
    const rule = (await mockRecurringRepo.getById(id))!;
    return {
        id,
        type: rule.type,
        amount: rule.amount,
        walletId: rule.walletId,
        categoryId: rule.categoryId,
        description: rule.description,
        frequency: rule.frequency,
        interval: rule.interval,
        endDate: rule.endDate ?? null,
        ...overrides,
    };
}

/**
 * The device moves to a zone `hoursEast` hours east of the zone that wrote
 * the data (negative: west). Seen from there, every stored instant reads that
 * many hours later on the wall clock; with the process zone fixed, each
 * instant is moved by the same amount instead. The occurrence numbers are
 * integers and the end day is a calendar day: neither moves. Same simulation
 * as recurringEndOccurrenceIndex.test.ts:224-237.
 */
async function moveDeviceEast(hoursEast: number): Promise<void> {
    const shift = (iso: unknown) => new Date(new Date(String(iso)).getTime() + hoursEast * HOUR_MS).toISOString();
    const { rows: rules } = await mockDb.execute('SELECT id, start_date, end_date, last_generated_date FROM recurring_rules');
    for (const r of rules) {
        await mockDb.runInTransaction(() => mockDb.execute(
            'UPDATE recurring_rules SET start_date = ?, end_date = ?, last_generated_date = ? WHERE id = ?',
            [shift(r.start_date), r.end_date === null ? null : shift(r.end_date), shift(r.last_generated_date), r.id],
        ));
    }
    const { rows: txs } = await mockDb.execute('SELECT id, date FROM transactions');
    for (const t of txs) {
        await mockDb.runInTransaction(() => mockDb.execute('UPDATE transactions SET date = ? WHERE id = ?', [shift(t.date), t.id]));
    }
}

async function mountHook() {
    const view = renderHook(() => useRecurringRules());
    await waitFor(() => {
        expect(view.result.current.loading).toBe(false);
    });
    return view.result;
}

type HookResult = Awaited<ReturnType<typeof mountHook>>;

/** Submit an edit through the hook; it must be saved, not refused. */
async function editRule(result: HookResult, dto: UpdateRecurringTransactionDTO): Promise<void> {
    let outcome: unknown;
    await act(async () => {
        outcome = await result.current.updateRule(dto).catch((error: unknown) => error);
    });
    expect(outcome).not.toBeInstanceOf(Error);
}

/** The local day of the last occurrence the stored rule may generate. */
async function lastDayOf(id: string): Promise<string | null> {
    const rule = (await mockRecurringRepo.getById(id))!;
    if (rule.endOccurrenceIndex === undefined) return null;
    const day = occurrenceDate(rule, rule.endOccurrenceIndex);
    return day === null ? null : ymd(day);
}

interface Scenario {
    frequency: RecurrenceFrequency;
    endDate: Date;
    /** Zone move after the first launch; 0: the device stays. */
    hoursEast: number;
    /** The edits submitted on 20 Oct, in order, each over the stored rule. */
    edits: Partial<UpdateRecurringTransactionDTO>[];
}

/**
 * A rule from 15 Sep 10:00, generated on 15 Sep; the device then moves; on
 * 20 Oct the edits are submitted through the form's DTO; launches on 24 Nov
 * and on 20 Dec. Returns the last day the stored rule may generate on, the
 * rows written by the 24 Nov launch and those written after it.
 */
async function run(s: Scenario) {
    pinAt(2026, 9, 15, 10, 0);
    const id = await createRule({ startDate: new Date(), endDate: s.endDate, frequency: s.frequency });
    await runEngine();

    if (s.hoursEast !== 0) {
        await moveDeviceEast(s.hoursEast);
    }

    pinAt(2026, 10, 20, 10, 0);
    const result = await mountHook();
    for (const edit of s.edits) {
        await editRule(result, await formDto(id, edit));
    }
    const lastDay = await lastDayOf(id);
    const before = await ledger();

    pinAt(2026, 11, 24, 10, 0);
    await runEngine();
    const byEndRows = await addedSince(before);
    pinAt(2026, 12, 20, 10, 0);
    await runEngine();
    const pastEnd = days(await addedSince([...before, ...byEndRows]));

    return { lastDay, byEnd: days(byEndRows), pastEnd };
}

/** A1: monthly, ending 23 Nov 23:30, edited to weekly. */
const A1 = {
    frequency: RecurrenceFrequency.MONTHLY,
    endDate: localDate(2026, 11, 23, 23, 30),
    edits: [{ frequency: RecurrenceFrequency.WEEKLY }],
};
/** The weekly dates strictly after 20 Oct up to the chosen 23 Nov. 15 Sep 2026 is a Tuesday. */
const A1_EXPECTED = {
    lastDay: '2026-11-17',
    byEnd: ['2026-10-27', '2026-11-03', '2026-11-10', '2026-11-17'],
    pastEnd: [],
};

/** A2: weekly, ending 24 Nov 00:30, interval 1 -> 2. */
const A2 = {
    frequency: RecurrenceFrequency.WEEKLY,
    endDate: localDate(2026, 11, 24, 0, 30),
    edits: [{ interval: 2 }],
};
/** Every other Tuesday from 15 Sep, strictly after 20 Oct, up to the chosen 24 Nov. */
const A2_EXPECTED = {
    lastDay: '2026-11-24',
    byEnd: ['2026-10-27', '2026-11-10', '2026-11-24'],
    pastEnd: [],
};

beforeEach(async () => {
    mockDb = await createTestDb({ writeGuard: true });
    mockRecurringRepo = new RecurringTransactionRepository(mockDb);
    mockWalletRepo = new WalletRepository(mockDb);
    mockCategoryRepo = new CategoryRepository(mockDb);
    mockTransactionRepo = new TransactionRepository(mockDb);

    await mockDb.runInTransaction(() => mockWalletRepo.save({ id: BANK, name: 'Bank', balance: 10000000, type: WalletType.BANK, createdAt: new Date(2025, 0, 1) }));
    await mockDb.runInTransaction(() => mockCategoryRepo.save({ id: CATEGORY, name: 'Bills', type: CategoryType.EXPENSE }));
});

afterEach(() => {
    restoreZoneClock();
});

describe('V-103 the end day chosen survives a zone change on every schedule edit (process zone; run under TZ=UTC, Africa/Lagos, America/New_York)', () => {
    it('V-103 A1. monthly rule ending 23 Nov 23:30, device 6 h east, edited to weekly on 20 Oct: nothing past 23 Nov', async () => {
        // Seen from 6 h east, the start reads 15 Sep 16:00 (same day) and the
        // end 24 Nov 05:30 (the day after the one chosen, a weekly date).
        expect(await run({ ...A1, hoursEast: 6 })).toEqual(A1_EXPECTED);
    });

    it('V-103 A2. weekly rule ending 24 Nov 00:30, device 6 h west, interval 1 -> 2 on 20 Oct: the last occurrence stays 24 Nov', async () => {
        // Seen from 6 h west, the start reads 15 Sep 04:00 (same day) and the
        // end 23 Nov 18:30 (the day before the one chosen).
        expect(await run({ ...A2, hoursEast: -6 })).toEqual(A2_EXPECTED);
    });
});

describe('controls: schedule edits with no zone change, and an end chosen again (process zone; run under TZ=UTC, Africa/Lagos, America/New_York)', () => {
    it('control: the A1 edit with no zone change: weekly dates up to 17 Nov, then nothing', async () => {
        expect(await run({ ...A1, hoursEast: 0 })).toEqual(A1_EXPECTED);
    });

    it('control: the A2 edit with no zone change: every other Tuesday up to 24 Nov, then nothing', async () => {
        expect(await run({ ...A2, hoursEast: 0 })).toEqual(A2_EXPECTED);
    });

    it('control: an end-date edit by the user replaces the stored day: device 6 h west, end set to 10 Nov on 20 Oct, then weekly: the last occurrence is 10 Nov', async () => {
        const outcome = await run({
            frequency: RecurrenceFrequency.MONTHLY,
            endDate: localDate(2026, 11, 24, 0, 30),
            hoursEast: -6,
            edits: [
                { endDate: localDate(2026, 11, 10, 12, 0) },
                { frequency: RecurrenceFrequency.WEEKLY },
            ],
        });

        expect(outcome).toEqual({
            lastDay: '2026-11-10',
            byEnd: ['2026-10-27', '2026-11-03', '2026-11-10'],
            pastEnd: [],
        });
    });
});
