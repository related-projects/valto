/**
 * Restore Path Integrity Tests
 *
 * The restore writes through the SQL mappers instead of the repositories, which
 * is deliberate (the wallet ledger anchor has to be derived, not defaulted) but
 * also skips the ONLY place the entity invariants were enforced: the repository
 * calls validateTransaction, the restore did not. A backup carrying a negative,
 * fractional or unknown-typed transaction therefore entered the ledger intact -
 * and stayed invisible, because opening_balance is derived with the same
 * ledgerEffect that consumed the bad value, so no drift is ever reported.
 *
 * The second half is the unit the amounts are counted in. Amounts are integers
 * in MINOR units and only the currency says how many minor units make a major
 * one, so a snapshot carrying data but no settings block carries no scale for
 * its own numbers.
 *
 * Every assertion here is on STATE after the call - row counts and stored
 * values, before and after - not on whether a validator was invoked.
 */

import { createTestDb } from '../../../tests/helpers/createTestDb';
import { TransactionType, WalletType } from '../../domain/entities';
import type { SqlDatabase } from '../storage/sql/SqlDatabase';

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
jest.mock('expo-sharing', () => ({
    shareAsync: jest.fn().mockResolvedValue(undefined),
    isAvailableAsync: jest.fn().mockResolvedValue(true),
}));

jest.mock('../../core/events', () => ({
    dataEvents: { emit: jest.fn(), emitMultiple: jest.fn() },
}));

import AsyncStorage from '@react-native-async-storage/async-storage';
import {
    CURRENT_SCHEMA_VERSION,
    restoreFromSnapshot,
    SnapshotRejectedError,
    validateSnapshot,
    type BackupSnapshot,
} from '../services/backupService';
import { getDefaultSettings } from '../services/settingsService';
import { asyncStorageAdapter, StorageKeys } from '../storage';
import { __setDatabaseForTests } from '../storage/sql/database';

const ISO = '2026-01-01T00:00:00.000Z';

/** A well-formed snapshot: one wallet, one category, one clean expense. */
const snapshot = (): BackupSnapshot => ({
    version: CURRENT_SCHEMA_VERSION,
    createdAt: ISO,
    appVersion: '1.0.0',
    data: {
        wallets: [
            { id: 'w-cash', name: 'Cash', balance: 85000, type: WalletType.CASH, createdAt: ISO },
        ],
        transactions: [
            {
                id: 't-exp',
                type: TransactionType.EXPENSE,
                amount: 15000,
                categoryId: 'food',
                walletId: 'w-cash',
                date: ISO,
                createdAt: ISO,
            },
        ],
        categories: [{ id: 'food', name: 'Food', type: 'expense' as never }],
        budgets: [],
        settings: getDefaultSettings(),
    },
});

/**
 * A snapshot whose single transaction carries `patch` on top of a clean one.
 * Referential integrity stays intact, so the ONLY thing left to refuse it is the
 * invariant under test.
 */
const snapshotWithTransaction = (patch: Record<string, unknown>): BackupSnapshot => {
    const snap = snapshot();
    snap.data.transactions = [{ ...snap.data.transactions[0], ...patch } as never];
    return snap;
};

/** Pre-restore ledger, so "database unchanged" has something to be measured against. */
async function seedPreRestoreState(db: SqlDatabase) {
    await db.execute(
        `INSERT INTO wallets (id, name, balance, opening_balance, type, color, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        ['w-old', 'Old Wallet', 4200, 4200, 'cash', null, ISO],
    );
    await db.execute(`INSERT INTO categories (id, name, type) VALUES (?, ?, ?)`, [
        'cat-old',
        'Old Category',
        'expense',
    ]);
    await db.execute(
        `INSERT INTO transactions (id, type, amount, category_id, wallet_id, date, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        ['tx-old', 'expense', 900, 'cat-old', 'w-old', ISO, ISO],
    );
    await db.execute(
        `INSERT INTO budgets (id, category_id, month, limit_amount, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
        ['b-old', 'cat-old', '2025-12', 1000, ISO, ISO],
    );
}

/** Row counts of the four snapshot tables, keyed by table name. */
async function tableCounts(db: SqlDatabase): Promise<Record<string, number>> {
    const counts: Record<string, number> = {};
    for (const table of ['wallets', 'transactions', 'categories', 'budgets']) {
        const { rows } = await db.execute(`SELECT COUNT(*) AS c FROM ${table}`);
        counts[table] = Number(rows[0].c);
    }
    return counts;
}

let db: SqlDatabase;

beforeEach(async () => {
    jest.clearAllMocks();
    await AsyncStorage.clear();
    db = await createTestDb();
    __setDatabaseForTests(db);
});

afterEach(() => {
    __setDatabaseForTests(null);
});

describe('restoreFromSnapshot enforces the transaction invariants', () => {
    // Each case is a value that reached the ledger unchallenged before this
    // change. The rules come from validateTransaction, the same function
    // TransactionRepository.save calls - not a second copy of them.
    const cases: [string, Record<string, unknown>][] = [
        ['a negative amount', { amount: -5000 }],
        ['a fractional amount', { amount: 12.5 }],
        ['a non-finite amount', { amount: Number.POSITIVE_INFINITY }],
        ['an unknown transaction type', { type: 'refund' }],
        // An EMPTY id was already refused by validateSnapshot's truthiness
        // check, so it is not listed here; a non-string one is truthy and got
        // straight through.
        ['a non-string id', { id: 12345 }],
    ];

    it.each(cases)('refuses %s', async (_label, patch) => {
        await expect(restoreFromSnapshot(snapshotWithTransaction(patch))).rejects.toThrow(
            /Restore refused|Invalid backup snapshot/,
        );
    });

    it.each(cases)('leaves the database untouched when the snapshot carries %s', async (_label, patch) => {
        await seedPreRestoreState(db);
        const before = await tableCounts(db);

        await expect(restoreFromSnapshot(snapshotWithTransaction(patch))).rejects.toThrow();

        expect(await tableCounts(db)).toEqual(before);

        // Not just the counts: the pre-restore rows themselves are still there,
        // so a DELETE-then-reinsert that happened to end on the same totals
        // cannot pass.
        const { rows } = await db.execute('SELECT id, balance FROM wallets');
        expect(rows).toEqual([{ id: 'w-old', balance: 4200 }]);
        const txns = await db.execute('SELECT id, amount FROM transactions');
        expect(txns.rows).toEqual([{ id: 'tx-old', amount: 900 }]);
    });

    it('names the offending entity rather than reporting a write failure', async () => {
        await expect(restoreFromSnapshot(snapshotWithTransaction({ amount: -5000 }))).rejects.toThrow(
            'Restore refused: the backup contains an invalid transaction (amount). Your previous data has been preserved.',
        );
    });

    it('refuses a wallet that fails its own domain invariants', async () => {
        const snap = snapshot();
        snap.data.wallets = [{ ...snap.data.wallets[0], name: '   ' } as never];

        await expect(restoreFromSnapshot(snap)).rejects.toThrow(
            'Restore refused: the backup contains an invalid wallet (name). Your previous data has been preserved.',
        );
    });

    it('still restores a valid snapshot', async () => {
        await seedPreRestoreState(db);

        await restoreFromSnapshot(snapshot());

        expect(await tableCounts(db)).toEqual({
            wallets: 1,
            transactions: 1,
            categories: 1,
            budgets: 0,
        });
        const { rows } = await db.execute('SELECT id, balance, opening_balance FROM wallets');
        expect(rows).toEqual([{ id: 'w-cash', balance: 85000, opening_balance: 100000 }]);
    });
});

describe('validateSnapshot requires the unit the amounts are counted in', () => {
    it('refuses a snapshot that carries data but no settings block', () => {
        const snap = snapshot();
        delete snap.data.settings;

        const result = validateSnapshot(snap);

        expect(result.valid).toBe(false);
        expect(result.reason).toBe('missingCurrency');
        expect(result.errors[0]).toContain('which currency its amounts are in');
    });

    it('refuses a settings block that carries no currency', () => {
        const snap = snapshot();
        snap.data.settings = { ...getDefaultSettings(), currency: '' };

        const result = validateSnapshot(snap);

        expect(result.valid).toBe(false);
        expect(result.reason).toBe('missingCurrency');
    });

    it('accepts an empty snapshot without a settings block - no amounts, no unit needed', () => {
        const snap = snapshot();
        snap.data = { wallets: [], transactions: [], categories: [], budgets: [] };

        expect(validateSnapshot(snap).valid).toBe(true);
    });

    it('refuses a currency code the registry does not carry', () => {
        const snap = snapshot();
        snap.data.settings = { ...getDefaultSettings(), currency: 'ZZZ' };

        const result = validateSnapshot(snap);

        expect(result.valid).toBe(false);
        // Distinct from missingCurrency: the diagnostics must tell "no currency
        // recorded" from "a currency this build has never heard of".
        expect(result.reason).toBe('unknownCurrency');
        expect(result.errors[0]).toContain('ZZZ');
    });

    it('accepts every currency the registry does carry, whatever its exponent', () => {
        // The check must not refuse a legitimate code. XOF is 0-decimal, KWD is
        // 3-decimal, USD is the fallback the lookup returns for unknown codes -
        // all three have to pass, or the guard is refusing real backups.
        for (const code of ['XOF', 'KWD', 'EUR', 'USD']) {
            const snap = snapshot();
            snap.data.settings = { ...getDefaultSettings(), currency: code };

            expect(validateSnapshot(snap).valid).toBe(true);
        }
    });
});

describe('restoreFromSnapshot refuses a snapshot with no currency', () => {
    it('rejects before writing anything, and tags the reason for the UI', async () => {
        await seedPreRestoreState(db);
        const before = await tableCounts(db);

        const snap = snapshot();
        delete snap.data.settings;

        await expect(restoreFromSnapshot(snap)).rejects.toThrow(SnapshotRejectedError);
        await expect(restoreFromSnapshot(snap)).rejects.toMatchObject({
            reason: 'missingCurrency',
        });

        expect(await tableCounts(db)).toEqual(before);
        expect(await asyncStorageAdapter.get(StorageKeys.SETTINGS)).toBeNull();
    });

    it('rejects an unrecognised currency code, leaving the database unchanged', async () => {
        await seedPreRestoreState(db);
        const before = await tableCounts(db);

        const snap = snapshot();
        snap.data.settings = { ...getDefaultSettings(), currency: 'ZZZ' };

        await expect(restoreFromSnapshot(snap)).rejects.toThrow(SnapshotRejectedError);
        await expect(restoreFromSnapshot(snap)).rejects.toMatchObject({
            reason: 'unknownCurrency',
        });

        expect(await tableCounts(db)).toEqual(before);
        const { rows } = await db.execute('SELECT id, balance FROM wallets');
        expect(rows).toEqual([{ id: 'w-old', balance: 4200 }]);
        expect(await asyncStorageAdapter.get(StorageKeys.SETTINGS)).toBeNull();
    });

    it('still restores a snapshot denominated in a valid non-default currency', async () => {
        await seedPreRestoreState(db);

        const snap = snapshot();
        // XOF: a real registry entry, 0-decimal, and not the USD default the
        // lookup falls back to - so this passes only because the code resolved
        // to itself, not because the fallback happened to match.
        snap.data.settings = { ...getDefaultSettings(), currency: 'XOF' };

        await restoreFromSnapshot(snap);

        expect(await tableCounts(db)).toEqual({
            wallets: 1,
            transactions: 1,
            categories: 1,
            budgets: 0,
        });
        expect(await asyncStorageAdapter.get(StorageKeys.SETTINGS)).toMatchObject({
            currency: 'XOF',
        });
    });
});
