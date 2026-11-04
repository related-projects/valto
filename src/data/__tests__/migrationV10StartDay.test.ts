/**
 * V-116: migration v10 gives every existing rule the calendar day of its
 * start, read in the zone the device is in when the migration runs (Owner
 * decision 3, pass 78: for existing rules the day is fixed at the update, in
 * the phone's zone at that moment; precedent V-103 decision D11). The
 * migration is additive and safe to run again, like v7, v8 and v9: it fills
 * only a day that is still NULL and never rewrites one.
 *
 * A 1.1.2 install at v6 goes through v7, v8, v9 and v10 in one boot. The v5
 * import of the old key-value data writes rules through the current mappers;
 * a rule it imports gets its start day the same way.
 *
 * Zones (register policy no. 9): fixtures use the LOCAL Date constructor, so
 * the suite holds in whatever zone the process runs in; one fixture is a fixed
 * UTC instant whose expected day is computed in the process zone, to show the
 * day is the local one. Run under TZ=UTC, Africa/Lagos and America/New_York.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { BetterSqliteDatabase } from '../../../tests/helpers/BetterSqliteDatabase';
import { InMemoryStorage } from '../../../tests/helpers/InMemoryStorage';
import { pinClock, restoreZoneClock } from '../../../tests/helpers/zoneClock';
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
import { CategoryRepository } from '../repositories/CategoryRepository';
import { RecurringTransactionRepository } from '../repositories/RecurringTransactionRepository';
import { TransactionRepository } from '../repositories/TransactionRepository';
import { WalletRepository } from '../repositories/WalletRepository';
import { processRecurringRules } from '../services/RecurringTransactionEngine';
import { asyncStorageAdapter, StorageKeys } from '../storage';
import { __setDatabaseForTests } from '../storage/sql/database';
import {
    applyEndDaySchema,
    applyEndOccurrenceSchema,
    applyOccurrenceKeySchema,
    SCHEMA_STATEMENTS,
} from '../storage/sql/schema';

const WALLET_ID = 'w-main';
const CATEGORY_ID = 'cat-main';

const pad = (n: number) => String(n).padStart(2, '0');
/** The local calendar day of `d` in the process zone. */
const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** A fixed instant: 16 Oct in UTC and Lagos, 15 Oct 22:00 in New York. */
const UTC_START = '2026-10-16T02:00:00.000Z';

/** The v4..v6 baseline tables. */
async function baselineDb(): Promise<BetterSqliteDatabase> {
    const db = new BetterSqliteDatabase();
    for (const statement of SCHEMA_STATEMENTS) {
        await db.execute(statement);
    }
    return db;
}

/** A database at version 9: the baseline tables plus the v7, v8 and v9 columns. */
async function v9Db(): Promise<BetterSqliteDatabase> {
    const db = await baselineDb();
    await applyOccurrenceKeySchema(db);
    await applyEndOccurrenceSchema(db);
    await applyEndDaySchema(db);
    return db;
}

async function seedWalletAndCategory(db: BetterSqliteDatabase): Promise<void> {
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
}

const V9_RULES: { id: string; startDate: Date }[] = [
    // Half an hour after local midnight.
    { id: 'r-midnight', startDate: new Date(2026, 9, 16, 0, 30) },
    // Half an hour before local midnight.
    { id: 'r-late', startDate: new Date(2026, 9, 15, 23, 30) },
    { id: 'r-utc', startDate: new Date(UTC_START) },
];

/** Rows written with the v9 column lists, as the unfixed app wrote them. */
async function seedV9(db: BetterSqliteDatabase): Promise<void> {
    await seedWalletAndCategory(db);
    for (const rule of V9_RULES) {
        await db.execute(
            `INSERT INTO recurring_rules
                (id, type, amount, wallet_id, category_id, description, start_date, end_date,
                 end_occurrence_index, end_day, frequency, interval_count, last_generated_date,
                 last_generated_index, schedule_version, is_paused, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                rule.id,
                TransactionType.EXPENSE,
                1000,
                WALLET_ID,
                CATEGORY_ID,
                rule.id,
                rule.startDate.toISOString(),
                null,
                null,
                null,
                RecurrenceFrequency.MONTHLY,
                1,
                new Date(2026, 8, 16).toISOString(),
                -1,
                0,
                0,
                rule.startDate.toISOString(),
            ],
        );
    }
}

/** Each rule's id and stored start day, by id. */
async function startDays(db: BetterSqliteDatabase): Promise<unknown[][]> {
    const { rows } = await db.execute('SELECT * FROM recurring_rules ORDER BY id');
    return rows.map((r) => [r.id, r.start_day]);
}

async function allRules(db: BetterSqliteDatabase) {
    const { rows } = await db.execute('SELECT * FROM recurring_rules ORDER BY id');
    return rows;
}

afterEach(() => {
    restoreZoneClock();
    __setDatabaseForTests(null);
});

describe('V-116 migration v10 (process zone; run under TZ=UTC, Africa/Lagos, America/New_York)', () => {
    it('V-116 A3. migration v10: each rule gets the local day of its start, a day already there is kept, and running it again changes nothing', async () => {
        await AsyncStorage.clear();
        const db = await v9Db();
        await seedV9(db);
        await asyncStorageAdapter.set(StorageKeys.SCHEMA_VERSION, 9);
        __setDatabaseForTests(db);

        await runMigrations();

        expect({ version: await getCurrentVersion(asyncStorageAdapter), days: await startDays(db) }).toEqual({
            version: 10,
            days: [
                ['r-late', '2026-10-15'],
                ['r-midnight', '2026-10-16'],
                ['r-utc', ymd(new Date(UTC_START))],
            ],
        });

        // A day already in the row is never rewritten, and nothing else moves
        // when the migration runs a second time.
        await db.runInTransaction(() =>
            db.execute("UPDATE recurring_rules SET start_day = '2026-10-01' WHERE id = 'r-midnight'"),
        );
        const before = await allRules(db);
        await asyncStorageAdapter.set(StorageKeys.SCHEMA_VERSION, 9);

        await runMigrations();

        expect(await getCurrentVersion(asyncStorageAdapter)).toBe(10);
        expect(await allRules(db)).toEqual(before);
    });

    it('V-116 A3 (v6 -> v10). a v6 database with a rule that has an end goes to v10 in one boot: number, end, end day and start day are all filled, and the engine runs on it', async () => {
        pinClock(new Date(2026, 10, 16, 10, 0).getTime());
        await AsyncStorage.clear();
        const db = await baselineDb();
        await seedWalletAndCategory(db);
        // As 1.1.2 left it: monthly from 16 Oct 00:30 to 16 Dec 00:30, the
        // 16 Oct occurrence written at local midnight, no key anywhere.
        const startIso = new Date(2026, 9, 16, 0, 30).toISOString();
        const generatedIso = new Date(2026, 9, 16).toISOString();
        await db.execute(
            `INSERT INTO recurring_rules
                (id, type, amount, wallet_id, category_id, description, start_date, end_date,
                 frequency, interval_count, last_generated_date, is_paused, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                'r-end',
                TransactionType.EXPENSE,
                1000,
                WALLET_ID,
                CATEGORY_ID,
                'Rent',
                startIso,
                new Date(2026, 11, 16, 0, 30).toISOString(),
                RecurrenceFrequency.MONTHLY,
                1,
                generatedIso,
                0,
                startIso,
            ],
        );
        await db.execute(
            `INSERT INTO transactions (id, type, amount, category_id, wallet_id, date, note, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            ['old-0', TransactionType.EXPENSE, 1000, CATEGORY_ID, WALLET_ID, generatedIso, 'Rent', generatedIso],
        );
        await asyncStorageAdapter.set(StorageKeys.SCHEMA_VERSION, 6);
        __setDatabaseForTests(db);

        await runMigrations();

        const rows = (await allRules(db)).map((r) => ({
            last_generated_index: r.last_generated_index,
            end_occurrence_index: r.end_occurrence_index,
            end_day: r.end_day,
            start_day: r.start_day,
        }));
        expect({ version: await getCurrentVersion(asyncStorageAdapter), rows }).toEqual({
            version: 10,
            rows: [{ last_generated_index: 0, end_occurrence_index: 2, end_day: '2026-12-16', start_day: '2026-10-16' }],
        });

        const transactionRepo = new TransactionRepository(db);
        const result = await processRecurringRules({
            recurringRepo: new RecurringTransactionRepository(db),
            transactionRepo,
            walletRepo: new WalletRepository(db),
            categoryRepo: new CategoryRepository(db),
            eventBus: { emit: jest.fn(), emitMultiple: jest.fn() },
            runInTransaction: db.runInTransaction.bind(db),
        });
        const added = (await transactionRepo.getAll()).filter((t) => t.id !== 'old-0').map((t) => ymd(t.date));
        expect({ errors: result.errors, added }).toEqual({ errors: [], added: ['2026-11-16'] });
    });
});

describe('V-116 the v5 import gives an imported rule its start day (process zone; run under TZ=UTC, Africa/Lagos, America/New_York)', () => {
    it('V-116 A3 (v5). a rule imported from the old key-value data gets the local day of its start', async () => {
        // A database left at version 4: only the baseline tables.
        const db = await baselineDb();
        const storage = new InMemoryStorage();
        const iso = new Date(2026, 8, 15, 10, 0).toISOString();

        const wallets: SerializableWallet[] = [
            { id: WALLET_ID, name: 'Main', balance: 99000, type: WalletType.BANK, createdAt: iso },
        ];
        const categories: SerializableCategory[] = [
            { id: CATEGORY_ID, name: 'Bills', type: CategoryType.EXPENSE },
        ];
        const rule = (id: string, startDate: Date): SerializableRecurringTransaction => ({
            id,
            type: TransactionType.EXPENSE,
            amount: 1000,
            walletId: WALLET_ID,
            categoryId: CATEGORY_ID,
            description: 'Rent',
            startDate: startDate.toISOString(),
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
            rule('rr-late', new Date(2026, 9, 15, 23, 30)),
            rule('rr-midnight', new Date(2026, 9, 16, 0, 30)),
        ]);
        await storage.set(StorageKeys.SCHEMA_VERSION, 4);

        await v5_import_from_asyncstorage.up({ storage, db });

        expect(await startDays(db)).toEqual([
            ['rr-late', '2026-10-15'],
            ['rr-midnight', '2026-10-16'],
        ]);
    });
});
