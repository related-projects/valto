/**
 * Settings: the "Month starts on" row (REGISTRE C20 step 2, pass 98 items 1-3)
 *
 * A new section "Budget" holds one row, "Month starts on", whose value reads
 * "Day N". It opens a scrollable picker of the days 1-31; picking a day other
 * than the current one asks for confirmation ("Your months will be regrouped
 * from day N. Budgets keep their month."), and only Continue stores it and
 * emits the 'settings' data event the hooks listen to. Below the row, a helper
 * text; for 29-31, a note on shorter months. The "First day of week" row is
 * gone from the screen.
 *
 * The real useSettings and settingsService run on the AsyncStorage mock, so the
 * row shows what loadSettings makes of the stored blob: 1, 20 and 31 as
 * stored, an absent or invalid value as 1.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, fireEvent, render, waitFor, within } from '@testing-library/react-native';
import React from 'react';
import { Alert, type AlertButton } from 'react-native';

import { pinClock, restoreZoneClock } from '../../../tests/helpers/zoneClock';
import { dataEvents } from '../../core/events';
import { StorageKeys } from '../../data/storage';
import i18n from '../../localization/i18n';
import { SettingsScreen } from '../SettingsScreen';

jest.mock('react-native-safe-area-context', () => ({
    useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.mock('expo-router', () => ({
    useRouter: () => ({ push: jest.fn() }),
}));

jest.mock('../../core/security/SecurityContext', () => ({
    useSecurity: () => ({
        isSecurityEnabled: false,
        securityConfig: null,
        biometrics: { available: false, enrolled: false },
        disableSecurity: jest.fn(),
    }),
}));

jest.mock('../../data/services/notificationService', () => ({
    getPermissionStatus: jest.fn().mockResolvedValue('granted'),
    scheduleDailyReminder: jest.fn().mockResolvedValue(undefined),
    setNotificationsEnabled: jest.fn().mockResolvedValue({ enabled: false, permissionDenied: false }),
}));

jest.mock('../../data/services/backupService', () => ({
    createAndShareBackup: jest.fn(),
    pickAndRestoreBackup: jest.fn(),
    SnapshotRejectedError: class SnapshotRejectedError extends Error {},
}));

jest.mock('../../data/services/resetService', () => ({
    resetAppData: jest.fn(),
    resetFinancialDataForCurrencyReset: jest.fn(),
}));

jest.mock('../../components/security/SecuritySetupModal', () => ({
    SecuritySetupModal: () => null,
}));
jest.mock('../../components/settings/CurrencyPickerModal', () => ({
    CurrencyPickerModal: () => null,
}));
jest.mock('../../components/settings/LanguagePickerModal', () => ({
    LanguagePickerModal: () => null,
}));

const BLOB = {
    theme: 'system',
    currency: 'EUR',
    currencyLocked: true,
    notificationsEnabled: false,
    language: 'en',
    dateFormat: 'YYYY-MM-DD',
    firstDayOfWeek: 'monday',
    decimalSeparator: 'dot',
    onboardingCompleted: true,
    dateFormatLocaleApplied: true,
};

const HELPER = 'Choose the earliest day your salary can arrive. The dashboard, budgets and reports follow this day.';
const SHORT_MONTHS = 'In shorter months, your month starts on the last day.';

async function store(monthStartDay: unknown): Promise<void> {
    const blob = monthStartDay === undefined ? BLOB : { ...BLOB, monthStartDay };
    await AsyncStorage.setItem(StorageKeys.SETTINGS, JSON.stringify(blob));
}

async function storedStartDay(): Promise<unknown> {
    const raw = JSON.parse((await AsyncStorage.getItem(StorageKeys.SETTINGS)) ?? '{}') as Record<string, unknown>;
    return raw.monthStartDay;
}

/** Render, and wait until the stored blob has reached the screen (the locked EUR row). */
async function renderLoaded() {
    const screen = render(<SettingsScreen />);
    await waitFor(() => {
        expect(within(screen.getByTestId('settings_currency_item')).getByText('\u20ac EUR (locked)')).toBeTruthy();
    });
    return screen;
}

let alertSpy: jest.SpyInstance;

beforeAll(async () => {
    await i18n.changeLanguage('en');
});

beforeEach(async () => {
    await AsyncStorage.clear();
    // 10 Nov 2026: no change made here moves the current period, so the
    // confirmation is the plain one (pass 98b covers the warning in
    // SettingsScreen.monthStartDayWarning.test.tsx).
    pinClock(new Date(2026, 10, 10, 12, 0).getTime());
    alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
});

afterEach(() => {
    restoreZoneClock();
    jest.restoreAllMocks();
});

/** The buttons of the last Alert.alert call. */
function lastAlertButtons(): AlertButton[] {
    const call = alertSpy.mock.calls[alertSpy.mock.calls.length - 1];
    return (call?.[2] ?? []) as AlertButton[];
}

describe('pass 98 item 2. the Budget section and its row', () => {
    it.each([
        ['1', 1, 'Day 1'],
        ['20', 20, 'Day 20'],
        ['31', 31, 'Day 31'],
        ['absent', undefined, 'Day 1'],
        ['invalid (0)', 0, 'Day 1'],
        ['invalid ("x")', 'x', 'Day 1'],
    ])('pass 98 item 1. a stored value %s shows "Month starts on" / %s', async (_label, value, expected) => {
        await store(value);

        const { getByTestId, getByText } = await renderLoaded();

        expect(getByText('Budget')).toBeTruthy();
        const row = getByTestId('settings_month_start_item');
        expect(within(row).getByText('Month starts on')).toBeTruthy();
        expect(within(row).getByText(expected)).toBeTruthy();
    });

    it('pass 98 item 2. shows the helper text, and the shorter-months note only for 29-31', async () => {
        await store(20);
        const twenty = await renderLoaded();
        expect(twenty.getByTestId('settings_month_start_helper').props.children).toBe(HELPER);
        expect(twenty.queryByTestId('settings_month_start_short_months_note')).toBeNull();
        twenty.unmount();

        await store(30);
        const thirty = await renderLoaded();
        expect(thirty.getByTestId('settings_month_start_short_months_note').props.children).toBe(SHORT_MONTHS);
    });

    it('pass 98 item 3. the "First Day of Week" row is gone', async () => {
        await store(undefined);

        const { queryByText, getByTestId } = await renderLoaded();

        expect(getByTestId('settings_date_format_item')).toBeTruthy();
        expect(queryByText('First Day of Week')).toBeNull();
    });
});

describe('pass 98 item 2. the day picker', () => {
    it('pass 98 item 2. opens on the row and offers the days 1 to 31', async () => {
        await store(20);
        const { getByTestId, queryByTestId } = await renderLoaded();

        expect(queryByTestId('month_start_day_option_1')).toBeNull();
        fireEvent.press(getByTestId('settings_month_start_item'));

        for (let day = 1; day <= 31; day++) {
            expect(within(getByTestId(`month_start_day_option_${day}`)).getByText(String(day))).toBeTruthy();
        }
        expect(queryByTestId('month_start_day_option_0')).toBeNull();
        expect(queryByTestId('month_start_day_option_32')).toBeNull();
        expect(getByTestId('month_start_day_picker_close')).toBeTruthy();
    });

    it('pass 98 item 2. picking the current day asks nothing and stores nothing', async () => {
        await store(20);
        const { getByTestId } = await renderLoaded();

        fireEvent.press(getByTestId('settings_month_start_item'));
        fireEvent.press(getByTestId('month_start_day_option_20'));

        expect(alertSpy).not.toHaveBeenCalled();
        expect(await storedStartDay()).toBe(20);
    });
});

describe('pass 98 item 2. the confirmation', () => {
    it('pass 98 item 2. asks before regrouping; Continue stores the day and emits the settings event', async () => {
        await store(undefined);
        const emitSpy = jest.spyOn(dataEvents, 'emit');
        const { getByTestId } = await renderLoaded();

        fireEvent.press(getByTestId('settings_month_start_item'));
        fireEvent.press(getByTestId('month_start_day_option_20'));

        expect(alertSpy).toHaveBeenCalledTimes(1);
        expect(alertSpy.mock.calls[0][0]).toBe('Month starts on');
        expect(alertSpy.mock.calls[0][1]).toBe('Your months will be regrouped from day 20. Budgets keep their month.');
        expect(lastAlertButtons().map(b => b.text)).toEqual(['Cancel', 'Continue']);
        expect(await storedStartDay()).toBeUndefined();

        await act(async () => {
            await lastAlertButtons()[1].onPress?.();
        });

        expect(await storedStartDay()).toBe(20);
        expect(emitSpy).toHaveBeenCalledWith('settings');
        await waitFor(() => {
            expect(within(getByTestId('settings_month_start_item')).getByText('Day 20')).toBeTruthy();
        });
    });

    it('pass 98 item 2. for 29-31 the confirmation adds the shorter-months note', async () => {
        await store(undefined);
        const { getByTestId } = await renderLoaded();

        fireEvent.press(getByTestId('settings_month_start_item'));
        fireEvent.press(getByTestId('month_start_day_option_30'));

        expect(alertSpy.mock.calls[0][1]).toBe(
            `Your months will be regrouped from day 30. Budgets keep their month.\n\n${SHORT_MONTHS}`,
        );
    });

    it('pass 98 item 2. Cancel stores nothing', async () => {
        await store(undefined);
        const emitSpy = jest.spyOn(dataEvents, 'emit');
        const { getByTestId } = await renderLoaded();

        fireEvent.press(getByTestId('settings_month_start_item'));
        fireEvent.press(getByTestId('month_start_day_option_20'));
        expect(alertSpy).toHaveBeenCalledTimes(1);

        await act(async () => {
            await lastAlertButtons()[0].onPress?.();
        });

        expect(await storedStartDay()).toBeUndefined();
        expect(emitSpy).not.toHaveBeenCalledWith('settings');
        expect(within(getByTestId('settings_month_start_item')).getByText('Day 1')).toBeTruthy();
    });
});
