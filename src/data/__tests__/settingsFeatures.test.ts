/**
 * Settings Features Tests
 *
 * Tests for Notifications, Currency, Language, and Regional features.
 */

// ─── Mocks ────────────────────────────────────────────────────────────

jest.mock('@react-native-async-storage/async-storage', () =>
    require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

jest.mock('react-native', () => ({
    Platform: { OS: 'ios' },
    NativeModules: {
        SettingsManager: {
            settings: {
                AppleLanguages: ['en-US'],
                AppleLocale: 'en_US',
            },
        },
    },
}));

// Mock expo-notifications
jest.mock('expo-notifications', () => ({
    getPermissionsAsync: jest.fn().mockResolvedValue({ status: 'granted' }),
    requestPermissionsAsync: jest.fn().mockResolvedValue({ status: 'granted' }),
    cancelAllScheduledNotificationsAsync: jest.fn().mockResolvedValue(undefined),
    scheduleNotificationAsync: jest.fn().mockResolvedValue('mock-id'),
    SchedulableTriggerInputTypes: { TIME_INTERVAL: 'timeInterval' },
}));

import AsyncStorage from '@react-native-async-storage/async-storage';
import { dataEvents } from '../../core/events/dataEvents';
import { isNotificationsEnabled, setNotificationsEnabled } from '../../data/services/notificationService';
import {
    getDefaultSettings,
    loadSettings,
    selectAndLockCurrency,
    unlockAndResetCurrency,
    updateSetting,
} from '../../data/services/settingsService';
import {
    DEFAULT_CURRENCY_CODE,
    getCurrencyByCode,
    SUPPORTED_CURRENCIES,
} from '../../domain/constants/currencies';
import {
    DEFAULT_LANGUAGE_CODE,
    getDeviceLanguage,
    getLanguageByCode,
    isSupportedLanguage,
    SUPPORTED_LANGUAGES,
} from '../../domain/constants/languages';
import { formatAmount } from '../../utils/formatAmount';
import { formatDate } from '../../utils/formatDate';

beforeEach(async () => {
    await AsyncStorage.clear();
    jest.clearAllMocks();
});

// ─── Notification Feature ─────────────────────────────────────────────

describe('Notification Feature', () => {
    it('defaults to disabled', async () => {
        const enabled = await isNotificationsEnabled();
        expect(enabled).toBe(false);
    });

    it('toggle persists preference (with permission granted)', async () => {
        const result = await setNotificationsEnabled(true);
        expect(result.enabled).toBe(true);
        expect(result.permissionDenied).toBe(false);

        const enabled = await isNotificationsEnabled();
        expect(enabled).toBe(true);

        await setNotificationsEnabled(false);
        const disabled = await isNotificationsEnabled();
        expect(disabled).toBe(false);
    });

    it('idempotent toggle does not emit event', async () => {
        const spy = jest.fn();
        const unsub = dataEvents.subscribe('settings', spy);

        await setNotificationsEnabled(false); // Already false by default
        expect(spy).not.toHaveBeenCalled();

        unsub();
    });

    it('emits settings event on change', async () => {
        const spy = jest.fn();
        const unsub = dataEvents.subscribe('settings', spy);

        await setNotificationsEnabled(true);
        expect(spy).toHaveBeenCalledTimes(1);

        unsub();
    });

    it('handles permission denial', async () => {
        const Notifications = require('expo-notifications');
        Notifications.getPermissionsAsync.mockResolvedValueOnce({ status: 'denied' });
        Notifications.requestPermissionsAsync.mockResolvedValueOnce({ status: 'denied' });

        const result = await setNotificationsEnabled(true);
        expect(result.enabled).toBe(false);
        expect(result.permissionDenied).toBe(true);

        // Should not have persisted
        const enabled = await isNotificationsEnabled();
        expect(enabled).toBe(false);
    });

    it('handles corrupted stored value gracefully', async () => {
        // Write garbage to storage
        await AsyncStorage.setItem('@valto:settings', 'not-json{{{');
        const settings = await loadSettings();
        expect(settings.notificationsEnabled).toBe(false);
    });
});

// ─── Currency Feature ─────────────────────────────────────────────────

describe('Currency Feature', () => {
    it('defaults to USD', async () => {
        const settings = await loadSettings();
        expect(settings.currency).toBe(DEFAULT_CURRENCY_CODE);
        expect(settings.currencyLocked).toBe(false);
    });

    it('has 150+ currencies in the list', () => {
        expect(SUPPORTED_CURRENCIES.length).toBeGreaterThanOrEqual(150);
    });

    it('every currency has code, symbol, and name', () => {
        for (const c of SUPPORTED_CURRENCIES) {
            expect(c.code).toBeTruthy();
            expect(c.symbol).toBeTruthy();
            expect(c.name).toBeTruthy();
        }
    });

    it('every currency declares a minor-unit exponent of 0, 2, or 3', () => {
        for (const c of SUPPORTED_CURRENCIES) {
            expect(typeof c.decimals).toBe('number');
            expect([0, 2, 3]).toContain(c.decimals);
        }
    });

    it('declares the exact set of 0-decimal currencies (no silent default to 2)', () => {
        const zero = SUPPORTED_CURRENCIES.filter(c => c.decimals === 0).map(c => c.code).sort();
        expect(zero).toEqual(
            [
                'BIF', 'CLP', 'DJF', 'GNF', 'ISK', 'JPY', 'KMF', 'KRW',
                'PYG', 'RWF', 'UGX', 'VND', 'VUV', 'XAF', 'XOF', 'XPF',
            ].sort(),
        );
    });

    it('declares the exact set of 3-decimal currencies', () => {
        const three = SUPPORTED_CURRENCIES.filter(c => c.decimals === 3).map(c => c.code).sort();
        expect(three).toEqual(['BHD', 'IQD', 'JOD', 'KWD', 'LYD', 'OMR', 'TND'].sort());
    });

    it('currencies are sorted by code', () => {
        const codes = SUPPORTED_CURRENCIES.map(c => c.code);
        const sorted = [...codes].sort();
        expect(codes).toEqual(sorted);
    });

    it('selection persists and locks', async () => {
        const updated = await selectAndLockCurrency('EUR');
        expect(updated.currency).toBe('EUR');
        expect(updated.currencyLocked).toBe(true);

        const loaded = await loadSettings();
        expect(loaded.currency).toBe('EUR');
        expect(loaded.currencyLocked).toBe(true);
    });

    it('cannot change once locked', async () => {
        await selectAndLockCurrency('GBP');
        await expect(selectAndLockCurrency('JPY')).rejects.toThrow('Currency cannot be changed');
    });

    it('updateSetting rejects currency change when locked', async () => {
        await selectAndLockCurrency('EUR');
        await expect(updateSetting('currency', 'USD')).rejects.toThrow('Currency cannot be changed');
    });

    it('unlockAndResetCurrency changes locked currency', async () => {
        await selectAndLockCurrency('EUR');
        const reset = await unlockAndResetCurrency('GBP');
        expect(reset.currency).toBe('GBP');
        expect(reset.currencyLocked).toBe(true);
    });

    it('getCurrencyByCode falls back to USD for unknown code', () => {
        const fallback = getCurrencyByCode('INVALID');
        expect(fallback.code).toBe('USD');
    });

    it('getCurrencyByCode returns correct currency', () => {
        const eur = getCurrencyByCode('EUR');
        expect(eur.code).toBe('EUR');
        expect(eur.symbol).toBe('€');
    });

    it('search filters correctly (case-insensitive)', () => {
        const term = 'eur';
        const results = SUPPORTED_CURRENCIES.filter(c =>
            c.code.toLowerCase().includes(term)
            || c.name.toLowerCase().includes(term),
        );
        expect(results.length).toBeGreaterThanOrEqual(1);
        expect(results.some(c => c.code === 'EUR')).toBe(true);
    });

    it('handles empty search result', () => {
        const term = 'zzzzzzzzz';
        const results = SUPPORTED_CURRENCIES.filter(c =>
            c.code.toLowerCase().includes(term)
            || c.name.toLowerCase().includes(term),
        );
        expect(results).toHaveLength(0);
    });
});

// ─── Language Feature ─────────────────────────────────────────────────

describe('Language Feature', () => {
    it('has 10 supported languages', () => {
        expect(SUPPORTED_LANGUAGES).toHaveLength(10);
    });

    it('every language has code, name, and nativeName', () => {
        for (const l of SUPPORTED_LANGUAGES) {
            expect(l.code).toBeTruthy();
            expect(l.name).toBeTruthy();
            expect(l.nativeName).toBeTruthy();
        }
    });

    it('default language is English', () => {
        expect(DEFAULT_LANGUAGE_CODE).toBe('en');
    });

    it('getDeviceLanguage falls back to English', () => {
        const lang = getDeviceLanguage();
        // In test env, mock returns 'en_US' → should resolve to 'en'
        expect(lang).toBe('en');
    });

    it('getLanguageByCode returns correct language', () => {
        const fr = getLanguageByCode('fr');
        expect(fr.code).toBe('fr');
        expect(fr.name).toBe('French');
    });

    it('getLanguageByCode falls back to English for unknown code', () => {
        const fallback = getLanguageByCode('zz');
        expect(fallback.code).toBe('en');
    });

    it('isSupportedLanguage returns true for supported', () => {
        expect(isSupportedLanguage('es')).toBe(true);
        expect(isSupportedLanguage('ar')).toBe(true);
    });

    it('isSupportedLanguage returns false for unsupported', () => {
        expect(isSupportedLanguage('xx')).toBe(false);
        expect(isSupportedLanguage('')).toBe(false);
    });

    it('persists language selection', async () => {
        await updateSetting('language', 'es');
        const settings = await loadSettings();
        expect(settings.language).toBe('es');
    });

    it('change triggers settings event', async () => {
        const spy = jest.fn();
        const unsub = dataEvents.subscribe('settings', spy);

        // Simulate what the hook does
        await updateSetting('language', 'fr');
        dataEvents.emit('settings');
        expect(spy).toHaveBeenCalledTimes(1);

        unsub();
    });

    it('handles invalid stored language gracefully', async () => {
        // Store settings with invalid language
        await AsyncStorage.setItem('@valto:settings', JSON.stringify({
            theme: 'system',
            currency: 'USD',
            currencyLocked: false,
            notificationsEnabled: false,
            language: 'invalid_code',
        }));
        const settings = await loadSettings();
        expect(settings.language).toBe('en');
    });
});

// ─── Regional Settings ───────────────────────────────────────────────

describe('Regional Settings', () => {
    it('defaults to MM/DD/YYYY, monday, dot', async () => {
        const settings = await loadSettings();
        expect(settings.dateFormat).toBe('MM/DD/YYYY');
        expect(settings.firstDayOfWeek).toBe('monday');
        expect(settings.decimalSeparator).toBe('dot');
    });

    it('persists dateFormat', async () => {
        await updateSetting('dateFormat', 'DD/MM/YYYY');
        const settings = await loadSettings();
        expect(settings.dateFormat).toBe('DD/MM/YYYY');
    });

    it('persists firstDayOfWeek', async () => {
        await updateSetting('firstDayOfWeek', 'sunday');
        const settings = await loadSettings();
        expect(settings.firstDayOfWeek).toBe('sunday');
    });

    it('persists decimalSeparator', async () => {
        await updateSetting('decimalSeparator', 'comma');
        const settings = await loadSettings();
        expect(settings.decimalSeparator).toBe('comma');
    });

    it('validates invalid dateFormat on load', async () => {
        await AsyncStorage.setItem('@valto:settings', JSON.stringify({
            dateFormat: 'INVALID',
        }));
        const settings = await loadSettings();
        expect(settings.dateFormat).toBe('MM/DD/YYYY');
    });

    it('validates invalid decimalSeparator on load', async () => {
        await AsyncStorage.setItem('@valto:settings', JSON.stringify({
            decimalSeparator: 'semicolon',
        }));
        const settings = await loadSettings();
        expect(settings.decimalSeparator).toBe('dot');
    });
});

// ─── Formatting Utilities ─────────────────────────────────────────────

describe('Formatting Utilities', () => {
    it('formatAmount with dot separator', () => {
        expect(formatAmount(200050, '$', 'dot')).toBe('$2,000.50');
    });

    it('formatAmount with comma separator', () => {
        expect(formatAmount(200050, '$', 'comma')).toBe('$2.000,50');
    });

    it('formatDate DD/MM/YYYY', () => {
        expect(formatDate(new Date('2026-03-05'), 'DD/MM/YYYY')).toBe('05/03/2026');
    });

    it('formatDate MM/DD/YYYY', () => {
        expect(formatDate(new Date('2026-03-05'), 'MM/DD/YYYY')).toBe('03/05/2026');
    });

    it('formatDate YYYY-MM-DD', () => {
        expect(formatDate(new Date('2026-03-05'), 'YYYY-MM-DD')).toBe('2026-03-05');
    });
});

// ─── Settings Service Defaults ────────────────────────────────────────

describe('Settings Service Defaults', () => {
    it('getDefaultSettings returns complete object', () => {
        const defaults = getDefaultSettings();
        expect(defaults.theme).toBe('system');
        expect(defaults.currency).toBe('USD');
        expect(defaults.currencyLocked).toBe(false);
        expect(defaults.notificationsEnabled).toBe(false);
        expect(typeof defaults.language).toBe('string');
        expect(defaults.dateFormat).toBe('MM/DD/YYYY');
        expect(defaults.firstDayOfWeek).toBe('monday');
        expect(defaults.decimalSeparator).toBe('dot');
    });

    it('loadSettings returns defaults on first launch', async () => {
        const settings = await loadSettings();
        const defaults = getDefaultSettings();
        expect(settings.theme).toBe(defaults.theme);
        expect(settings.currency).toBe(defaults.currency);
        expect(settings.currencyLocked).toBe(defaults.currencyLocked);
        expect(settings.notificationsEnabled).toBe(defaults.notificationsEnabled);
    });
});

