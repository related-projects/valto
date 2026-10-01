/**
 * V-98 f: a backup the app writes, restored after a zone shift, brings no
 * occurrence back a second time - and a file written before the occurrence
 * key existed still restores, its rules getting the same starting number the
 * v7 backfill would give them.
 *
 * Nothing is hand-built (register V-41). The file is produced by
 * createAndShareBackup, the only writer of a backup file, and read back by
 * pickAndRestoreBackup, the only reader. Every row in it comes from a
 * production writer of the fields this fix adds:
 *  - migration v7's backfill (a rule and its occurrences left by the unfixed
 *    engine in a v6 database, then migrated);
 *  - RecurringTransactionRepository.create, the recurring engine,
 *    updateFromDTO with a schedule change, and pauseRule;
 *  - createTransaction and transferFunds, whose rows carry no key.
 *
 * Zones (register policy no. 9): fixtures use the LOCAL Date constructor and
 * the clock is pinned with pinClock, so the suite holds in whatever zone the
 * process runs in. CI runs it under TZ=UTC, Africa/Lagos and America/New_York.
 * The zone shift is simulated in the file: every instant the engine wrote as a
 * local midnight is moved 6 h earlier, as a writer zone 6 h east would have
 * written it.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import * as DocumentPicker from 'expo-document-picker';
import { BetterSqliteDatabase } from '../../../tests/helpers/BetterSqliteDatabase';
import { pinClock, restoreZoneClock } from '../../../tests/helpers/zoneClock';
import { container } from '../../core/di/container';
import { CategoryType } from '../../domain/entities/Category';
import { RecurrenceFrequency } from '../../domain/entities/RecurringTransaction';
import { TransactionType } from '../../domain/entities/Transaction';
import { WalletType } from '../../domain/entities/Wallet';
import { createTransaction } from '../../domain/useCases/createTransaction';
import { createWallet } from '../../domain/useCases/createWallet';
import { transferFunds } from '../../domain/useCases/transferFunds';
import { useRecurringRules } from '../../hooks/useRecurringRules';
import { runMigrations } from '../migrations';
import { CategoryRepository } from '../repositories/CategoryRepository';
import { processRecurringRules } from '../services/RecurringTransactionEngine';
import { type BackupSnapshot, createAndShareBackup, pickAndRestoreBackup } from '../services/backupService';
import { asyncStorageAdapter, StorageKeys } from '../storage';
import { __setDatabaseForTests } from '../storage/sql/database';
import { SCHEMA_STATEMENTS } from '../storage/sql/schema';

jest.mock('expo-notifications', () => ({
    getPermissionsAsync: jest.fn().mockResolvedValue({ status: 'denied' }),
    requestPermissionsAsync: jest.fn(),
    scheduleNotificationAsync: jest.fn().mockResolvedValue('mock-id'),
    cancelAllScheduledNotificationsAsync: jest.fn().mockResolvedValue(undefined),
    cancelScheduledNotificationAsync: jest.fn().mockResolvedValue(undefined),
    setNotificationChannelAsync: jest.fn().mockResolvedValue(undefined),
    setNotificationHandler: jest.fn(),
    SchedulableTriggerInputTypes: { TIME_INTERVAL: 'timeInterval', DAILY: 'daily' },
    AndroidImportance: { HIGH: 6 },
}));

jest.mock('expo-document-picker', () => ({ getDocumentAsync: jest.fn() }));

/** Every JSON body createAndShareBackup wrote, newest last. */
const mockWrittenBackups: string[] = [];
/** What the file the user picks for a restore contains. */
let mockPickedContent = '';

jest.mock('expo-file-system', () => ({
    File: jest.fn().mockImplementation(() => ({
        uri: 'file:///mock/cache/backup.json',
        write: (content: string) => {
            mockWrittenBackups.push(content);
        },
        exists: true,
        get size() {
            return mockPickedContent.length;
        },
        text: async () => mockPickedContent,
    })),
    Paths: { cache: '/mock/cache' },
}));

jest.mock('expo-sharing', () => ({
    shareAsync: jest.fn().mockResolvedValue(undefined),
    isAvailableAsync: jest.fn().mockResolvedValue(true),
}));

// Silence the reactive event bus. `subscribe` is there for the hooks case m
// mounts, which subscribe on mount.
jest.mock('../../core/events', () => ({
    dataEvents: { emit: jest.fn(), emitMultiple: jest.fn(), subscribe: () => () => undefined },
}));

const SIX_HOURS_MS = 6 * 60 * 60 * 1000;
const RECURRING_NOTES = ['Rent', 'Club', 'Parking', 'Legacy'];

let db: BetterSqliteDatabase;

function writerDeps() {
    return {
        walletRepo: container.walletRepository,
        transactionRepo: container.transactionRepository,
        eventBus: { emit: jest.fn(), emitMultiple: jest.fn() },
        runInTransaction: <T>(work: () => Promise<T>) => db.runInTransaction(work),
    };
}

function engineDeps() {
    return {
        recurringRepo: container.recurringTransactionRepository,
        transactionRepo: container.transactionRepository,
        walletRepo: container.walletRepository,
        categoryRepo: container.categoryRepository,
        eventBus: { emit: jest.fn(), emitMultiple: jest.fn() },
        runInTransaction: <T>(work: () => Promise<T>) => db.runInTransaction(work),
    };
}

/** Occurrence rows per rule note, plus every wallet balance by name. */
async function ledgerState() {
    const transactions = await container.transactionRepository.getAll();
    const counts: Record<string, number> = {};
    for (const note of RECURRING_NOTES) {
        counts[note] = transactions.filter((t) => t.note === note).length;
    }
    const balances: Record<string, number> = {};
    for (const w of await container.walletRepository.getAll()) {
        balances[w.name] = w.balance;
    }
    return { counts, balances, total: transactions.length };
}

/**
 * The whole history, written the way the app writes it, into a database that
 * started at v6 and was migrated. Pinned to 20 June 2026, local noon.
 */
async function seedThroughProductionWriters(): Promise<void> {
    pinClock(new Date(2026, 5, 20, 12, 0).getTime());

    // -- A v6 install: one rule and the two occurrences the unfixed engine
    //    wrote for it (5 Feb, 5 Mar), watermark on 5 Mar local midnight. --
    for (const statement of SCHEMA_STATEMENTS) {
        await db.execute(statement);
    }
    await db.execute(
        `INSERT INTO wallets (id, name, balance, opening_balance, type, color, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        ['w-legacy', 'Legacy wallet', 998000, 1000000, WalletType.BANK, null, new Date(2025, 0, 1).toISOString()],
    );
    await db.execute('INSERT INTO categories (id, name, type, icon, color) VALUES (?, ?, ?, ?, ?)', [
        'cat-legacy',
        'Legacy bills',
        CategoryType.EXPENSE,
        null,
        null,
    ]);
    await db.execute(
        `INSERT INTO recurring_rules
            (id, type, amount, wallet_id, category_id, description, start_date, end_date,
             frequency, interval_count, last_generated_date, is_paused, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
            'r-legacy',
            TransactionType.EXPENSE,
            1000,
            'w-legacy',
            'cat-legacy',
            'Legacy',
            new Date(2026, 1, 5, 9, 0).toISOString(),
            null,
            RecurrenceFrequency.MONTHLY,
            1,
            new Date(2026, 2, 5).toISOString(),
            0,
            new Date(2026, 1, 1).toISOString(),
        ],
    );
    for (const [id, date] of [
        ['legacy-1', new Date(2026, 1, 5)],
        ['legacy-2', new Date(2026, 2, 5)],
    ] as const) {
        await db.execute(
            `INSERT INTO transactions (id, type, amount, category_id, wallet_id, date, note, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [id, TransactionType.EXPENSE, 1000, 'cat-legacy', 'w-legacy', date.toISOString(), 'Legacy', date.toISOString()],
        );
    }
    await asyncStorageAdapter.set(StorageKeys.SCHEMA_VERSION, 6);
    await runMigrations();

    // -- The rest through the paths the UI uses. --------------------------
    const cash = await createWallet(writerDeps(), { name: 'Cash', balance: 100000, type: WalletType.CASH });
    const bank = await createWallet(writerDeps(), { name: 'Bank', balance: 5000000, type: WalletType.BANK });
    const bills = await new CategoryRepository(db).create({ name: 'Bills', type: CategoryType.EXPENSE });
    const rules = container.recurringTransactionRepository;

    const rule = (description: string, startDate: Date, frequency: RecurrenceFrequency, interval: number) =>
        rules.create({
            type: TransactionType.EXPENSE,
            amount: 2500,
            walletId: bank.id,
            categoryId: bills.id,
            description,
            startDate,
            frequency,
            interval,
        });

    // 10 Mar .. 10 Jun: 4 occurrences.
    await rule('Rent', new Date(2026, 2, 10, 12, 0), RecurrenceFrequency.MONTHLY, 1);
    // 10 Jan .. 10 Jun: 6 occurrences, then edited to every other month.
    const club = await rule('Club', new Date(2026, 0, 10, 12, 0), RecurrenceFrequency.MONTHLY, 1);
    // 18 .. 20 Jun: 3 occurrences, then paused.
    const parking = await rule('Parking', new Date(2026, 5, 18, 12, 0), RecurrenceFrequency.DAILY, 1);

    // Also catches the legacy rule up: 5 Apr, 5 May, 5 Jun.
    const generated = await processRecurringRules(engineDeps());
    expect(generated.errors).toEqual([]);

    await rules.updateFromDTO({ id: club.id, interval: 2 });
    await rules.pauseRule(parking.id);

    await createTransaction(writerDeps(), {
        type: TransactionType.EXPENSE,
        amount: 700,
        categoryId: bills.id,
        walletId: cash.id,
        date: new Date(2026, 5, 19, 9, 0),
    });
    await transferFunds(writerDeps(), { fromWalletId: cash.id, toWalletId: bank.id, amount: 5000 });
}

/** Write the file the way the app writes it; return its parsed body. */
async function writeBackup(): Promise<BackupSnapshot> {
    await createAndShareBackup();
    expect(mockWrittenBackups).toHaveLength(1);
    return JSON.parse(mockWrittenBackups[0]) as BackupSnapshot;
}

/** Hand `file` to the app the way a user picks it, and restore it. */
async function restoreFile(file: BackupSnapshot) {
    mockPickedContent = JSON.stringify(file, null, 2);
    (DocumentPicker.getDocumentAsync as jest.Mock).mockResolvedValue({
        canceled: false,
        assets: [{ uri: 'file:///mock/picked.json', name: 'valto-backup.json', size: 1, mimeType: 'application/json' }],
    });
    const outcome = await pickAndRestoreBackup();
    expect(outcome).not.toBeNull();
    return outcome!;
}

beforeEach(async () => {
    jest.clearAllMocks();
    mockWrittenBackups.length = 0;
    mockPickedContent = '';
    await AsyncStorage.clear();
    db = new BetterSqliteDatabase();
    __setDatabaseForTests(db);
    // The container caches repositories over whichever connection was live
    // when first asked; reset it so they read this test's database.
    container.reset();
});

afterEach(() => {
    restoreZoneClock();
    __setDatabaseForTests(null);
});

describe('V-98 f. restore (process zone; CI: UTC, Africa/Lagos, America/New_York)', () => {
    it('restore: a backup from a writer zone 6 h east restores without writing any occurrence twice', async () => {
        await seedThroughProductionWriters();
        const before = await ledgerState();
        expect(before.counts).toEqual({ Rent: 4, Club: 6, Parking: 3, Legacy: 5 });

        const file = await writeBackup();

        // The zone shift, in the file: everything the engine wrote as a local
        // midnight moves 6 h earlier.
        const shift = (iso: string) => new Date(new Date(iso).getTime() - SIX_HOURS_MS).toISOString();
        for (const r of file.data.recurringRules) {
            r.lastGeneratedDate = shift(r.lastGeneratedDate);
        }
        for (const t of file.data.transactions) {
            if (t.note !== undefined && RECURRING_NOTES.includes(t.note)) {
                t.date = shift(t.date);
            }
        }

        const outcome = await restoreFile(file);
        const again = await processRecurringRules(engineDeps());

        expect(outcome.catchUpFailed).toBe(false);
        expect(outcome.catchUpGenerated).toBe(0);
        expect(again.errors).toEqual([]);
        expect(again.transactionsGenerated).toBe(0);
        const after = await ledgerState();
        expect(after.counts).toEqual(before.counts);
        expect(after.balances).toEqual(before.balances);
        expect(after.total).toBe(before.total);
    });

    it('restore: a file without the occurrence key still restores, each rule getting the backfill index', async () => {
        await seedThroughProductionWriters();
        const before = await ledgerState();

        // The same production file, minus every field this fix adds - what a
        // 1.1.2 install writes: its serializers spread entities that did not
        // have these fields.
        const file = await writeBackup();
        for (const r of file.data.recurringRules as unknown as Record<string, unknown>[]) {
            delete r.lastGeneratedIndex;
            delete r.scheduleVersion;
        }
        for (const t of file.data.transactions as unknown as Record<string, unknown>[]) {
            delete t.recurringRuleId;
            delete t.recurringScheduleVersion;
            delete t.recurringOccurrenceIndex;
        }
        expect(JSON.stringify(file)).not.toMatch(/lastGeneratedIndex|scheduleVersion|recurringRuleId/);

        const outcome = await restoreFile(file);

        // By hand, from each rule's watermark day in the process zone:
        //   Rent    10 Mar(0) .. 10 Jun(3)                  -> 3
        //   Club    every other month now: 10 Jan(0), 10 Mar(1), 10 May(2); 10 Jun watermark -> 2
        //   Parking 18(0), 19(1), 20 Jun(2)                 -> 2
        //   Legacy  5 Feb(0) .. 5 Jun(4)                    -> 4
        const { rows } = await db.execute(
            'SELECT description, last_generated_index, schedule_version FROM recurring_rules ORDER BY description',
        );
        expect(rows).toEqual([
            { description: 'Club', last_generated_index: 2, schedule_version: 0 },
            { description: 'Legacy', last_generated_index: 4, schedule_version: 0 },
            { description: 'Parking', last_generated_index: 2, schedule_version: 0 },
            { description: 'Rent', last_generated_index: 3, schedule_version: 0 },
        ]);

        const again = await processRecurringRules(engineDeps());
        expect(outcome.catchUpGenerated).toBe(0);
        expect(again.transactionsGenerated).toBe(0);
        const after = await ledgerState();
        expect(after.counts).toEqual(before.counts);
        expect(after.balances).toEqual(before.balances);
    });
});

describe('V-105 m. edit after a restore (process zone; CI: UTC, Africa/Lagos, America/New_York)', () => {
    it('m. a schedule edit made after restoring a backup from a writer zone 6 h east debits no Club due date twice', async () => {
        await seedThroughProductionWriters();
        const file = await writeBackup();
        const shift = (iso: string) => new Date(new Date(iso).getTime() - SIX_HOURS_MS).toISOString();
        for (const r of file.data.recurringRules) {
            r.lastGeneratedDate = shift(r.lastGeneratedDate);
        }
        for (const t of file.data.transactions) {
            if (t.note !== undefined && RECURRING_NOTES.includes(t.note)) {
                t.date = shift(t.date);
            }
        }
        await restoreFile(file);

        const clubRows = async () =>
            (await container.transactionRepository.getAll()).filter((t) => t.note === 'Club');
        const known = new Set((await clubRows()).map((t) => t.id));
        expect(known.size).toBe(6);
        const club = (await container.recurringTransactionRepository.getAll()).find((r) => r.description === 'Club')!;

        // The edit, on 20 Jun, through the hook the rules screen calls: every
        // other month back to every month.
        const view = renderHook(() => useRecurringRules());
        await waitFor(() => {
            expect(view.result.current.loading).toBe(false);
        });
        await act(async () => {
            await view.result.current.updateRule({ id: club.id, interval: 1 });
        });
        await processRecurringRules(engineDeps());
        pinClock(new Date(2026, 6, 20, 12, 0).getTime());
        await processRecurringRules(engineDeps());

        // 10 Jan .. 10 Jun were debited before the backup; the first date after
        // the edit day is 10 Jul.
        const added = (await clubRows()).filter((t) => !known.has(t.id));
        expect(added.map((t) => t.date.getTime())).toEqual([new Date(2026, 6, 10).getTime()]);
    });
});
