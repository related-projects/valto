/**
 * Settings: the theme and date-format pickers keep every option and a Cancel
 * control on Android (REGISTRE C43, pass 101b item 1)
 *
 * Both rows opened an Alert with three options plus Cancel. On Android an
 * Alert shows at most three buttons (react-native Libraries/Alert/Alert.js
 * keeps buttons.slice(0, 3)), so Cancel was dropped, and the dialog is not
 * cancelable, so Back did not close it either. Each row now opens the same
 * option picker as "Month starts on": every option is a row, and an X control
 * labelled with the Cancel key closes it without storing anything.
 *
 * The first assertion of each test is the regression check: no Alert with
 * more than three buttons is opened by the row. The real useSettings and
 * settingsService run on the AsyncStorage mock.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, fireEvent, render, waitFor, within } from '@testing-library/react-native';
import React from 'react';
import { Alert, type AlertButton } from 'react-native';

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
    dateFormat: 'MM/DD/YYYY',
    decimalSeparator: 'dot',
    onboardingCompleted: true,
    dateFormatLocaleApplied: true,
};

interface PickerCase {
    name: string;
    row: string;
    close: string;
    /** [testID, label] of every option, in order. */
    options: [string, string][];
    pick: string;
    storedKey: 'theme' | 'dateFormat';
    storedValue: string;
    /** What the row shows before any change. */
    initialText: string;
}

const PICKERS: PickerCase[] = [
    {
        name: 'theme',
        row: 'settings_theme_item',
        close: 'theme_picker_close',
        options: [
            ['theme_picker_option_system', 'System'],
            ['theme_picker_option_light', 'Light'],
            ['theme_picker_option_dark', 'Dark'],
        ],
        pick: 'theme_picker_option_dark',
        storedKey: 'theme',
        storedValue: 'dark',
        initialText: 'System',
    },
    {
        name: 'date format',
        row: 'settings_date_format_item',
        close: 'date_format_picker_close',
        options: [
            ['date_format_picker_option_dd_mm_yyyy', 'DD/MM/YYYY'],
            ['date_format_picker_option_mm_dd_yyyy', 'MM/DD/YYYY'],
            ['date_format_picker_option_yyyy_mm_dd', 'YYYY-MM-DD'],
        ],
        pick: 'date_format_picker_option_yyyy_mm_dd',
        storedKey: 'dateFormat',
        storedValue: 'YYYY-MM-DD',
        initialText: 'MM/DD/YYYY',
    },
];

async function storedBlob(): Promise<Record<string, unknown>> {
    return JSON.parse((await AsyncStorage.getItem(StorageKeys.SETTINGS)) ?? '{}') as Record<string, unknown>;
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

/** Every Alert.alert call that passed more than three buttons: title and button texts. */
function alertsOverThreeButtons(): { title: unknown; buttons: (string | undefined)[] }[] {
    return alertSpy.mock.calls
        .filter((call) => ((call[2] ?? []) as AlertButton[]).length > 3)
        .map((call) => ({ title: call[0], buttons: (call[2] as AlertButton[]).map((b) => b.text) }));
}

beforeAll(async () => {
    await i18n.changeLanguage('en');
});

beforeEach(async () => {
    await AsyncStorage.clear();
    await AsyncStorage.setItem(StorageKeys.SETTINGS, JSON.stringify(BLOB));
    alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
});

afterEach(() => {
    jest.restoreAllMocks();
});

describe('C43 pass 101b item 1. theme and date-format pickers', () => {
    it.each(PICKERS)('C43 pass 101b item 1 ($name): the row opens no Alert of more than 3 buttons; every option and Cancel are shown', async (c) => {
        const { getByTestId } = await renderLoaded();
        expect(within(getByTestId(c.row)).getByText(c.initialText)).toBeTruthy();

        fireEvent.press(getByTestId(c.row));

        expect(alertsOverThreeButtons()).toEqual([]);
        for (const [testID, label] of c.options) {
            expect(within(getByTestId(testID)).getByText(label)).toBeTruthy();
        }
        expect(getByTestId(c.close).props.accessibilityLabel).toBe('Cancel');
    });

    it.each(PICKERS)('C43 pass 101b item 1 ($name): picking an option stores it and the row shows it', async (c) => {
        const { getByTestId, queryByTestId } = await renderLoaded();

        fireEvent.press(getByTestId(c.row));
        expect(alertsOverThreeButtons()).toEqual([]);

        await act(async () => {
            fireEvent.press(getByTestId(c.pick));
        });

        await waitFor(async () => {
            expect((await storedBlob())[c.storedKey]).toBe(c.storedValue);
        });
        expect(queryByTestId(c.pick)).toBeNull();
        await waitFor(() => {
            expect(within(getByTestId(c.row)).getByText(c.options.find(([id]) => id === c.pick)?.[1] ?? '')).toBeTruthy();
        });
        expect(alertSpy).not.toHaveBeenCalled();
    });

    it.each(PICKERS)('C43 pass 101b item 1 ($name): Cancel closes the picker and stores nothing', async (c) => {
        const { getByTestId, queryByTestId } = await renderLoaded();
        const before = await storedBlob();

        fireEvent.press(getByTestId(c.row));
        expect(alertsOverThreeButtons()).toEqual([]);

        await act(async () => {
            fireEvent.press(getByTestId(c.close));
        });

        expect(queryByTestId(c.pick)).toBeNull();
        expect(await storedBlob()).toEqual(before);
        expect(within(getByTestId(c.row)).getByText(c.initialText)).toBeTruthy();
    });
});
