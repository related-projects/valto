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

// Handlers registered through the mocked AppState, so a test can drive a
// background/foreground transition. Dereferenced only when addEventListener is
// called, which is long after this module has finished initialising.
const mockAppStateListeners: ((state: string) => void)[] = [];

jest.mock('react-native', () => ({
    Platform: { OS: 'ios' },
    Alert: { alert: jest.fn() },
    Linking: { openSettings: jest.fn().mockResolvedValue(undefined) },
    AppState: {
        currentState: 'active',
        addEventListener: jest.fn((_event: string, handler: (state: string) => void) => {
            mockAppStateListeners.push(handler);
            return {
                remove: jest.fn(() => {
                    const index = mockAppStateListeners.indexOf(handler);
                    if (index >= 0) mockAppStateListeners.splice(index, 1);
                }),
            };
        }),
    },
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
import { act, renderHook, waitFor } from '@testing-library/react-native';
import * as Notifications from 'expo-notifications';
import { Alert } from 'react-native';
import { getLanguageByCode } from '../../domain/constants/languages';
import { useSettings } from '../useSettings';

describe('useSettings', () => {
    beforeEach(async () => {
        await AsyncStorage.clear();
        jest.clearAllMocks();
        // clearAllMocks keeps implementations, so re-arm the default here: any
        // test that flips the status to denied would otherwise leak into the next.
        (Notifications.getPermissionsAsync as jest.Mock).mockResolvedValue({ status: 'granted' });
        mockAppStateListeners.length = 0;
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

    describe('language change and the daily reminder', () => {
        const seedSettings = async (notificationsEnabled: boolean) => {
            await AsyncStorage.setItem('@valto:settings', JSON.stringify({
                theme: 'system',
                currency: 'USD',
                currencyLocked: false,
                language: 'en',
                dateFormat: 'MM/DD/YYYY',
                firstDayOfWeek: 'monday',
                decimalSeparator: 'dot',
                onboardingCompleted: true,
                notificationsEnabled,
            }));
        };

        const selectFrench = async () => {
            const { result } = renderHook(() => useSettings());
            await waitFor(() => {
                expect(result.current.loading).toBe(false);
            });
            await act(async () => {
                await result.current.handleLanguageSelect(getLanguageByCode('fr'));
            });
        };

        it('reschedules the reminder so its copy follows the new language', async () => {
            await seedSettings(true);

            await selectFrench();

            expect(Notifications.scheduleNotificationAsync).toHaveBeenCalledWith(
                expect.objectContaining({
                    identifier: 'valto-daily-spending-reminder',
                    trigger: expect.objectContaining({ type: 'daily', hour: 18, minute: 0 }),
                })
            );
        });

        it('schedules nothing when notifications are off', async () => {
            await seedSettings(false);

            await selectFrench();

            expect(Notifications.scheduleNotificationAsync).not.toHaveBeenCalled();
        });

        it('does not schedule into the void when the permission is not granted', async () => {
            // handleLanguageSelect reschedules so the reminder copy follows the new
            // language. It must not register a reminder the OS will drop, and the
            // preference must not be left reading "on" behind it.
            await seedSettings(true);
            (Notifications.getPermissionsAsync as jest.Mock).mockResolvedValue({ status: 'denied' });

            await selectFrench();

            expect(Notifications.scheduleNotificationAsync).not.toHaveBeenCalled();
            expect(Notifications.requestPermissionsAsync).not.toHaveBeenCalled();
            expect(await AsyncStorage.getItem('@valto:settings')).toContain('"notificationsEnabled":false');
        });

        it('does not surface a language error when rescheduling fails', async () => {
            await seedSettings(true);
            (Notifications.scheduleNotificationAsync as jest.Mock)
                .mockRejectedValueOnce(new Error('scheduling unavailable'));

            await selectFrench();

            // A scheduling failure is not a language failure and must not claim to be one.
            expect(Alert.alert).not.toHaveBeenCalled();
            expect(await AsyncStorage.getItem('@valto:settings')).toContain('"language":"fr"');
        });
    });

    describe('blocked notice on foreground return', () => {
        const seedNotificationsOff = async () => {
            await AsyncStorage.setItem('@valto:settings', JSON.stringify({
                theme: 'system',
                currency: 'USD',
                currencyLocked: false,
                language: 'en',
                dateFormat: 'MM/DD/YYYY',
                firstDayOfWeek: 'monday',
                decimalSeparator: 'dot',
                onboardingCompleted: true,
                notificationsEnabled: false,
            }));
        };

        const readCount = () => (Notifications.getPermissionsAsync as jest.Mock).mock.calls.length;

        it('re-reads the permission and clears the notice when the app returns to the foreground', async () => {
            await seedNotificationsOff();
            (Notifications.getPermissionsAsync as jest.Mock).mockResolvedValue({ status: 'denied' });

            const { result } = renderHook(() => useSettings());
            await waitFor(() => {
                expect(result.current.notificationsBlockedNotice).toBe(true);
            });
            const readsAfterMount = readCount();

            // The user granted the permission in the system settings while the app
            // was backgrounded. Nothing in the app observed it.
            (Notifications.getPermissionsAsync as jest.Mock).mockResolvedValue({ status: 'granted' });

            // Leaving for the system settings is not the transition that re-reads.
            await act(async () => {
                mockAppStateListeners.forEach(listener => listener('background'));
            });
            expect(readCount()).toBe(readsAfterMount);

            // Coming back is.
            await act(async () => {
                mockAppStateListeners.forEach(listener => listener('active'));
            });

            await waitFor(() => {
                expect(result.current.notificationsBlockedNotice).toBe(false);
            });
            // Paired assertions: a bare "never requested" passes with no listener
            // registered at all, so it only means something next to the read.
            expect(readCount()).toBe(readsAfterMount + 1);
            expect(Notifications.requestPermissionsAsync).not.toHaveBeenCalled();
        });

        it('registers one listener and removes it on unmount', async () => {
            await seedNotificationsOff();

            const { rerender, unmount } = renderHook(() => useSettings());
            await waitFor(() => {
                expect(mockAppStateListeners).toHaveLength(1);
            });

            // Re-rendering must not stack a second subscription.
            rerender(undefined);
            expect(mockAppStateListeners).toHaveLength(1);

            unmount();
            expect(mockAppStateListeners).toHaveLength(0);
        });
    });
});
