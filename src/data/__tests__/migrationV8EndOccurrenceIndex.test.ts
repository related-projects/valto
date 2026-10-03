/**
 * V-114 / V-103: migration v8 gives every existing rule that has an end the
 * number of its last occurrence, computed from its end date the way the
 * unfixed code read it - the local day of the end, inclusive, in the zone the
 * device is in when the migration runs (Owner decision 2 of 01/10, pass 71;
 * precedent: migration v7, register policy no. 10).
 *
 * The starting database is a v7 one: the tables are the v4..v6 baseline plus
 * the occurrence-key columns v7 adds, and its rows are written with the v7
 * column lists. The migration is additive and safe to run again: it fills only
 * a number that is still NULL and never rewrites one.
 *
 * Every expected value is computed by hand from the rule: occurrence k is the
 * k-th date from the local day of the start, and the last one counted is the
 * last whose local day is not after the local day of the end.
 *
 * Zones (register policy no. 9): fixtures use the LOCAL Date constructor and
 * the clock is pinned with pinClock, so the suite holds in whatever zone the
 * process runs in. CI runs it under TZ=UTC, Africa/Lagos and America/New_York.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { BetterSqliteDatabase } from '../../../tests/helpers/BetterSqliteDatabase';
import { pinClock, restoreZoneClock } from '../../../tests/helpers/zoneClock';
import { CategoryType } from '../../domain/entities/Category';
import { RecurrenceFrequency } from '../../domain/entities/RecurringTransaction';
import { TransactionType } from '../../domain/entities/Transaction';
import { WalletType } from '../../domain/entities/Wallet';
import { runMigrations } from '../migrations';
import { getCurrentVersion } from '../migrations/migrationRunner';
import { asyncStorageAdapter, StorageKeys } from '../storage';
import { __setDatabaseForTests } from '../storage/sql/database';
import { applyOccurrenceKeySchema, SCHEMA_STATEMENTS } from '../storage/sql/schema';

const WALLET_ID = 'w-main';
const CATEGORY_ID = 'cat-main';

interface V7Rule {
    id: string;
    frequency: RecurrenceFrequency;
    interval: number;
    startDate: Date;
    endDate: Date | null;
    lastGeneratedDate: Date;
    lastGeneratedIndex: number;
}

/** A database at version 7: the baseline tables plus the occurrence-key columns. */
async function v7Db(): Promise<BetterSqliteDatabase> {
    const db = new BetterSqliteDatabase();
    for (const statement of SCHEMA_STATEMENTS) {
        await db.execute(statement);
    }
    await applyOccurrenceKeySchema(db);
    return db;
}

/** Rows written with the v7 column lists, as the unfixed app wrote them. */
async function seedV7(db: BetterSqliteDatabase, rules: V7Rule[]): Promise<void> {
    await db.execute(
        `INSERT INTO wallets (id, name, balance, opening_balance, type, color, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [WALLET_ID, 'Main', 1000000, 1000000, WalletType.BANK, null, new Date(2025, 0, 1).toISOString()],
    );
    await db.execute('INSERT INTO categories (id, name, type, icon, color) VALUES (?, ?, ?, ?, ?)', [
        CATEGORY_ID,
        'Bills',
        CategoryType.EXPENSE,
        null,
        null,
    ]);
    for (const rule of rules) {
        await db.execute(
            `INSERT INTO recurring_rules
                (id, type, amount, wallet_id, category_id, description, start_date, end_date,
                 frequency, interval_count, last_generated_date, last_generated_index, schedule_version,
                 is_paused, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                rule.id,
                TransactionType.EXPENSE,
                1000,
                WALLET_ID,
                CATEGORY_ID,
                rule.id,
                rule.startDate.toISOString(),
                rule.endDate === null ? null : rule.endDate.toISOString(),
                rule.frequency,
                rule.interval,
                rule.lastGeneratedDate.toISOString(),
                rule.lastGeneratedIndex,
                0,
                0,
                new Date(2025, 11, 1).toISOString(),
            ],
        );
    }
}

const V7_RULES: V7Rule[] = [
    {
        // 15 Jan (0) .. 15 Oct (9); 15 Nov is after the 19 Oct end.
        id: 'r-monthly',
        frequency: RecurrenceFrequency.MONTHLY,
        interval: 1,
        startDate: new Date(2026, 0, 15, 9, 0),
        endDate: new Date(2026, 9, 19, 10, 0),
        lastGeneratedDate: new Date(2026, 8, 15),
        lastGeneratedIndex: 8,
    },
    {
        // Anchored on the 31st: 31 Jan (0), 28 Feb (1), 31 Mar (2), 30 Apr (3).
        // The end falls on 30 Apr at 08:00, before the 09:00 of the start: the
        // day counts, so 30 Apr is the last one.
        id: 'r-31',
        frequency: RecurrenceFrequency.MONTHLY,
        interval: 1,
        startDate: new Date(2026, 0, 31, 9, 0),
        endDate: new Date(2026, 3, 30, 8, 0),
        lastGeneratedDate: new Date(2026, 3, 30),
        lastGeneratedIndex: 3,
    },
    {
        // Every other week: 1 Jun (0), 15 Jun (1), 29 Jun (2); the end is 29 Jun 07:00.
        id: 'r-w2',
        frequency: RecurrenceFrequency.WEEKLY,
        interval: 2,
        startDate: new Date(2026, 5, 1, 18, 0),
        endDate: new Date(2026, 5, 29, 7, 0),
        lastGeneratedDate: new Date(2026, 5, 15),
        lastGeneratedIndex: 1,
    },
    {
        id: 'r-no-end',
        frequency: RecurrenceFrequency.MONTHLY,
        interval: 1,
        startDate: new Date(2026, 0, 10, 12, 0),
        endDate: null,
        lastGeneratedDate: new Date(2026, 8, 10),
        lastGeneratedIndex: 8,
    },
];

async function columnNames(db: BetterSqliteDatabase): Promise<string[]> {
    const { rows } = await db.execute('PRAGMA table_info(recurring_rules)');
    return rows.map((r) => String(r.name));
}

async function allRules(db: BetterSqliteDatabase) {
    const { rows } = await db.execute('SELECT * FROM recurring_rules ORDER BY id');
    return rows;
}

afterEach(() => {
    restoreZoneClock();
    __setDatabaseForTests(null);
});

describe('V-114 migration v8 on a v7 database (process zone; CI: UTC, Africa/Lagos, America/New_York)', () => {
    it('migration v8: each rule with an end gets the number of its last occurrence, and running it again changes nothing', async () => {
        pinClock(new Date(2026, 9, 20, 12, 0).getTime());
        await AsyncStorage.clear();
        const db = await v7Db();
        await seedV7(db, V7_RULES);
        await asyncStorageAdapter.set(StorageKeys.SCHEMA_VERSION, 7);
        __setDatabaseForTests(db);

        await runMigrations();

        expect(await getCurrentVersion(asyncStorageAdapter)).toBe(9);
        expect(await columnNames(db)).toContain('end_occurrence_index');
        const { rows } = await db.execute('SELECT id, end_occurrence_index FROM recurring_rules ORDER BY id');
        expect(rows).toEqual([
            { id: 'r-31', end_occurrence_index: 3 },
            { id: 'r-monthly', end_occurrence_index: 9 },
            { id: 'r-no-end', end_occurrence_index: null },
            { id: 'r-w2', end_occurrence_index: 2 },
        ]);

        // A number the app wrote after the migration is never rewritten, and
        // nothing else moves when the migration runs a second time.
        await db.runInTransaction(() =>
            db.execute("UPDATE recurring_rules SET end_occurrence_index = 7 WHERE id = 'r-monthly'"),
        );
        const before = await allRules(db);
        await asyncStorageAdapter.set(StorageKeys.SCHEMA_VERSION, 7);

        await runMigrations();

        expect(await getCurrentVersion(asyncStorageAdapter)).toBe(9);
        expect(await allRules(db)).toEqual(before);
    });
});
