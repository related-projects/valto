/**
 * The settings hook reports a failed backup or restore without the error's
 * contents (pass 84b, item 1)
 *
 * useSettings logged the error a failed backup or restore threw, whole. A file
 * system error names the file it failed on - for a backup, the backup in the
 * cache - and a refused snapshot's message quotes the rows it refused, amount
 * and note included (validateSnapshot, "Transaction missing required fields").
 *
 * The errors here are the real shapes: a write error as expo-file-system
 * reports it, and the SnapshotRejectedError restoreFromSnapshot throws for a
 * file with a row missing its id. Every console argument is rendered with
 * util.inspect and may contain neither the path nor anything from the file.
 *
 * Harness as in useSettingsRestore.test.ts; backupService is a seam here, and
 * the paths behind it are covered in src/data/__tests__/backupConsoleData.test.ts.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import { inspect } from 'util';
import { CURRENT_SCHEMA_VERSION, restoreFromSnapshot, type BackupSnapshot } from '../../data/services/backupService';
import { getDefaultSettings } from '../../data/services/settingsService';
import { useSettings } from '../useSettings';

jest.mock('@react-native-async-storage/async-storage', () =>
    jest.requireActual('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

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
    ...jest.requireActual('@/tests/helpers/deviceLocaleMock').createDeviceLocaleMock(() => ({
        os: 'ios',
        value: 'en_US',
    })),
}));

jest.mock('expo-notifications', () => ({
    getPermissionsAsync: jest.fn().mockResolvedValue({ status: 'granted' }),
    requestPermissionsAsync: jest.fn().mockResolvedValue({ status: 'granted' }),
    cancelAllScheduledNotificationsAsync: jest.fn().mockResolvedValue(undefined),
    cancelScheduledNotificationAsync: jest.fn().mockResolvedValue(undefined),
    scheduleNotificationAsync: jest.fn().mockResolvedValue('mock-id'),
    setNotificationChannelAsync: jest.fn().mockResolvedValue(undefined),
    setNotificationHandler: jest.fn(),
    SchedulableTriggerInputTypes: { TIME_INTERVAL: 'timeInterval', DAILY: 'daily' },
    AndroidImportance: { HIGH: 6 },
}));

jest.mock('../../theme/theme', () => ({
    useTheme: () => ({
        setThemePreference: jest.fn(),
        isDark: false,
        theme: {},
    }),
}));

jest.mock('i18next', () => ({
    __esModule: true,
    default: {
        changeLanguage: jest.fn().mockResolvedValue(undefined),
        language: 'en',
        t: (key: string) => key,
        use: jest.fn().mockReturnThis(),
        init: jest.fn().mockResolvedValue(undefined),
    },
}));

jest.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string) => key,
        i18n: { changeLanguage: jest.fn() },
    }),
}));

jest.mock('../../core/events/dataEvents', () => ({
    dataEvents: { emit: jest.fn(), emitMultiple: jest.fn(), subscribe: jest.fn(() => jest.fn()) },
}));

jest.mock('expo-document-picker', () => ({
    getDocumentAsync: jest.fn(),
}));

jest.mock('expo-file-system', () => ({
    File: jest.fn(),
    Paths: { cache: '/mock/cache' },
}));

jest.mock('expo-sharing', () => ({
    shareAsync: jest.fn().mockResolvedValue(undefined),
    isAvailableAsync: jest.fn().mockResolvedValue(true),
}));

const mockCreateAndShareBackup = jest.fn();
const mockPickAndRestoreBackup = jest.fn();
jest.mock('../../data/services/backupService', () => {
    const actual = jest.requireActual('../../data/services/backupService');
    return {
        ...actual,
        createAndShareBackup: () => mockCreateAndShareBackup(),
        pickAndRestoreBackup: () => mockPickAndRestoreBackup(),
    };
});

const BACKUP_PATH = '/data/user/0/com.renkakpo.valto.app/cache/valto-backup-2026-10-28T10-00-00-000Z.json';
const MARKER_NOTE = 'Marker note Zq7 landlord';
const MARKER_AMOUNT = 98765432;

let consoleSpies: jest.SpyInstance[];

function printed(): string {
    return consoleSpies
        .flatMap((spy) => spy.mock.calls as unknown[][])
        .map((args) => args.map((arg) => (typeof arg === 'string' ? arg : inspect(arg, { depth: 8 }))).join(' '))
        .join('\n');
}

const leaks = (forbidden: string[]): string[] => forbidden.filter((text) => printed().includes(text));

/** A real-shaped backup with one transaction that lost its id. */
const SNAPSHOT_WITH_BROKEN_ROW = {
    version: CURRENT_SCHEMA_VERSION,
    createdAt: '2026-10-28T10:00:00.000Z',
    appVersion: '1.1.4',
    data: {
        wallets: [{ id: 'w-1', name: 'Cash', balance: 0, type: 'cash', createdAt: '2026-01-02T00:00:00.000Z' }],
        transactions: [{
            type: 'expense',
            amount: MARKER_AMOUNT,
            categoryId: 'food',
            walletId: 'w-1',
            date: '2026-10-01T09:00:00.000Z',
            note: MARKER_NOTE,
            createdAt: '2026-10-01T09:00:00.000Z',
        }],
        categories: [{ id: 'food', name: 'Food', type: 'expense' }],
        budgets: [],
        recurringRules: [],
        settings: getDefaultSettings(),
    },
} as unknown as BackupSnapshot;

async function mountSettings() {
    const { result } = renderHook(() => useSettings());
    await waitFor(() => {
        expect(result.current.loading).toBe(false);
    });
    return result;
}

/** Walk the two-step confirmation the restore flow puts in front of the user. */
async function confirmRestore(restoreBackup: () => void) {
    await act(async () => {
        restoreBackup();
    });
    const firstButtons = alertCalls[0][2]!;
    await act(async () => {
        await firstButtons[firstButtons.length - 1].onPress?.();
    });
    const secondButtons = alertCalls[1][2]!;
    await act(async () => {
        await secondButtons[secondButtons.length - 1].onPress?.();
    });
}

beforeEach(async () => {
    await AsyncStorage.clear();
    jest.clearAllMocks();
    alertCalls.length = 0;
    consoleSpies = (['log', 'info', 'warn', 'error', 'debug'] as const).map((method) =>
        jest.spyOn(console, method).mockImplementation(() => undefined),
    );
});

afterEach(() => {
    jest.restoreAllMocks();
});

describe('pass 84b item 1. what useSettings prints when a backup or restore fails', () => {
    it('pass 84b item 1. a failed backup prints no path', async () => {
        mockCreateAndShareBackup.mockRejectedValue(new Error(
            `Call to function 'FileSystemFile.write' has been rejected.\n` +
            `Caused by: java.io.IOException: ${BACKUP_PATH}: write failed: ENOSPC (No space left on device)`,
        ));
        const result = await mountSettings();

        await act(async () => {
            await result.current.createBackup();
        });

        expect(mockCreateAndShareBackup).toHaveBeenCalledTimes(1);
        expect(consoleSpies.some((spy) => spy.mock.calls.length > 0)).toBe(true);
        expect(leaks([BACKUP_PATH, 'valto-backup-'])).toEqual([]);
    });

    it('pass 84b item 1. a refused restore prints none of the refused row', async () => {
        // The error restoreFromSnapshot really throws for this file.
        mockPickAndRestoreBackup.mockImplementation(() => restoreFromSnapshot(SNAPSHOT_WITH_BROKEN_ROW));
        await expect(restoreFromSnapshot(SNAPSHOT_WITH_BROKEN_ROW)).rejects.toThrow(MARKER_NOTE);
        const result = await mountSettings();

        await confirmRestore(result.current.restoreBackup);

        expect(mockPickAndRestoreBackup).toHaveBeenCalledTimes(1);
        expect(consoleSpies.some((spy) => spy.mock.calls.length > 0)).toBe(true);
        expect(leaks([MARKER_NOTE, String(MARKER_AMOUNT)])).toEqual([]);
    });
});
