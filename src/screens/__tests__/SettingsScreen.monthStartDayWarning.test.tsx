/**
 * Settings: the month start day confirmation warns when the current period
 * moves (REGISTRE C20, Owner decision 19/11 option A; pass 98b item 2)
 *
 * Budgets are created by the user for one period key and never carried over
 * (BudgetRepository.create, called only from AddBudgetModal through
 * useBudgets.createBudget). A start-day change can move the key of the current
 * period:
 *  - forward (25 Nov, 1 -> 20: 2026-11 -> 2026-12): the budgets of the old
 *    current period stay in the previous period, and the new one has none;
 *  - backward (25 Nov, 20 -> 1: 2026-12 -> 2026-11): they move to the next
 *    period, and the current one shows the budgets stored under its own key.
 * The confirmation says which, naming the old period by its label (its month
 * name at start day 1, its dates otherwise). When the key does not move
 * (10 Nov, 1 -> 20) it says nothing more.
 *
 * Harness of SettingsScreen.monthStartDay.test.tsx: the real useSettings and
 * settingsService on the AsyncStorage mock; the clock pinned with pinClock and
 * local fixtures, so the file holds under TZ=UTC, Africa/Lagos and
 * America/New_York.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { fireEvent, render, waitFor, within } from '@testing-library/react-native';
import React from 'react';
import { Alert } from 'react-native';

import { pinClock, restoreZoneClock } from '../../../tests/helpers/zoneClock';
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

const base = (day: number): string => `Your months will be regrouped from day ${day}. Budgets keep their month.`;
const previous = (period: string): string =>
    `Your budgets for ${period} stay in the previous period. Create budgets for the new period.`;
const next = (period: string): string =>
    `Your budgets for ${period} move to the next period. Check the budgets of the current period.`;
const SHORT_MONTHS = 'In shorter months, your month starts on the last day.';

/**
 * The confirmation message shown when the stored start day is `stored` and the
 * user picks `day`, on `month`/`date` 2026 at local noon.
 */
async function confirmationFor(stored: number, day: number, month: number, date: number): Promise<string> {
    await AsyncStorage.clear();
    await AsyncStorage.setItem(StorageKeys.SETTINGS, JSON.stringify({ ...BLOB, monthStartDay: stored }));
    pinClock(new Date(2026, month - 1, date, 12, 0).getTime());
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);

    const screen = render(<SettingsScreen />);
    await waitFor(() => {
        expect(within(screen.getByTestId('settings_month_start_item')).getByText(`Day ${stored}`)).toBeTruthy();
        expect(within(screen.getByTestId('settings_currency_item')).getByText('\u20ac EUR (locked)')).toBeTruthy();
    });
    fireEvent.press(screen.getByTestId('settings_month_start_item'));
    fireEvent.press(screen.getByTestId(`month_start_day_option_${day}`));

    expect(alertSpy).toHaveBeenCalledTimes(1);
    const message = String(alertSpy.mock.calls[0][1]);
    screen.unmount();
    alertSpy.mockRestore();
    return message;
}

beforeAll(async () => {
    await i18n.changeLanguage('en');
});

afterEach(() => {
    restoreZoneClock();
    jest.restoreAllMocks();
});

describe('pass 98b item 2. the confirmation and the budgets of the current period', () => {
    it('pass 98b item 2. warns when the current period moves forward (25 Nov, 1 -> 20), and not when it stays (10 Nov, 1 -> 20)', async () => {
        expect(await confirmationFor(1, 20, 11, 25)).toBe(`${base(20)}\n\n${previous('November 2026')}`);
        expect(await confirmationFor(1, 20, 11, 10)).toBe(base(20));
    });

    it('pass 98b item 2. names an old period of a start day other than 1 by its dates (25 Nov, 10 -> 20)', async () => {
        expect(await confirmationFor(10, 20, 11, 25)).toBe(`${base(20)}\n\n${previous('10 Nov - 9 Dec 2026')}`);
    });

    it('pass 98b item 2. says the budgets move to the next period when the current period moves back', async () => {
        // 25 Nov, 20 -> 1: 2026-12 (20 Nov - 19 Dec) -> 2026-11.
        expect(await confirmationFor(20, 1, 11, 25)).toBe(`${base(1)}\n\n${next('20 Nov - 19 Dec 2026')}`);
        // 5 Nov, 1 -> 10: 2026-11 -> 2026-10 (10 Oct - 9 Nov).
        expect(await confirmationFor(1, 10, 11, 5)).toBe(`${base(10)}\n\n${next('November 2026')}`);
    });

    it('pass 98b item 2. puts the warning before the shorter-months note (30 Nov, 1 -> 30)', async () => {
        expect(await confirmationFor(1, 30, 11, 30)).toBe(
            `${base(30)}\n\n${previous('November 2026')}\n\n${SHORT_MONTHS}`,
        );
    });
});
