/**
 * V-116: a rule's start day is the calendar day it was created for, and every
 * occurrence is derived from that day, so a zone change moves neither the
 * start nor the anchor day (REGISTRE V-116, Owner decision 3, pass 78;
 * registry policy no. 1).
 *
 * The form starts a rule at the moment it was opened (RecurringRuleForm.tsx:82)
 * and the start is stored as an instant (mappers.ts:158). The walk read the
 * start day and the anchor day off that instant in the current zone
 * (recurrenceDates.ts:85-91), so a rule created within a few hours of local
 * midnight moved its start, and every occurrence after it, by one day once the
 * device changed zone.
 *
 * Rules are created through RecurringTransactionRepository.create with the
 * form's own start (new Date() at the moment the form opens) and caught up by
 * the engine the way the app runs it at launch, over a real SQLite database
 * with the write guard armed.
 *
 * Zones (register policy no. 9): fixtures use the LOCAL Date constructor and
 * the clock is pinned with pinClock, so the suite holds in whatever zone the
 * process runs in; it is run under TZ=UTC, Africa/Lagos and America/New_York.
 * A device moving to another zone is simulated in the stored data, as in
 * recurringEndScheduleEditZone.test.ts: every stored instant is moved by the
 * zone difference, while calendar-day text and occurrence numbers stay as
 * they are. Lagos (UTC+1) to Toronto (UTC-4 in October) is 5 h west. Not
 * proved by this: a real zone switch in ICU or Hermes, a DST change at the
 * moment of the move, or anything on a device.
 */

import { createTestDb } from '../../../tests/helpers/createTestDb';
import { pinClock, restoreZoneClock } from '../../../tests/helpers/zoneClock';
import { occurrenceDate } from '../../domain/calculations/recurrenceDates';
import { CategoryType } from '../../domain/entities/Category';
import { RecurrenceFrequency, type RecurringTransaction } from '../../domain/entities/RecurringTransaction';
import { TransactionType } from '../../domain/entities/Transaction';
import { WalletType } from '../../domain/entities/Wallet';
import { CategoryRepository } from '../repositories/CategoryRepository';
import { RecurringTransactionRepository } from '../repositories/RecurringTransactionRepository';
import { TransactionRepository } from '../repositories/TransactionRepository';
import { WalletRepository } from '../repositories/WalletRepository';
import { processRecurringRules } from '../services/RecurringTransactionEngine';
import type { SqlDatabase } from '../storage/sql/SqlDatabase';

const BANK = 'w-bank';
const CATEGORY = 'cat-bills';
const NOTE = 'Rent';
const HOUR_MS = 60 * 60 * 1000;

let db: SqlDatabase;
let recurringRepo: RecurringTransactionRepository;
let walletRepo: WalletRepository;
let categoryRepo: CategoryRepository;
let transactionRepo: TransactionRepository;

/** Pin the clock to a local wall-clock instant in the process zone. `month` is 1-based. */
function pinAt(year: number, month: number, day: number, hours: number, minutes = 0): void {
    pinClock(new Date(year, month - 1, day, hours, minutes).getTime());
}

const pad = (n: number) => String(n).padStart(2, '0');
/** The local calendar day of `d` in the process zone. */
const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

interface Row {
    id: string;
    day: string;
}

/** Every row the rule wrote, oldest first, with its local day in the process zone. */
async function ledger(): Promise<Row[]> {
    return (await transactionRepo.getAll())
        .filter((t) => t.note === NOTE)
        .sort((a, b) => a.date.getTime() - b.date.getTime())
        .map((t) => ({ id: t.id, day: ymd(t.date) }));
}

/** The local days of the rows written since `before` was read. */
async function daysAddedSince(before: Row[]): Promise<string[]> {
    const known = new Set(before.map((r) => r.id));
    return (await ledger()).filter((r) => !known.has(r.id)).map((r) => r.day);
}

async function runEngine(): Promise<void> {
    const result = await processRecurringRules({
        recurringRepo,
        transactionRepo,
        walletRepo,
        categoryRepo,
        eventBus: { emit: jest.fn(), emitMultiple: jest.fn() },
        runInTransaction: db.runInTransaction.bind(db),
    });
    expect(result.errors).toEqual([]);
}

/**
 * A monthly expense created the way the app creates it: the form's start is
 * the moment it was opened, here the pinned clock.
 */
async function createRuleNow(): Promise<string> {
    const rule = await db.runInTransaction(() => recurringRepo.create({
        type: TransactionType.EXPENSE,
        amount: 1000,
        walletId: BANK,
        categoryId: CATEGORY,
        description: NOTE,
        startDate: new Date(),
        frequency: RecurrenceFrequency.MONTHLY,
        interval: 1,
    }));
    return rule.id;
}

/**
 * The device moves to a zone `hoursEast` hours east of the zone that wrote the
 * data (negative: west). Seen from there, every stored instant reads that many
 * hours later on the wall clock; with the process zone fixed, each instant is
 * moved by the same amount instead. Same simulation as
 * recurringEndScheduleEditZone.test.ts - moveDeviceEast.
 */
async function moveDeviceEast(hoursEast: number): Promise<void> {
    const shift = (iso: unknown) => new Date(new Date(String(iso)).getTime() + hoursEast * HOUR_MS).toISOString();
    const { rows: rules } = await db.execute('SELECT id, start_date, end_date, last_generated_date FROM recurring_rules');
    for (const r of rules) {
        await db.runInTransaction(() => db.execute(
            'UPDATE recurring_rules SET start_date = ?, end_date = ?, last_generated_date = ? WHERE id = ?',
            [shift(r.start_date), r.end_date === null ? null : shift(r.end_date), shift(r.last_generated_date), r.id],
        ));
    }
    const { rows: txs } = await db.execute('SELECT id, date FROM transactions');
    for (const t of txs) {
        await db.runInTransaction(() => db.execute('UPDATE transactions SET date = ? WHERE id = ?', [shift(t.date), t.id]));
    }
}

async function storedRule(id: string): Promise<RecurringTransaction> {
    const rule = await recurringRepo.getById(id);
    expect(rule).not.toBeNull();
    return rule!;
}

/** The stored start day, read without naming the field on the type. */
const startDayField = (rule: RecurringTransaction): unknown => (rule as unknown as Record<string, unknown>).startDay;

/** The local day of the month of occurrences 1 and 2, as the walk derives them now. */
const anchorDays = (rule: RecurringTransaction) => [1, 2].map((k) => occurrenceDate(rule, k)?.getDate() ?? null);

beforeEach(async () => {
    db = await createTestDb({ writeGuard: true });
    recurringRepo = new RecurringTransactionRepository(db);
    walletRepo = new WalletRepository(db);
    categoryRepo = new CategoryRepository(db);
    transactionRepo = new TransactionRepository(db);

    await db.runInTransaction(() => walletRepo.save({ id: BANK, name: 'Bank', balance: 10000000, type: WalletType.BANK, createdAt: new Date(2025, 0, 1) }));
    await db.runInTransaction(() => categoryRepo.save({ id: CATEGORY, name: 'Bills', type: CategoryType.EXPENSE }));
});

afterEach(() => {
    restoreZoneClock();
});

describe('V-116 the start day does not move with the device (process zone; run under TZ=UTC, Africa/Lagos, America/New_York)', () => {
    it('V-116 A1. created 16 Oct at 00:30, device then 5 h west (Lagos -> Toronto): start and anchor day stay the 16th, the next occurrences fall on 16 Nov and 16 Dec', async () => {
        pinAt(2026, 10, 16, 0, 30);
        const id = await createRuleNow();
        await runEngine();
        const before = await ledger();

        await moveDeviceEast(-5);
        // The forcing: seen from 5 h west, the start instant reads 15 Oct 19:30.
        expect(ymd((await storedRule(id)).startDate)).toBe('2026-10-15');

        pinAt(2026, 11, 16, 10, 0);
        await runEngine();
        pinAt(2026, 12, 16, 10, 0);
        await runEngine();
        const rule = await storedRule(id);

        expect({
            startDay: startDayField(rule),
            anchorDays: anchorDays(rule),
            added: await daysAddedSince(before),
        }).toEqual({
            startDay: '2026-10-16',
            anchorDays: [16, 16],
            added: ['2026-11-16', '2026-12-16'],
        });
    });

    it('V-116 A2. created 15 Oct at 23:30, device then 5 h east (Toronto -> Lagos): start and anchor day stay the 15th, the next occurrences fall on 15 Nov and 15 Dec', async () => {
        pinAt(2026, 10, 15, 23, 30);
        const id = await createRuleNow();
        await runEngine();
        const before = await ledger();

        await moveDeviceEast(5);
        // The forcing: seen from 5 h east, the start instant reads 16 Oct 04:30.
        expect(ymd((await storedRule(id)).startDate)).toBe('2026-10-16');

        pinAt(2026, 11, 15, 10, 0);
        await runEngine();
        pinAt(2026, 12, 15, 10, 0);
        await runEngine();
        const rule = await storedRule(id);

        expect({
            startDay: startDayField(rule),
            anchorDays: anchorDays(rule),
            added: await daysAddedSince(before),
        }).toEqual({
            startDay: '2026-10-15',
            anchorDays: [15, 15],
            added: ['2026-11-15', '2026-12-15'],
        });
    });

    it('control: created 16 Oct at 00:30 with no zone change, the occurrences fall on 16 Oct, 16 Nov and 16 Dec', async () => {
        pinAt(2026, 10, 16, 0, 30);
        const id = await createRuleNow();
        await runEngine();
        pinAt(2026, 11, 16, 10, 0);
        await runEngine();
        pinAt(2026, 12, 16, 10, 0);
        await runEngine();

        expect({
            anchorDays: anchorDays(await storedRule(id)),
            days: (await ledger()).map((r) => r.day),
        }).toEqual({
            anchorDays: [16, 16],
            days: ['2026-10-16', '2026-11-16', '2026-12-16'],
        });
    });
});
