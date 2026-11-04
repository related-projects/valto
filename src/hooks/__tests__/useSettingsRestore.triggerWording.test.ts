/**
 * useSettings restore - a catch-up that failed names the next app start
 * (pass 80, finding 2)
 *
 * After a restore whose recurring catch-up failed, the alert said the rules
 * "will be checked again the next time you open the app". The engine runs at
 * an app start, not when the app comes back from the background (V-100), so
 * a user who only switches back to the app would wait for nothing. The pass 79
 * wording for an engine retry is "the next time the app starts" (V-111).
 *
 * The harness of useSettingsRestore.test.ts: the real useSettings, with
 * pickAndRestoreBackup as a seam handing over the outcome. `t` resolves each
 * key from the real locale bundle - the identity `t` of that suite cannot see
 * what the user reads.
 *
 * Non-ASCII expectations are written as \u escapes.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import type { RestoreOutcome } from '../../data/services/backupService';
import { useSettings } from '../useSettings';

// jest.mock calls are hoisted above these imports, so the modules above see the
// mocks below.

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

/** The bundle `t` reads from in the current case. */
let mockLanguage: 'en' | 'fr' = 'en';

jest.mock('react-i18next', () => {
    const bundles: Record<string, unknown> = {
        en: jest.requireActual('../../localization/locales/en.json'),
        fr: jest.requireActual('../../localization/locales/fr.json'),
    };
    const lookup = (bundle: unknown, key: string): string | undefined => {
        let node: unknown = bundle;
        for (const part of key.split('.')) {
            if (typeof node !== 'object' || node === null) return undefined;
            node = (node as Record<string, unknown>)[part];
        }
        return typeof node === 'string' ? node : undefined;
    };
    const t = (key: string, params?: Record<string, unknown>) => {
        const template = lookup(bundles[mockLanguage], key) ?? lookup(bundles.en, key) ?? key;
        return template.replace(/\{\{(\w+)\}\}/g, (_, name: string) => String(params?.[name] ?? ''));
    };
    return {
        useTranslation: () => ({ t, i18n: { changeLanguage: jest.fn() } }),
    };
});

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

const mockPickAndRestoreBackup = jest.fn();
jest.mock('../../data/services/backupService', () => {
    const actual = jest.requireActual('../../data/services/backupService');
    return {
        ...actual,
        createAndShareBackup: jest.fn().mockResolvedValue(undefined),
        pickAndRestoreBackup: () => mockPickAndRestoreBackup(),
    };
});

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

/** Restore with `outcome` and return the alert shown after it, as [title, message]. */
async function restoreAndRead(outcome: RestoreOutcome): Promise<[string, string]> {
    mockPickAndRestoreBackup.mockResolvedValue(outcome);

    const { result } = renderHook(() => useSettings());
    await waitFor(() => {
        expect(result.current.loading).toBe(false);
    });
    await confirmRestore(result.current.restoreBackup);

    // The forcing: the two confirmations, then the one outcome alert.
    expect(alertCalls).toHaveLength(3);
    return [alertCalls[2][0], alertCalls[2][1] ?? ''];
}

const CATCH_UP_FAILED: RestoreOutcome = {
    catchUpGenerated: 0,
    rulesNotProcessed: 0,
    catchUpFailed: true,
    failedSteps: [],
};

beforeEach(async () => {
    await AsyncStorage.clear();
    jest.clearAllMocks();
    alertCalls.length = 0;
    mockLanguage = 'en';
});

describe('pass 80 finding 2: a restore whose catch-up failed names the next app start', () => {
    it('b. en: restoreSuccessRulesFailedMessage names the next app start, not the next opening', async () => {
        mockLanguage = 'en';
        const [title, message] = await restoreAndRead(CATCH_UP_FAILED);

        expect(title).toBe('Success');
        expect(message).toContain('could not be processed');
        expect(message).not.toContain('open the app');
        expect(message).toContain('the next time the app starts');
    });

    it('b. fr: restoreSuccessRulesFailedMessage names the next app start, not the next opening', async () => {
        mockLanguage = 'fr';
        const [, message] = await restoreAndRead(CATCH_UP_FAILED);

        expect(message).toContain('n\'ont pas pu \u00eatre trait\u00e9es');
        expect(message).not.toContain('ouverture');
        expect(message).toContain('au prochain d\u00e9marrage de l\'application');
    });

    it('control: a restore with a failed step and a failed catch-up already names the next app start (restoreRulesFailedNote)', async () => {
        mockLanguage = 'en';
        const [title, message] = await restoreAndRead({ ...CATCH_UP_FAILED, failedSteps: ['settings'] });

        expect(title).toBe('Restore Done');
        expect(message).not.toContain('open the app');
        expect(message).toContain('the next time the app starts');
    });

    it('control: fr, a restore with a failed step and a failed catch-up already names the next app start (restoreRulesFailedNote)', async () => {
        mockLanguage = 'fr';
        const [, message] = await restoreAndRead({ ...CATCH_UP_FAILED, failedSteps: ['settings'] });

        expect(message).not.toContain('ouverture');
        expect(message).toContain('au prochain d\u00e9marrage de l\'application');
    });
});
