/**
 * Recurring Rules In The Backup Snapshot
 *
 * A recurring rule is a standing order. Until v2 of the snapshot format the
 * backup file did not carry them at all: a restore replaced the whole ledger and
 * left every rule pointing at a wallet and a category the file had never heard
 * of, which the engine then refused on every run with nothing said to the user.
 *
 * What these tests pin, end to end and through the real repositories:
 *  - a rule survives backup then restore with every field intact, isPaused and
 *    an absent endDate included;
 *  - a v2 file whose rule points at a wallet the file does not carry is refused
 *    before anything is written;
 *  - a v1 file, which carries no rules at all, still restores and does NOT take
 *    the live rules down with it. That is the data-loss guard: v1 files are
 *    still accepted by the version range check, and clearing a table the file
 *    cannot repopulate would delete standing orders outright.
 */

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

jest.mock('expo-file-system', () => ({
    File: jest.fn().mockImplementation(() => ({
        uri: 'file:///mock/cache/backup.json',
        write: (content: string) => {
            mockWrittenBackups.push(content);
        },
    })),
    Paths: { cache: '/mock/cache' },
}));

jest.mock('expo-sharing', () => ({
    shareAsync: jest.fn().mockResolvedValue(undefined),
    isAvailableAsync: jest.fn().mockResolvedValue(true),
}));

// Silence the reactive event bus.
jest.mock('../../core/events', () => ({
    dataEvents: { emit: jest.fn(), emitMultiple: jest.fn() },
}));

import AsyncStorage from '@react-native-async-storage/async-storage';
import { createTestDb } from '../../../tests/helpers/createTestDb';
import { container } from '../../core/di/container';
import { CategoryType } from '../../domain/entities/Category';
import {
    RecurrenceFrequency,
    serializeRecurringTransaction,
    type RecurringTransaction,
} from '../../domain/entities/RecurringTransaction';
import { TransactionType } from '../../domain/entities/Transaction';
import { WalletType } from '../../domain/entities/Wallet';
import { CategoryRepository } from '../repositories/CategoryRepository';
import { RecurringTransactionRepository } from '../repositories/RecurringTransactionRepository';
import { WalletRepository } from '../repositories/WalletRepository';
import {
    CURRENT_SCHEMA_VERSION,
    createAndShareBackup,
    restoreFromSnapshot,
    SnapshotRejectedError,
    type BackupSnapshot,
} from '../services/backupService';
import { getDefaultSettings } from '../services/settingsService';
import { __setDatabaseForTests } from '../storage/sql/database';
import type { SqlDatabase } from '../storage/sql/SqlDatabase';

const ISO = '2026-01-01T00:00:00.000Z';

/**
 * Both fixtures start in 2030, so neither has an occurrence due while the suite
 * runs. The restore now runs the recurring engine once it has committed; a rule
 * with a past occurrence would have its watermark advanced before the
 * round-trip assertions could read it back, and the test would be measuring the
 * engine rather than the format.
 */
const RULE_WITH_END: RecurringTransaction = {
    id: 'rr-with-end',
    type: TransactionType.EXPENSE,
    amount: 4500,
    walletId: 'w-cash',
    categoryId: 'food',
    description: 'Gym membership',
    startDate: new Date('2030-01-15T00:00:00.000Z'),
    endDate: new Date('2031-01-15T00:00:00.000Z'),
    frequency: RecurrenceFrequency.MONTHLY,
    interval: 2,
    lastGeneratedDate: new Date('2029-11-15T00:00:00.000Z'),
    isPaused: false,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
};

/** No endDate, no description, and paused - the three fields most easily lost. */
const RULE_WITHOUT_END: RecurringTransaction = {
    id: 'rr-no-end',
    type: TransactionType.INCOME,
    amount: 120000,
    walletId: 'w-cash',
    categoryId: 'salary',
    startDate: new Date('2030-02-01T00:00:00.000Z'),
    frequency: RecurrenceFrequency.WEEKLY,
    interval: 1,
    lastGeneratedDate: new Date('2030-01-25T00:00:00.000Z'),
    isPaused: true,
    createdAt: new Date('2026-01-02T00:00:00.000Z'),
};

/** The wallet and categories both fixtures point at. */
async function seedLedger(database: SqlDatabase) {
    await new WalletRepository(database).save({
        id: 'w-cash',
        name: 'Cash',
        balance: 100000,
        type: WalletType.CASH,
        createdAt: new Date(ISO),
    });
    const categories = new CategoryRepository(database);
    await categories.save({ id: 'food', name: 'Food', type: CategoryType.EXPENSE });
    await categories.save({ id: 'salary', name: 'Salary', type: CategoryType.INCOME });
}

/**
 * A v1 file: the shape the app wrote before recurring rules joined the format.
 * The cast is the point of the fixture - `data` has no `recurringRules` key at
 * all, which is exactly what a file written by an older build looks like.
 */
const v1Snapshot = (walletId = 'w-cash'): BackupSnapshot =>
    ({
        version: 1,
        createdAt: ISO,
        appVersion: '1.0.0',
        data: {
            wallets: [
                { id: walletId, name: 'Cash', balance: 100000, type: WalletType.CASH, createdAt: ISO },
            ],
            transactions: [],
            categories: [
                { id: 'food', name: 'Food', type: CategoryType.EXPENSE },
                { id: 'salary', name: 'Salary', type: CategoryType.INCOME },
            ],
            budgets: [],
            settings: getDefaultSettings(),
        },
    }) as unknown as BackupSnapshot;

/** A v2 file carrying both rule fixtures and the ledger they reference. */
const v2Snapshot = (): BackupSnapshot => ({
    version: CURRENT_SCHEMA_VERSION,
    createdAt: ISO,
    appVersion: '1.0.0',
    data: {
        wallets: [
            { id: 'w-cash', name: 'Cash', balance: 100000, type: WalletType.CASH, createdAt: ISO },
        ],
        transactions: [],
        categories: [
            { id: 'food', name: 'Food', type: CategoryType.EXPENSE },
            { id: 'salary', name: 'Salary', type: CategoryType.INCOME },
        ],
        budgets: [],
        recurringRules: [
            serializeRecurringTransaction(RULE_WITH_END),
            serializeRecurringTransaction(RULE_WITHOUT_END),
        ],
        settings: getDefaultSettings(),
    },
});

let db: SqlDatabase;
let rules: RecurringTransactionRepository;

beforeEach(async () => {
    jest.clearAllMocks();
    mockWrittenBackups.length = 0;
    await AsyncStorage.clear();
    db = await createTestDb();
    __setDatabaseForTests(db);
    // The backup producer and the post-restore catch-up both go through the DI
    // container, which caches a repository over whichever connection was live
    // when it was first asked. Without this they would read the previous test's
    // database.
    container.reset();
    rules = new RecurringTransactionRepository(db);
});

afterEach(() => {
    __setDatabaseForTests(null);
    container.reset();
});

describe('a recurring rule survives the backup file', () => {
    it('round-trips every field, with and without an endDate', async () => {
        await seedLedger(db);
        await rules.save(RULE_WITH_END);
        await rules.save(RULE_WITHOUT_END);

        await createAndShareBackup();

        expect(mockWrittenBackups).toHaveLength(1);
        const file = JSON.parse(mockWrittenBackups[0]) as BackupSnapshot;
        expect(file.version).toBe(CURRENT_SCHEMA_VERSION);
        expect(file.data.recurringRules).toHaveLength(2);

        // Cleared first, so nothing can pass by having survived rather than by
        // having been put back.
        await db.execute('DELETE FROM recurring_rules');
        expect(await rules.getAll()).toHaveLength(0);

        await restoreFromSnapshot(file);

        const restored = (await rules.getAll()).sort((a, b) => a.id.localeCompare(b.id));
        expect(restored).toHaveLength(2);

        // 'rr-no-end' sorts before 'rr-with-end'.
        expect(restored[0]).toEqual(RULE_WITHOUT_END);
        expect(restored[0].isPaused).toBe(true);
        expect(restored[0].endDate).toBeUndefined();
        expect(restored[0].description).toBeUndefined();

        expect(restored[1]).toEqual(RULE_WITH_END);
        expect(restored[1].isPaused).toBe(false);
        expect(restored[1].endDate).toEqual(new Date('2031-01-15T00:00:00.000Z'));
        expect(restored[1].interval).toBe(2);
        expect(restored[1].lastGeneratedDate).toEqual(new Date('2029-11-15T00:00:00.000Z'));
    });

    it('replaces the live rules with the ones the v2 file carries', async () => {
        await seedLedger(db);
        await rules.save({ ...RULE_WITH_END, id: 'rr-stale', description: 'Gone after restore' });

        await restoreFromSnapshot(v2Snapshot());

        const ids = (await rules.getAll()).map((r) => r.id).sort();
        expect(ids).toEqual(['rr-no-end', 'rr-with-end']);
    });
});

describe('a v1 file does not delete the live recurring rules', () => {
    it('restores the four tables it carries and leaves recurring_rules alone', async () => {
        // The premise of this test is a file OLDER than the app reading it. Once
        // the constant is no longer above 1 the fixture stops being a v1 file and
        // the guard silently stops guarding, so the premise is asserted.
        expect(CURRENT_SCHEMA_VERSION).toBeGreaterThan(1);

        await seedLedger(db);
        await rules.save(RULE_WITH_END);
        await rules.save(RULE_WITHOUT_END);

        await restoreFromSnapshot(v1Snapshot());

        const survived = (await rules.getAll()).map((r) => r.id).sort();
        expect(survived).toEqual(['rr-no-end', 'rr-with-end']);
    });
});

describe('a v2 file with a rule pointing nowhere is refused', () => {
    it('rejects the file and leaves the pre-restore data untouched', async () => {
        await seedLedger(db);
        await rules.save(RULE_WITH_END);

        const bad = v2Snapshot();
        bad.data.recurringRules = [
            { ...serializeRecurringTransaction(RULE_WITH_END), walletId: 'w-missing' },
        ];

        await expect(restoreFromSnapshot(bad)).rejects.toThrow(SnapshotRejectedError);

        // The pre-restore ledger is intact: refusal happens before any write.
        const wallets = await new WalletRepository(db).getAll();
        expect(wallets.map((w) => w.id)).toEqual(['w-cash']);
        const survived = await rules.getAll();
        expect(survived).toHaveLength(1);
        expect(survived[0].id).toBe('rr-with-end');
    });

    it('rejects a rule whose category the file does not carry', async () => {
        await seedLedger(db);

        const bad = v2Snapshot();
        bad.data.recurringRules = [
            { ...serializeRecurringTransaction(RULE_WITH_END), categoryId: 'cat-missing' },
        ];

        await expect(restoreFromSnapshot(bad)).rejects.toThrow(SnapshotRejectedError);
    });
});

describe('the post-restore reference report', () => {
    it('reports no unresolved rule after a v2 restore, because the file was gated', async () => {
        await seedLedger(db);

        const outcome = await restoreFromSnapshot(v2Snapshot());

        expect(outcome.rulesNotProcessed).toBe(0);
        expect(await rules.findWithMissingReferences()).toHaveLength(0);
    });

    it('reports the rule a v1 restore orphaned', async () => {
        expect(CURRENT_SCHEMA_VERSION).toBeGreaterThan(1);

        await seedLedger(db);
        await rules.save(RULE_WITH_END);

        // The v1 file carries a different wallet, so the surviving rule is left
        // pointing at one the restore has just deleted.
        const outcome = await restoreFromSnapshot(v1Snapshot('w-other'));

        expect(outcome.rulesNotProcessed).toBe(1);
        const unresolved = await rules.findWithMissingReferences();
        expect(unresolved.map((r) => r.id)).toEqual(['rr-with-end']);
    });
});
