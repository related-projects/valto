/**
 * useSettings Restore Tests
 *
 * restoreFromSnapshot writes the settings blob out of the backup file verbatim,
 * and the restore caller then re-reads it. It re-applied the THEME from that
 * read and nothing else, so a backup taken in French restored onto an English
 * install left the app speaking English until the next cold boot - where
 * app/_layout finally syncs i18n. The theme changed in front of the user and the
 * language did not.
 *
 * The second half is the refusal copy: a backup with no currency is refused for
 * a specific, explainable reason, and "the file may be invalid" does not tell a
 * user whose backup predates the currency field what is actually wrong with it.
 */

jest.mock('@react-native-async-storage/async-storage', () =>
    require('@react-native-async-storage/async-storage/jest/async-storage-mock')
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
    ...require('@/tests/helpers/deviceLocaleMock').createDeviceLocaleMock(() => ({
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

const mockSetThemePreference = jest.fn();
jest.mock('../../theme/theme', () => ({
    useTheme: () => ({
        setThemePreference: mockSetThemePreference,
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

// backupService is required for real below (SnapshotRejectedError has to be the
// same class the hook narrows on), so its native dependencies need stubs.
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

// The restore itself is exercised end to end in src/data/__tests__; here it is a
// seam, so the hook's own post-restore work is what the assertions see.
const mockPickAndRestoreBackup = jest.fn();
jest.mock('../../data/services/backupService', () => {
    const actual = jest.requireActual('../../data/services/backupService');
    return {
        ...actual,
        createAndShareBackup: jest.fn().mockResolvedValue(undefined),
        pickAndRestoreBackup: () => mockPickAndRestoreBackup(),
    };
});

import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import i18n from 'i18next';
import { Alert } from 'react-native';
import { type RestoreOutcome, SnapshotRejectedError } from '../../data/services/backupService';
import { getDefaultSettings } from '../../data/services/settingsService';
import { useSettings } from '../useSettings';

/**
 * A restore with nothing to report: the catch-up ran, generated nothing and
 * left no rule behind. The shape matters - pickAndRestoreBackup returns the
 * outcome the alert is built from, and a bare `true` would let the counts path
 * pass by reading undefined.
 */
const QUIET_RESTORE: RestoreOutcome = {
    catchUpGenerated: 0,
    rulesNotProcessed: 0,
    catchUpFailed: false,
};

/** Walk the two-step confirmation the restore flow puts in front of the user. */
async function confirmRestore(restoreBackup: () => void) {
    await act(async () => {
        restoreBackup();
    });

    // Step 1: "Restore Data" -> Continue.
    const firstButtons = alertCalls[0][2]!;
    await act(async () => {
        await firstButtons[firstButtons.length - 1].onPress?.();
    });

    // Step 2: "Are you absolutely sure?" -> Restore Now.
    const secondButtons = alertCalls[1][2]!;
    await act(async () => {
        await secondButtons[secondButtons.length - 1].onPress?.();
    });
}

async function mountSettings() {
    const { result } = renderHook(() => useSettings());
    await waitFor(() => {
        expect(result.current.loading).toBe(false);
    });
    return result;
}

beforeEach(async () => {
    await AsyncStorage.clear();
    jest.clearAllMocks();
    alertCalls.length = 0;
    (i18n as unknown as { language: string }).language = 'en';
});

describe('useSettings restore applies the restored language', () => {
    it('switches i18n to the language the backup carried', async () => {
        // What the restore wrote to storage; the hook re-reads it afterwards.
        mockPickAndRestoreBackup.mockImplementation(async () => {
            await AsyncStorage.setItem(
                '@valto:settings',
                JSON.stringify({ ...getDefaultSettings(), language: 'fr', theme: 'dark' }),
            );
            return QUIET_RESTORE;
        });

        const result = await mountSettings();
        await confirmRestore(result.current.restoreBackup);

        expect(i18n.changeLanguage).toHaveBeenCalledWith('fr');
        // The theme was already re-applied before this change; both must land.
        expect(mockSetThemePreference).toHaveBeenCalledWith('dark');
        expect(Alert.alert).toHaveBeenCalledWith('alerts.restoreSuccess', 'alerts.restoreSuccessMessage');
    });

    it('does not re-apply a language that is already live', async () => {
        mockPickAndRestoreBackup.mockImplementation(async () => {
            await AsyncStorage.setItem(
                '@valto:settings',
                JSON.stringify({ ...getDefaultSettings(), language: 'en' }),
            );
            return QUIET_RESTORE;
        });

        const result = await mountSettings();
        await confirmRestore(result.current.restoreBackup);

        expect(i18n.changeLanguage).not.toHaveBeenCalled();
    });

    it('does nothing when the user cancels the file picker', async () => {
        mockPickAndRestoreBackup.mockResolvedValue(null);

        const result = await mountSettings();
        await confirmRestore(result.current.restoreBackup);

        expect(i18n.changeLanguage).not.toHaveBeenCalled();
        expect(mockSetThemePreference).not.toHaveBeenCalled();
    });
});

/**
 * The restore runs the recurring engine once it has committed. A standing order
 * that did not execute used to be told to nobody: the engine caught per rule,
 * boot carried on, and the only trace was a console line.
 */
describe('useSettings restore reports the recurring catch-up', () => {
    beforeEach(() => {
        mockPickAndRestoreBackup.mockImplementation(async () => {
            await AsyncStorage.setItem('@valto:settings', JSON.stringify(getDefaultSettings()));
            return restoreOutcome;
        });
    });

    let restoreOutcome: RestoreOutcome;

    it('reports both counts when the catch-up did something', async () => {
        restoreOutcome = { catchUpGenerated: 6, rulesNotProcessed: 2, catchUpFailed: false };

        const result = await mountSettings();
        await confirmRestore(result.current.restoreBackup);

        expect(Alert.alert).toHaveBeenCalledWith(
            'alerts.restoreSuccess',
            'alerts.restoreSuccessWithRulesMessage',
        );
    });

    it('reports rules it could not run even when nothing was generated', async () => {
        restoreOutcome = { catchUpGenerated: 0, rulesNotProcessed: 1, catchUpFailed: false };

        const result = await mountSettings();
        await confirmRestore(result.current.restoreBackup);

        expect(Alert.alert).toHaveBeenCalledWith(
            'alerts.restoreSuccess',
            'alerts.restoreSuccessWithRulesMessage',
        );
    });

    it('still reports success when the catch-up itself failed', async () => {
        restoreOutcome = { catchUpGenerated: 0, rulesNotProcessed: 0, catchUpFailed: true };

        const result = await mountSettings();
        await confirmRestore(result.current.restoreBackup);

        expect(Alert.alert).toHaveBeenCalledWith(
            'alerts.restoreSuccess',
            'alerts.restoreSuccessRulesFailedMessage',
        );
    });
});

describe('useSettings restore explains a refused backup', () => {
    it('shows the missing-currency copy rather than the generic failure', async () => {
        mockPickAndRestoreBackup.mockRejectedValue(
            new SnapshotRejectedError('Invalid backup snapshot', 'missingCurrency'),
        );

        const result = await mountSettings();
        await confirmRestore(result.current.restoreBackup);

        expect(Alert.alert).toHaveBeenCalledWith(
            'alerts.restoreFailed',
            'alerts.restoreMissingCurrencyMessage',
        );
    });

    it('keeps the generic copy for every other failure', async () => {
        mockPickAndRestoreBackup.mockRejectedValue(new Error('disk I/O error'));

        const result = await mountSettings();
        await confirmRestore(result.current.restoreBackup);

        expect(Alert.alert).toHaveBeenCalledWith(
            'alerts.restoreFailed',
            'alerts.restoreFailedMessage',
        );
    });
});
