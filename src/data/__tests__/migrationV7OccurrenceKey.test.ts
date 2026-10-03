/**
 * V-98 d: migration v7 gives every existing rule the number of its last
 * generated occurrence, and the first run after the upgrade emits exactly
 * what the unfixed engine would have emitted - nothing again, nothing skipped.
 *
 * The starting database is a v6 one: the tables are created from the baseline
 * SCHEMA_STATEMENTS (what v4 created and v5/v6 left unchanged), and its rows
 * are the ones the unfixed engine leaves behind - each watermark on the local
 * midnight of the rule's last generated occurrence, each occurrence row dated
 * on that same local midnight, no occurrence key anywhere.
 *
 * Every expected value is computed by hand from the unfixed rule: an
 * occurrence is emitted when its local day is strictly after the watermark's
 * local day and not after today, both in the zone the process runs in.
 *
 * Zones (register policy no. 9): fixtures use the LOCAL Date constructor and
 * the clock is pinned with pinClock, so the suite holds in whatever zone the
 * process runs in. CI runs it under TZ=UTC, Africa/Lagos and America/New_York.
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
import { type SerializableTransaction, TransactionType } from '../../domain/entities/Transaction';
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
import { SCHEMA_STATEMENTS } from '../storage/sql/schema';

const WALLET_ID = 'w-main';
const CATEGORY_ID = 'cat-main';

/** Local midnight of a calendar day, in the process zone. */
function localDay(year: number, monthIndex: number, day: number): Date {
    return new Date(year, monthIndex, day);
}

/** A database whose tables are exactly the v4..v6 baseline. */
async function baselineDb(): Promise<BetterSqliteDatabase> {
    const db = new BetterSqliteDatabase();
    for (const statement of SCHEMA_STATEMENTS) {
        await db.execute(statement);
    }
    return db;
}

interface LegacyRule {
    id: string;
    description: string;
    frequency: RecurrenceFrequency;
    interval: number;
    startDate: Date;
    /** Watermark as the unfixed engine left it. */
    lastGeneratedDate: Date;
    /** Occurrences the unfixed engine already wrote, at their local midnights. */
    generated: Date[];
}

/** Rows written with the v6 column lists, as the unfixed app wrote them. */
async function seedLegacy(db: BetterSqliteDatabase, rules: LegacyRule[]): Promise<Set<string>> {
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

    const seededIds = new Set<string>();
    for (const rule of rules) {
        await db.execute(
            `INSERT INTO recurring_rules
                (id, type, amount, wallet_id, category_id, description, start_date, end_date,
                 frequency, interval_count, last_generated_date, is_paused, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                rule.id,
                TransactionType.EXPENSE,
                1000,
                WALLET_ID,
                CATEGORY_ID,
                rule.description,
                rule.startDate.toISOString(),
                null,
                rule.frequency,
                rule.interval,
                rule.lastGeneratedDate.toISOString(),
                0,
                new Date(2025, 11, 1).toISOString(),
            ],
        );
        for (const [i, date] of rule.generated.entries()) {
            const id = `${rule.id}-old-${i}`;
            seededIds.add(id);
            await db.execute(
                `INSERT INTO transactions (id, type, amount, category_id, wallet_id, date, note, created_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                [id, TransactionType.EXPENSE, 1000, CATEGORY_ID, WALLET_ID, date.toISOString(), rule.description, date.toISOString()],
            );
        }
    }
    return seededIds;
}

// Today: 20 June 2026, local noon.
const NOW = new Date(2026, 5, 20, 12, 0).getTime();

const LEGACY_RULES: LegacyRule[] = [
    {
        // Anchored on the 31st: Feb clamps to the 28th. Last written: 31 Mar.
        id: 'r-31',
        description: 'Rent 31st',
        frequency: RecurrenceFrequency.MONTHLY,
        interval: 1,
        startDate: new Date(2026, 0, 31, 9, 0),
        lastGeneratedDate: localDay(2026, 2, 31),
        generated: [localDay(2026, 0, 31), localDay(2026, 1, 28), localDay(2026, 2, 31)],
    },
    {
        // Every other week from 1 Jun. Last written: 1 Jun.
        id: 'r-w2',
        description: 'Cleaner',
        frequency: RecurrenceFrequency.WEEKLY,
        interval: 2,
        startDate: new Date(2026, 5, 1, 18, 0),
        lastGeneratedDate: localDay(2026, 5, 1),
        generated: [localDay(2026, 5, 1)],
    },
    {
        // Starts 25 Jun, never generated: the watermark is still the one
        // RecurringTransactionRepository.create placed, one interval back.
        id: 'r-new',
        description: 'Magazine',
        frequency: RecurrenceFrequency.MONTHLY,
        interval: 1,
        startDate: new Date(2026, 5, 25, 10, 0),
        lastGeneratedDate: new Date(2026, 4, 25, 10, 0),
        generated: [],
    },
    {
        // Daily from 18 Jun, up to date through today.
        id: 'r-daily',
        description: 'Parking',
        frequency: RecurrenceFrequency.DAILY,
        interval: 1,
        startDate: new Date(2026, 5, 18, 8, 0),
        lastGeneratedDate: localDay(2026, 5, 20),
        generated: [localDay(2026, 5, 18), localDay(2026, 5, 19), localDay(2026, 5, 20)],
    },
];

afterEach(() => {
    restoreZoneClock();
    __setDatabaseForTests(null);
});

describe('V-98 d. migration v7 on a v6 database (process zone; CI: UTC, Africa/Lagos, America/New_York)', () => {
    it('migration v7: backfills each index so the first run emits exactly what the unfixed engine would have', async () => {
        pinClock(NOW);
        await AsyncStorage.clear();
        const db = await baselineDb();
        const seededIds = await seedLegacy(db, LEGACY_RULES);
        await asyncStorageAdapter.set(StorageKeys.SCHEMA_VERSION, 6);
        __setDatabaseForTests(db);

        await runMigrations();

        // v8 (REGISTRE V-114) and v9 (REGISTRE V-103) run after v7 in the same boot.
        expect(await getCurrentVersion(asyncStorageAdapter)).toBe(9);

        // The index of the last occurrence each rule has already written.
        const { rows: ruleRows } = await db.execute(
            'SELECT id, last_generated_index, schedule_version FROM recurring_rules ORDER BY id',
        );
        expect(ruleRows).toEqual([
            { id: 'r-31', last_generated_index: 2, schedule_version: 0 },
            { id: 'r-daily', last_generated_index: 2, schedule_version: 0 },
            { id: 'r-new', last_generated_index: -1, schedule_version: 0 },
            { id: 'r-w2', last_generated_index: 0, schedule_version: 0 },
        ]);

        const { rows: indexRows } = await db.execute(
            "SELECT name FROM sqlite_master WHERE type = 'index' AND name = 'idx_transactions_recurring_occurrence'",
        );
        expect(indexRows).toHaveLength(1);

        const result = await processRecurringRules({
            recurringRepo: new RecurringTransactionRepository(db),
            transactionRepo: new TransactionRepository(db),
            walletRepo: new WalletRepository(db),
            categoryRepo: new CategoryRepository(db),
            eventBus: { emit: jest.fn(), emitMultiple: jest.fn() },
            runInTransaction: db.runInTransaction.bind(db),
        });
        expect(result.errors).toEqual([]);

        // Unfixed expectation, by hand:
        //   r-31    after 31 Mar: 30 Apr (clamped), 31 May; 30 Jun is after today.
        //   r-w2    after 1 Jun: 15 Jun; 29 Jun is after today.
        //   r-new   25 Jun is after today: nothing.
        //   r-daily through 20 Jun already: nothing.
        const { rows: allRows } = await db.execute(
            `SELECT id, note, date, recurring_rule_id, recurring_schedule_version, recurring_occurrence_index
             FROM transactions ORDER BY date`,
        );
        const fresh = allRows
            .filter((r) => !seededIds.has(String(r.id)))
            .map(({ id: _id, ...rest }) => rest);
        expect(fresh).toEqual([
            {
                note: 'Rent 31st',
                date: localDay(2026, 3, 30).toISOString(),
                recurring_rule_id: 'r-31',
                recurring_schedule_version: 0,
                recurring_occurrence_index: 3,
            },
            {
                note: 'Rent 31st',
                date: localDay(2026, 4, 31).toISOString(),
                recurring_rule_id: 'r-31',
                recurring_schedule_version: 0,
                recurring_occurrence_index: 4,
            },
            {
                note: 'Cleaner',
                date: localDay(2026, 5, 15).toISOString(),
                recurring_rule_id: 'r-w2',
                recurring_schedule_version: 0,
                recurring_occurrence_index: 1,
            },
        ]);
        expect(result.transactionsGenerated).toBe(3);
        const { rows: countRows } = await db.execute('SELECT COUNT(*) AS n FROM transactions');
        expect(Number(countRows[0].n)).toBe(seededIds.size + 3);
    });
});

/**
 * v5 inserts through the CURRENT mappers. A database left at schema version 4
 * - v5 failed on an earlier boot and is retried - still has the baseline
 * tables when v5 runs, so the columns the mappers now write must be there
 * first. Passes on the unfixed code by construction: a non-regression control
 * for the v5 change the fix makes.
 */
describe('V-98 d. control: v5 retried at schema version 4 (process zone; CI: UTC, Africa/Lagos, America/New_York)', () => {
    it('control (non-regression): v5 still imports into tables created by the v4 baseline', async () => {
        const db = await baselineDb();
        const storage = new InMemoryStorage();
        const iso = new Date(2026, 0, 1).toISOString();

        const wallets: SerializableWallet[] = [
            { id: WALLET_ID, name: 'Main', balance: 99000, type: WalletType.BANK, createdAt: iso },
        ];
        const categories: SerializableCategory[] = [
            { id: CATEGORY_ID, name: 'Bills', type: CategoryType.EXPENSE },
        ];
        const transactions: SerializableTransaction[] = [
            {
                id: 't-1',
                type: TransactionType.EXPENSE,
                amount: 1000,
                categoryId: CATEGORY_ID,
                walletId: WALLET_ID,
                date: iso,
                createdAt: iso,
            },
        ];
        const recurring: SerializableRecurringTransaction[] = [
            {
                id: 'rr-1',
                type: TransactionType.EXPENSE,
                amount: 1000,
                walletId: WALLET_ID,
                categoryId: CATEGORY_ID,
                description: 'Rent',
                startDate: iso,
                frequency: RecurrenceFrequency.MONTHLY,
                interval: 1,
                lastGeneratedDate: iso,
                isPaused: false,
                createdAt: iso,
            },
        ];
        await storage.set(StorageKeys.WALLETS, wallets);
        await storage.set(StorageKeys.CATEGORIES, categories);
        await storage.set(StorageKeys.TRANSACTIONS, transactions);
        await storage.set(StorageKeys.BUDGETS, []);
        await storage.set(StorageKeys.RECURRING_RULES, recurring);
        await storage.set(StorageKeys.SCHEMA_VERSION, 4);

        await v5_import_from_asyncstorage.up({ storage, db });

        const { rows: rules } = await db.execute('SELECT id FROM recurring_rules');
        const { rows: txs } = await db.execute('SELECT id FROM transactions');
        expect(rules).toEqual([{ id: 'rr-1' }]);
        expect(txs).toEqual([{ id: 't-1' }]);
    });
});
