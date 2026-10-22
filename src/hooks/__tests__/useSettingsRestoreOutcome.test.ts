/**
 * What a restore tells the user, and what it refreshes (REGISTRE V-119, Owner
 * decisions 4 and 5 of pass 79)
 *
 *  4. A restore that committed and then failed in a later step says the
 *     restore was done and names the failed step; the data events are emitted
 *     and the recurring catch-up runs. It used to read "Restore Failed. The
 *     file may be invalid.", emit nothing and skip the catch-up, while the
 *     restored ledger was committed.
 *  5. A refused restore emits every data event, so no screen keeps rows read
 *     while the restore was open and then rolled back.
 *
 * End to end: the real useSettings, pickAndRestoreBackup, restoreFromSnapshot,
 * recurring engine and an in-memory database. Only the file picker and the
 * file are mocked, to hand over a snapshot, and ensureUsableState, to fail the
 * step after the commit. `t` echoes the key and its parameters.
 *
 * Zones: the fixtures are local and relative to the real clock, so the suite
 * holds in whatever zone the process runs in (run under TZ=UTC, Africa/Lagos,
 * America/New_York).
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import { createTestDb } from '../../../tests/helpers/createTestDb';
import { container } from '../../core/di/container';
import { dataEvents } from '../../core/events/dataEvents';
import { CURRENT_SCHEMA_VERSION, type BackupSnapshot } from '../../data/services/backupService';
import { getDefaultSettings } from '../../data/services/settingsService';
import { __setDatabaseForTests } from '../../data/storage/sql/database';
import type { SqlDatabase } from '../../data/storage/sql/SqlDatabase';
import { CategoryType } from '../../domain/entities/Category';
import {
    RecurrenceFrequency,
    serializeRecurringTransaction,
    type RecurringTransaction,
} from '../../domain/entities/RecurringTransaction';
import { TransactionType } from '../../domain/entities/Transaction';
import { WalletType } from '../../domain/entities/Wallet';
import { useSettings } from '../useSettings';

// jest.mock calls are hoisted above these imports, so the modules above see the
// mocks below.

type AlertButton = { text?: string; onPress?: () => void | Promise<void> };
const alertCalls: [string, string | undefined, AlertButton[] | undefined][] = [];

jest.mock('react-native', () => ({
    Alert: {
        alert: jest.fn((title: string, message?: string, buttons?: AlertButton[]) => {
            alertCalls.push([title, message, buttons]);
        }),
    },
    Linking: { openSettings: jest.fn().mockResolvedValue(undefined) },
    AppState: {
        currentState: 'active',
        addEventListener: jest.fn(() => ({ remove: jest.fn() })),
    },
    Platform: { OS: 'android', select: (options: Record<string, unknown>) => options.android ?? options.default },
    ...jest.requireActual('@/tests/helpers/deviceLocaleMock').createDeviceLocaleMock(() => ({
        os: 'ios',
        value: 'en_US',
    })),
}));

jest.mock('expo-notifications', () => ({
    getPermissionsAsync: jest.fn().mockResolvedValue({ status: 'denied' }),
    requestPermissionsAsync: jest.fn().mockResolvedValue({ status: 'denied' }),
    cancelAllScheduledNotificationsAsync: jest.fn().mockResolvedValue(undefined),
    cancelScheduledNotificationAsync: jest.fn().mockResolvedValue(undefined),
    scheduleNotificationAsync: jest.fn().mockResolvedValue('mock-id'),
    setNotificationChannelAsync: jest.fn().mockResolvedValue(undefined),
    setNotificationHandler: jest.fn(),
    SchedulableTriggerInputTypes: { TIME_INTERVAL: 'timeInterval', DAILY: 'daily' },
    AndroidImportance: { HIGH: 6 },
}));

jest.mock('../../theme/theme', () => ({
    useTheme: () => ({ setThemePreference: jest.fn(), isDark: false, theme: {} }),
}));

jest.mock('i18next', () => ({
    __esModule: true,
    default: {
        changeLanguage: jest.fn().mockResolvedValue(undefined),
        language: 'en',
        t: (key: string) => key,
        getFixedT: () => (key: string) => key,
        use: jest.fn().mockReturnThis(),
        init: jest.fn().mockResolvedValue(undefined),
    },
}));

jest.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string, params?: Record<string, unknown>) =>
            params === undefined ? key : `${key} ${JSON.stringify(params)}`,
        i18n: { changeLanguage: jest.fn() },
    }),
}));

/** The snapshot JSON the mocked file hands over. */
let mockFileContent = '';

jest.mock('expo-document-picker', () => ({
    getDocumentAsync: jest.fn().mockResolvedValue({
        canceled: false,
        assets: [{ uri: 'file:///mock/backup.json', name: 'backup.json', size: 1, mimeType: 'application/json' }],
    }),
}));

jest.mock('expo-file-system', () => ({
    File: jest.fn().mockImplementation(() => ({
        uri: 'file:///mock/backup.json',
        exists: true,
        get size() {
            return mockFileContent.length;
        },
        text: async () => mockFileContent,
        write: jest.fn(),
    })),
    Paths: { cache: '/mock/cache' },
}));

jest.mock('expo-sharing', () => ({
    shareAsync: jest.fn().mockResolvedValue(undefined),
    isAvailableAsync: jest.fn().mockResolvedValue(true),
}));

const mockEnsureUsableState = jest.fn();
jest.mock('../../data/services/usableStateService', () => ({
    ensureUsableState: () => mockEnsureUsableState(),
}));

const { ensureUsableState: realEnsureUsableState } = jest.requireActual('../../data/services/usableStateService');

const DATA_EVENTS = ['wallets', 'transactions', 'categories', 'budgets', 'recurringRules'];
const ALL_EVENTS = [...DATA_EVENTS, 'settings'];
const ISO = '2026-01-01T00:00:00.000Z';

/** Local noon `days` days before today. */
function daysAgo(days: number): Date {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate() - days, 12, 0);
}

/** A daily expense from yesterday, nothing generated yet: yesterday and today are due. */
function dueRule(): RecurringTransaction {
    const start = daysAgo(1);
    const pad = (n: number) => String(n).padStart(2, '0');
    return {
        id: 'rr-gym',
        type: TransactionType.EXPENSE,
        amount: 1000,
        walletId: 'w-restored',
        categoryId: 'cat-restored',
        description: 'Gym',
        startDate: start,
        startDay: `${start.getFullYear()}-${pad(start.getMonth() + 1)}-${pad(start.getDate())}`,
        frequency: RecurrenceFrequency.DAILY,
        interval: 1,
        lastGeneratedDate: daysAgo(2),
        lastGeneratedIndex: -1,
        scheduleVersion: 0,
        isPaused: false,
        createdAt: new Date(ISO),
    };
}

/** A v2 file with one bank wallet, one category and one rule with two debits due. */
function snapshot(transactions: unknown[] = []): BackupSnapshot {
    return {
        version: CURRENT_SCHEMA_VERSION,
        createdAt: ISO,
        appVersion: '1.0.0',
        data: {
            wallets: [
                { id: 'w-restored', name: 'Restored', balance: 500000, type: WalletType.BANK, createdAt: ISO },
            ],
            transactions,
            categories: [{ id: 'cat-restored', name: 'Sport', type: CategoryType.EXPENSE }],
            budgets: [],
            recurringRules: [serializeRecurringTransaction(dueRule())],
            settings: getDefaultSettings(),
        },
    } as BackupSnapshot;
}

let db: SqlDatabase;

async function count(sql: string, params: unknown[] = []): Promise<number> {
    const { rows } = await db.execute(sql, params);
    return Number(rows[0].n);
}

/** Walk the two-step confirmation, then wait for the outcome alert. */
async function restore(): Promise<[string, string | undefined]> {
    const { result } = renderHook(() => useSettings());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
        result.current.restoreBackup();
    });
    const first = alertCalls[0][2]!;
    await act(async () => {
        await first[first.length - 1].onPress?.();
    });
    const second = alertCalls[1][2]!;
    await act(async () => {
        await second[second.length - 1].onPress?.();
    });

    await waitFor(() => expect(alertCalls.length).toBeGreaterThanOrEqual(3));
    const [title, message] = alertCalls[2];
    return [title, message];
}

let emitMultiple: jest.SpyInstance;

beforeEach(async () => {
    await AsyncStorage.clear();
    alertCalls.length = 0;
    mockEnsureUsableState.mockReset();
    mockEnsureUsableState.mockImplementation(realEnsureUsableState);
    jest.spyOn(console, 'log').mockImplementation(() => undefined);
    jest.spyOn(console, 'info').mockImplementation(() => undefined);
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    emitMultiple = jest.spyOn(dataEvents, 'emitMultiple');

    db = await createTestDb({ writeGuard: true });
    __setDatabaseForTests(db);
    container.reset();
    // The ledger in place before the restore.
    await db.runInTransaction(() => container.walletRepository.save({
        id: 'w-old',
        name: 'Old',
        balance: 1000,
        type: WalletType.BANK,
        createdAt: new Date(ISO),
    }));
});

afterEach(() => {
    jest.restoreAllMocks();
    __setDatabaseForTests(null);
    container.reset();
});

describe('V-119 decision 4: a restore that committed, then failed in a later step', () => {
    it('V-119 e. ensureUsableState fails after the commit: the message says the restore was done and names the step; the data events are emitted; the catch-up runs', async () => {
        mockFileContent = JSON.stringify(snapshot());
        mockEnsureUsableState.mockRejectedValue(new Error('disk I/O error'));

        const [title, message] = await restore();

        // The forcing: the step after the commit was reached and failed, and
        // the restored ledger is committed.
        expect(mockEnsureUsableState).toHaveBeenCalledTimes(1);
        expect(await count("SELECT COUNT(*) AS n FROM wallets WHERE id = 'w-restored'")).toBe(1);
        expect(await count("SELECT COUNT(*) AS n FROM wallets WHERE id = 'w-old'")).toBe(0);

        expect(title).toBe('alerts.restoreDoneTitle');
        expect(message).toContain('alerts.restoreStepUsableState');
        expect(emitMultiple).toHaveBeenCalledWith(expect.arrayContaining(DATA_EVENTS));
        // The catch-up ran: the rule's two due debits are in the ledger.
        expect(await count("SELECT COUNT(*) AS n FROM transactions WHERE recurring_rule_id = 'rr-gym'")).toBe(2);
    });
});

describe('V-119 decision 5: a refused restore emits every data event', () => {
    it('V-119 f. a restore refused inside its transaction: all data events are emitted', async () => {
        // A negative amount is refused by validateTransaction, inside the
        // transaction, after the tables were cleared.
        mockFileContent = JSON.stringify(snapshot([{
            id: 't-bad',
            type: TransactionType.EXPENSE,
            amount: -500,
            categoryId: 'cat-restored',
            walletId: 'w-restored',
            date: ISO,
            createdAt: ISO,
        }]));

        const [title] = await restore();

        // The forcing: the restore was refused and rolled back.
        expect(title).toBe('alerts.restoreFailed');
        expect(await count("SELECT COUNT(*) AS n FROM wallets WHERE id = 'w-old'")).toBe(1);
        expect(await count("SELECT COUNT(*) AS n FROM wallets WHERE id = 'w-restored'")).toBe(0);

        expect(emitMultiple).toHaveBeenCalledWith(ALL_EVENTS);
    });

    it('control: a successful restore behaves as now', async () => {
        mockFileContent = JSON.stringify(snapshot());

        const [title, message] = await restore();

        expect(mockEnsureUsableState).toHaveBeenCalledTimes(1);
        expect([title, message]).toEqual([
            'alerts.restoreSuccess',
            'alerts.restoreSuccessWithRulesMessage ' + JSON.stringify({ generated: 2, unprocessed: 0 }),
        ]);
        expect(emitMultiple).toHaveBeenCalledWith(DATA_EVENTS);
        expect(emitMultiple).toHaveBeenCalledWith(ALL_EVENTS);
        expect(await count("SELECT COUNT(*) AS n FROM transactions WHERE recurring_rule_id = 'rr-gym'")).toBe(2);
    });
});
