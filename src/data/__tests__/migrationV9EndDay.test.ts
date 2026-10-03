/**
 * V-103: migration v9 gives every existing rule that has an end the calendar
 * day of that end, read in the zone the device is in when the migration runs
 * (Owner decision D11, pass 75: for existing rules the day is fixed at the
 * update, in the phone's zone at that moment). A rule without an end gets no
 * day. The migration is additive and safe to run again, like v7 and v8: it
 * fills only a day that is still NULL and never rewrites one.
 *
 * The v5 import of the old key-value data writes rules through the current
 * mappers; a rule it imports with an end gets its day the same way.
 *
 * The starting database is a v8 one: the v4..v6 baseline tables plus the
 * columns v7 and v8 add, with rows written with the v8 column lists.
 *
 * Zones (register policy no. 9): fixtures use the LOCAL Date constructor, so
 * the suite holds in whatever zone the process runs in; one fixture is a fixed
 * UTC instant whose expected day is computed in the process zone, to show the
 * day is the local one. CI runs it under TZ=UTC, Africa/Lagos and
 * America/New_York.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { BetterSqliteDatabase } from '../../../tests/helpers/BetterSqliteDatabase';
import { InMemoryStorage } from '../../../tests/helpers/InMemoryStorage';
import { CategoryType, type SerializableCategory } from '../../domain/entities/Category';
import {
    RecurrenceFrequency,
    type SerializableRecurringTransaction,
} from '../../domain/entities/RecurringTransaction';
import { TransactionType } from '../../domain/entities/Transaction';
import { type SerializableWallet, WalletType } from '../../domain/entities/Wallet';
import { runMigrations } from '../migrations';
import { getCurrentVersion } from '../migrations/migrationRunner';
import { v5_import_from_asyncstorage } from '../migrations/v5_import_from_asyncstorage';
import { asyncStorageAdapter, StorageKeys } from '../storage';
import { __setDatabaseForTests } from '../storage/sql/database';
import { applyEndOccurrenceSchema, applyOccurrenceKeySchema, SCHEMA_STATEMENTS } from '../storage/sql/schema';

const WALLET_ID = 'w-main';
const CATEGORY_ID = 'cat-main';

const pad = (n: number) => String(n).padStart(2, '0');
/** The local calendar day of `d` in the process zone. */
const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** A fixed instant: 24 Nov in UTC and Lagos, 23 Nov 21:00 in New York. */
const UTC_END = '2026-11-24T02:00:00.000Z';

interface V8Rule {
    id: string;
    endDate: Date | null;
    endOccurrenceIndex: number | null;
}

const V8_RULES: V8Rule[] = [
    // Half an hour after local midnight.
    { id: 'r-midnight', endDate: new Date(2026, 10, 24, 0, 30), endOccurrenceIndex: 2 },
    // Half an hour before local midnight.
    { id: 'r-late', endDate: new Date(2026, 10, 23, 23, 30), endOccurrenceIndex: 2 },
    { id: 'r-utc', endDate: new Date(UTC_END), endOccurrenceIndex: 2 },
    { id: 'r-no-end', endDate: null, endOccurrenceIndex: null },
];

/** A database at version 8: the baseline tables plus the v7 and v8 columns. */
async function v8Db(): Promise<BetterSqliteDatabase> {
    const db = new BetterSqliteDatabase();
    for (const statement of SCHEMA_STATEMENTS) {
        await db.execute(statement);
    }
    await applyOccurrenceKeySchema(db);
    await applyEndOccurrenceSchema(db);
    return db;
}

/** Rows written with the v8 column lists, as the unfixed app wrote them. */
async function seedV8(db: BetterSqliteDatabase, rules: V8Rule[]): Promise<void> {
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
                 end_occurrence_index, frequency, interval_count, last_generated_date,
                 last_generated_index, schedule_version, is_paused, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                rule.id,
                TransactionType.EXPENSE,
                1000,
                WALLET_ID,
                CATEGORY_ID,
                rule.id,
                new Date(2026, 8, 15, 10, 0).toISOString(),
                rule.endDate === null ? null : rule.endDate.toISOString(),
                rule.endOccurrenceIndex,
                RecurrenceFrequency.MONTHLY,
                1,
                new Date(2026, 8, 15).toISOString(),
                0,
                0,
                0,
                new Date(2026, 8, 15, 10, 0).toISOString(),
            ],
        );
    }
}

/** Each rule's id and stored end day, by id. */
async function endDays(db: BetterSqliteDatabase): Promise<unknown[][]> {
    const { rows } = await db.execute('SELECT * FROM recurring_rules ORDER BY id');
    return rows.map((r) => [r.id, r.end_day]);
}

async function allRules(db: BetterSqliteDatabase) {
    const { rows } = await db.execute('SELECT * FROM recurring_rules ORDER BY id');
    return rows;
}

afterEach(() => {
    __setDatabaseForTests(null);
});

describe('V-103 migration v9 on a v8 database (process zone; CI: UTC, Africa/Lagos, America/New_York)', () => {
    it('V-103 A3. migration v9: each rule with an end gets the local day of its end, a rule without one stays empty, a day already there is kept, and running it again changes nothing', async () => {
        await AsyncStorage.clear();
        const db = await v8Db();
        await seedV8(db, V8_RULES);
        await asyncStorageAdapter.set(StorageKeys.SCHEMA_VERSION, 8);
        __setDatabaseForTests(db);

        await runMigrations();

        expect({ version: await getCurrentVersion(asyncStorageAdapter), days: await endDays(db) }).toEqual({
            version: 9,
            days: [
                ['r-late', '2026-11-23'],
                ['r-midnight', '2026-11-24'],
                ['r-no-end', null],
                ['r-utc', ymd(new Date(UTC_END))],
            ],
        });

        // A day the app wrote after the migration is never rewritten, and
        // nothing else moves when the migration runs a second time.
        await db.runInTransaction(() =>
            db.execute("UPDATE recurring_rules SET end_day = '2026-12-31' WHERE id = 'r-midnight'"),
        );
        const before = await allRules(db);
        await asyncStorageAdapter.set(StorageKeys.SCHEMA_VERSION, 8);

        await runMigrations();

        expect(await getCurrentVersion(asyncStorageAdapter)).toBe(9);
        expect(await allRules(db)).toEqual(before);
    });
});

describe('V-103 the v5 import gives an imported rule its end day (process zone; CI: UTC, Africa/Lagos, America/New_York)', () => {
    it('V-103 A4 (v5). a rule imported from the old key-value data with an end gets the local day of that end; one without an end gets none', async () => {
        // A database left at version 4: only the baseline tables.
        const db = new BetterSqliteDatabase();
        for (const statement of SCHEMA_STATEMENTS) {
            await db.execute(statement);
        }
        const storage = new InMemoryStorage();
        const iso = new Date(2026, 8, 15, 10, 0).toISOString();

        const wallets: SerializableWallet[] = [
            { id: WALLET_ID, name: 'Main', balance: 99000, type: WalletType.BANK, createdAt: iso },
        ];
        const categories: SerializableCategory[] = [
            { id: CATEGORY_ID, name: 'Bills', type: CategoryType.EXPENSE },
        ];
        const rule = (id: string, endDate?: Date): SerializableRecurringTransaction => ({
            id,
            type: TransactionType.EXPENSE,
            amount: 1000,
            walletId: WALLET_ID,
            categoryId: CATEGORY_ID,
            description: 'Rent',
            startDate: iso,
            endDate: endDate?.toISOString(),
            frequency: RecurrenceFrequency.MONTHLY,
            interval: 1,
            lastGeneratedDate: iso,
            isPaused: false,
            createdAt: iso,
        });
        await storage.set(StorageKeys.WALLETS, wallets);
        await storage.set(StorageKeys.CATEGORIES, categories);
        await storage.set(StorageKeys.TRANSACTIONS, []);
        await storage.set(StorageKeys.BUDGETS, []);
        await storage.set(StorageKeys.RECURRING_RULES, [
            rule('rr-end', new Date(2026, 10, 24, 0, 30)),
            rule('rr-no-end'),
        ]);
        await storage.set(StorageKeys.SCHEMA_VERSION, 4);

        await v5_import_from_asyncstorage.up({ storage, db });

        expect(await endDays(db)).toEqual([
            ['rr-end', '2026-11-24'],
            ['rr-no-end', null],
        ]);
    });
});
