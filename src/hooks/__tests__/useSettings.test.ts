/**
 * useSettings Hook Tests
 *
 * Tests the data-flow aspects of useSettings: loading, theme, currency lock/unlock,
 * language switching, regional settings persistence.
 * Alert-based interaction flows are tested via E2E.
 */

jest.mock('@react-native-async-storage/async-storage', () =>
    require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

jest.mock('react-native', () => ({
    Platform: { OS: 'ios' },
    Alert: { alert: jest.fn() },
    NativeModules: {
        SettingsManager: {
            settings: {
                AppleLanguages: ['en-US'],
                AppleLocale: 'en_US',
            },
        },
    },
}));

jest.mock('expo-notifications', () => ({
    getPermissionsAsync: jest.fn().mockResolvedValue({ status: 'granted' }),
    requestPermissionsAsync: jest.fn().mockResolvedValue({ status: 'granted' }),
    cancelAllScheduledNotificationsAsync: jest.fn().mockResolvedValue(undefined),
    scheduleNotificationAsync: jest.fn().mockResolvedValue('mock-id'),
    SchedulableTriggerInputTypes: { TIME_INTERVAL: 'timeInterval' },
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
    dataEvents: {
        subscribe: jest.fn(() => jest.fn()),
        emit: jest.fn(),
        emitMultiple: jest.fn(),
    },
}));

jest.mock('expo-document-picker', () => ({
    getDocumentAsync: jest.fn(),
}));

jest.mock('expo-file-system', () => ({
    documentDirectory: '/mock/',
    writeAsStringAsync: jest.fn().mockResolvedValue(undefined),
    readAsStringAsync: jest.fn().mockResolvedValue('{}'),
    EncodingType: { UTF8: 'utf8' },
}));

jest.mock('expo-sharing', () => ({
    shareAsync: jest.fn().mockResolvedValue(undefined),
    isAvailableAsync: jest.fn().mockResolvedValue(true),
}));

import AsyncStorage from '@react-native-async-storage/async-storage';
import { renderHook, waitFor } from '@testing-library/react-native';
import { useSettings } from '../useSettings';

describe('useSettings', () => {
    beforeEach(async () => {
        await AsyncStorage.clear();
        jest.clearAllMocks();
    });

    it('loads default settings on mount', async () => {
        const { result } = renderHook(() => useSettings());

        await waitFor(() => {
            expect(result.current.loading).toBe(false);
        });

        expect(result.current.settings.theme).toBe('system');
        expect(result.current.settings.currency).toBe('USD');
        expect(result.current.settings.currencyLocked).toBe(false);
        expect(result.current.settings.language).toBe('en');
    });

    it('provides currency definition', async () => {
        const { result } = renderHook(() => useSettings());

        await waitFor(() => {
            expect(result.current.loading).toBe(false);
        });

        expect(result.current.currency.code).toBe('USD');
        expect(result.current.currency.symbol).toBe('$');
    });

    it('provides language definition', async () => {
        const { result } = renderHook(() => useSettings());

        await waitFor(() => {
            expect(result.current.loading).toBe(false);
        });

        expect(result.current.language.code).toBe('en');
        expect(result.current.language.name).toBe('English');
    });

    it('reports isCurrencyLocked correctly', async () => {
        const { result } = renderHook(() => useSettings());

        await waitFor(() => {
            expect(result.current.loading).toBe(false);
        });

        expect(result.current.isCurrencyLocked).toBe(false);
    });

    it('loads persisted settings', async () => {
        // Pre-persist settings
        await AsyncStorage.setItem('@valto:settings', JSON.stringify({
            theme: 'dark',
            currency: 'EUR',
            currencyLocked: true,
            notificationsEnabled: false,
            language: 'fr',
            dateFormat: 'DD/MM/YYYY',
            firstDayOfWeek: 'sunday',
            decimalSeparator: 'comma',
            onboardingCompleted: true,
        }));

        const { result } = renderHook(() => useSettings());

        await waitFor(() => {
            expect(result.current.settings.theme).toBe('dark');
        });

        expect(result.current.settings.currency).toBe('EUR');
        expect(result.current.settings.currencyLocked).toBe(true);
        expect(result.current.settings.language).toBe('fr');
        expect(result.current.settings.dateFormat).toBe('DD/MM/YYYY');
        expect(result.current.settings.firstDayOfWeek).toBe('sunday');
        expect(result.current.settings.decimalSeparator).toBe('comma');
        expect(result.current.isCurrencyLocked).toBe(true);
    });

    it('handles corrupted storage gracefully', async () => {
        await AsyncStorage.setItem('@valto:settings', 'not-valid-json{{{');

        const { result } = renderHook(() => useSettings());

        await waitFor(() => {
            // Should fall back to defaults
            expect(result.current.settings.currency).toBe('USD');
        });
    });

    it('exposes all expected functions', async () => {
        const { result } = renderHook(() => useSettings());

        await waitFor(() => {
            expect(result.current.loading).toBe(false);
        });

        // Verify all functions are exposed
        expect(typeof result.current.createBackup).toBe('function');
        expect(typeof result.current.restoreBackup).toBe('function');
        expect(typeof result.current.resetAllData).toBe('function');
        expect(typeof result.current.changeTheme).toBe('function');
        expect(typeof result.current.handleCurrencySelect).toBe('function');
        expect(typeof result.current.handleLanguageSelect).toBe('function');
        expect(typeof result.current.toggleNotifications).toBe('function');
        expect(typeof result.current.resetCurrency).toBe('function');
        expect(typeof result.current.changeDateFormat).toBe('function');
        expect(typeof result.current.changeFirstDayOfWeek).toBe('function');
        expect(typeof result.current.changeDecimalSeparator).toBe('function');
    });
});
