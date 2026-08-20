/**
 * Number-format profile derivation tests (V-20 / F-14).
 *
 * Two things are under test and they are not the same thing:
 *
 *  1. numberFormatForLocale - a pure locale-tag -> profile mapping.
 *  2. WHEN that mapping is allowed to run. It runs on first launch and never
 *     again, so a user's explicit choice can never be overwritten by their
 *     device locale. That guarantee is the point of the feature, and the second
 *     half of this file exists to hold it in place.
 */

// ─── Mocks ────────────────────────────────────────────────────────────

jest.mock('@react-native-async-storage/async-storage', () =>
    require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

// Mutable so a test can change the device locale between launches. The getter
// means every read of NativeModules picks up the current value rather than a
// value captured when the module was first imported.
const mockDeviceLocale = { value: 'en_US' };

jest.mock('react-native', () => ({
    Platform: { OS: 'ios' },
    NativeModules: {
        SettingsManager: {
            get settings() {
                return {
                    AppleLocale: mockDeviceLocale.value,
                    AppleLanguages: [mockDeviceLocale.value],
                };
            },
        },
    },
}));

import AsyncStorage from '@react-native-async-storage/async-storage';
import {
    getDefaultSettings,
    getInitialSettings,
    loadSettings,
    updateSetting,
} from '../../data/services/settingsService';
import { getDeviceLocale } from '../../domain/constants/languages';
import { numberFormatForLocale } from '../../domain/constants/numberFormats';

const SETTINGS_KEY = '@valto:settings';

beforeEach(async () => {
    await AsyncStorage.clear();
    mockDeviceLocale.value = 'en_US';
    jest.clearAllMocks();
});

// ─── The pure mapping ─────────────────────────────────────────────────

describe('numberFormatForLocale', () => {
    it('maps French locales to the space profile', () => {
        expect(numberFormatForLocale('fr')).toBe('space');
        expect(numberFormatForLocale('fr-FR')).toBe('space');
        expect(numberFormatForLocale('fr_CI')).toBe('space');
        expect(numberFormatForLocale('fr-SN')).toBe('space');
    });

    it('maps English locales to the dot profile', () => {
        expect(numberFormatForLocale('en')).toBe('dot');
        expect(numberFormatForLocale('en_US')).toBe('dot');
        expect(numberFormatForLocale('en-GB')).toBe('dot');
    });

    it('maps continental European locales to the comma profile', () => {
        expect(numberFormatForLocale('de')).toBe('comma');
        expect(numberFormatForLocale('es-ES')).toBe('comma');
        expect(numberFormatForLocale('pt-BR')).toBe('comma');
        expect(numberFormatForLocale('it')).toBe('comma');
    });

    it('applies region overrides where the language default is wrong', () => {
        expect(numberFormatForLocale('es-MX')).toBe('dot');
        expect(numberFormatForLocale('es_US')).toBe('dot');
        expect(numberFormatForLocale('pt-PT')).toBe('space');
        expect(numberFormatForLocale('de-CH')).toBe('dot');
    });

    it('skips a script subtag when looking for the region', () => {
        expect(numberFormatForLocale('zh-Hans-CN')).toBe('dot');
        expect(numberFormatForLocale('sr-Latn-RS')).toBe('comma');
    });

    it('falls back to the dot profile for anything unrecognised', () => {
        expect(numberFormatForLocale(null)).toBe('dot');
        expect(numberFormatForLocale(undefined)).toBe('dot');
        expect(numberFormatForLocale('')).toBe('dot');
        expect(numberFormatForLocale('xx-YY')).toBe('dot');
    });
});

// ─── Reading the device locale ────────────────────────────────────────

describe('getDeviceLocale', () => {
    it('returns the full tag, region included', () => {
        mockDeviceLocale.value = 'fr_CI';
        expect(getDeviceLocale()).toBe('fr_CI');
    });
});

// ─── First launch only ────────────────────────────────────────────────

describe('first-launch profile derivation', () => {
    it('derives the space profile on a French device', async () => {
        mockDeviceLocale.value = 'fr_FR';
        const settings = await loadSettings();
        expect(settings.decimalSeparator).toBe('space');
    });

    it('derives the dot profile on an English device', async () => {
        mockDeviceLocale.value = 'en_US';
        const settings = await loadSettings();
        expect(settings.decimalSeparator).toBe('dot');
    });

    it('derives from the region, not only the language', async () => {
        mockDeviceLocale.value = 'fr_CI';
        expect((await loadSettings()).decimalSeparator).toBe('space');

        await AsyncStorage.clear();
        mockDeviceLocale.value = 'es_MX';
        expect((await loadSettings()).decimalSeparator).toBe('dot');
    });

    it('getInitialSettings is the only entry point that reads the device', () => {
        mockDeviceLocale.value = 'fr_FR';
        // getDefaultSettings stays static, so nothing that merges over defaults
        // can accidentally pull the device locale in.
        expect(getDefaultSettings().decimalSeparator).toBe('dot');
        expect(getInitialSettings().decimalSeparator).toBe('space');
    });
});

// ─── Never again ──────────────────────────────────────────────────────

describe('a stored choice always wins over the device locale', () => {
    it('does not overwrite an explicit choice on the next launch', async () => {
        // Launch 1 on a French device: derived.
        mockDeviceLocale.value = 'fr_FR';
        expect((await loadSettings()).decimalSeparator).toBe('space');

        // The user disagrees and picks dot.
        await updateSetting('decimalSeparator', 'dot');

        // Launch 2, same French device: the stored choice stands.
        expect((await loadSettings()).decimalSeparator).toBe('dot');

        // Launch 3, and a fourth for good measure - still no drift.
        expect((await loadSettings()).decimalSeparator).toBe('dot');
        expect((await loadSettings()).decimalSeparator).toBe('dot');
    });

    it('does not re-derive when the device locale changes under a stored choice', async () => {
        mockDeviceLocale.value = 'en_US';
        await updateSetting('decimalSeparator', 'dot');

        // User travels, changes phone language, restores a backup - whatever.
        mockDeviceLocale.value = 'fr_FR';
        expect((await loadSettings()).decimalSeparator).toBe('dot');
    });

    it('keeps a stored space choice on an English device', async () => {
        mockDeviceLocale.value = 'fr_FR';
        await updateSetting('decimalSeparator', 'space');

        mockDeviceLocale.value = 'en_US';
        expect((await loadSettings()).decimalSeparator).toBe('space');
    });

    it('does not derive for an existing install whose stored settings predate the field', async () => {
        // Storage exists but carries no decimalSeparator. This is NOT a first
        // launch, so the static default applies rather than the device locale -
        // an upgrade must not silently restyle every amount in the app.
        mockDeviceLocale.value = 'fr_FR';
        await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify({
            theme: 'system',
            currency: 'XOF',
            currencyLocked: true,
            notificationsEnabled: false,
            language: 'fr',
            dateFormat: 'DD/MM/YYYY',
            firstDayOfWeek: 'monday',
            onboardingCompleted: true,
        }));

        expect((await loadSettings()).decimalSeparator).toBe('dot');
    });

    it('sanitises a corrupted profile to the static default, not to the device locale', async () => {
        mockDeviceLocale.value = 'fr_FR';
        await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify({
            ...getDefaultSettings(),
            decimalSeparator: 'semicolon',
        }));

        expect((await loadSettings()).decimalSeparator).toBe('dot');
    });

    it('accepts a stored space profile through sanitisation', async () => {
        await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify({
            ...getDefaultSettings(),
            decimalSeparator: 'space',
        }));

        expect((await loadSettings()).decimalSeparator).toBe('space');
    });
});
