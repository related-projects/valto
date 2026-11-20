/**
 * The "month starts on" setting (REGISTRE C20 step 2, pass 98 item 1).
 *
 * monthStartDay is an optional field of the settings blob, additive (policy
 * 10): a blob or a backup written before it existed has no such field and
 * loads as 1, the calendar month, and an invalid value loads as 1 too - the
 * rule firstDayOfWeek follows at settingsService.ts loadSettings. Loading never
 * writes the field: nothing is written at upgrade.
 *
 * The stored values 1, 20 and 31 are proved through the Settings row that
 * shows them (src/screens/__tests__/SettingsScreen.monthStartDay.test.tsx).
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { loadSettings } from '../services/settingsService';
import { StorageKeys } from '../storage';
import { validateSettings } from '../../domain/validators';
import type { AppSettings } from '../../domain/entities/Settings';

/** A blob as an installed 1.1.4 holds it: marker set, no monthStartDay. */
const OLD_BLOB = {
    theme: 'system',
    currency: 'EUR',
    currencyLocked: true,
    notificationsEnabled: false,
    language: 'en',
    dateFormat: 'DD/MM/YYYY',
    firstDayOfWeek: 'monday',
    decimalSeparator: 'comma',
    onboardingCompleted: true,
    dateFormatLocaleApplied: true,
};

async function storeRaw(value: Record<string, unknown>): Promise<void> {
    await AsyncStorage.setItem(StorageKeys.SETTINGS, JSON.stringify(value));
}

async function readRaw(): Promise<Record<string, unknown>> {
    const raw = await AsyncStorage.getItem(StorageKeys.SETTINGS);
    return JSON.parse(raw ?? 'null') as Record<string, unknown>;
}

/** Writes to the settings key made since the last clearAllMocks. */
function settingsWrites(): number {
    return (AsyncStorage.setItem as jest.Mock).mock.calls
        .filter(([key]) => key === StorageKeys.SETTINGS).length;
}

const VALID: AppSettings = {
    theme: 'system',
    currency: 'USD',
    currencyLocked: false,
    notificationsEnabled: false,
    language: 'en',
    dateFormat: 'MM/DD/YYYY',
    firstDayOfWeek: 'monday',
    decimalSeparator: 'dot',
    onboardingCompleted: true,
};

beforeEach(async () => {
    await AsyncStorage.clear();
    jest.clearAllMocks();
});

describe('pass 98 item 1. loading monthStartDay', () => {
    it('pass 98 item 1. a blob without the field loads as 1, and loading writes nothing', async () => {
        await storeRaw(OLD_BLOB);
        jest.clearAllMocks();

        const settings = await loadSettings();

        expect(settings.monthStartDay).toBe(1);
        expect(settingsWrites()).toBe(0);
        expect(await readRaw()).not.toHaveProperty('monthStartDay');
    });

    it.each([
        ['0', 0],
        ['32', 32],
        ['1.5', 1.5],
        ['the string "20"', '20'],
        ['null', null],
        ['-5', -5],
    ])('pass 98 item 1. an invalid stored value (%s) loads as 1', async (_label, value) => {
        await storeRaw({ ...OLD_BLOB, monthStartDay: value });

        const settings = await loadSettings();

        expect(settings.monthStartDay).toBe(1);
    });
});

describe('pass 98 item 1. validating monthStartDay', () => {
    it('pass 98 item 1. accepts 1, 20, 31 and an absent field; refuses 0, 32, 1.5 and "20"', () => {
        const outcome = (value: unknown): string => {
            try {
                validateSettings({ ...VALID, monthStartDay: value } as AppSettings);
                return 'accepted';
            } catch {
                return 'refused';
            }
        };

        expect({
            1: outcome(1),
            20: outcome(20),
            31: outcome(31),
            absent: outcome(undefined),
            0: outcome(0),
            32: outcome(32),
            '1.5': outcome(1.5),
            '"20"': outcome('20'),
        }).toEqual({
            1: 'accepted',
            20: 'accepted',
            31: 'accepted',
            absent: 'accepted',
            0: 'refused',
            32: 'refused',
            '1.5': 'refused',
            '"20"': 'refused',
        });
    });
});
