/**
 * SettingsScreen - five more rows have stable testIDs (pass 94, item 2)
 *
 * The notifications Switch (SettingsScreen.tsx:205) and the security,
 * recurring, date format and export rows (:248, :257, :277, :316) had no
 * testID, while their neighbours did. Each now carries one. Each test checks
 * the id sits on the control showing the expected title, or on the Switch.
 *
 * Harness as in SettingsScreen.headerCard.test.tsx, in English.
 */

import { fireEvent, render, within } from '@testing-library/react-native';
import React from 'react';
import { Switch } from 'react-native';

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

const mockToggleNotifications = jest.fn();

jest.mock('../../hooks/useSettings', () => {
    const { getDefaultSettings } = jest.requireActual('../../data/services/settingsService');
    const { getCurrencyByCode } = jest.requireActual('../../domain/constants/currencies');
    const { getLanguageByCode } = jest.requireActual('../../domain/constants/languages');
    return {
        useSettings: () => ({
            settings: { ...getDefaultSettings(), currency: 'EUR', language: 'en' },
            currency: getCurrencyByCode('EUR'),
            language: getLanguageByCode('en'),
            isCurrencyLocked: false,
            createBackup: jest.fn(),
            restoreBackup: jest.fn(),
            resetAllData: jest.fn(),
            changeTheme: jest.fn(),
            handleCurrencySelect: jest.fn(),
            handleLanguageSelect: jest.fn(),
            toggleNotifications: mockToggleNotifications,
            notificationsBlockedNotice: false,
            openNotificationSettings: jest.fn(),
            resetCurrency: jest.fn(),
            cancelCurrencyReset: jest.fn(),
            changeDateFormat: jest.fn(),
            changeFirstDayOfWeek: jest.fn(),
            changeDecimalSeparator: jest.fn(),
            loading: false,
        }),
    };
});

jest.mock('../../components/security/SecuritySetupModal', () => ({
    SecuritySetupModal: () => null,
}));
jest.mock('../../components/settings/CurrencyPickerModal', () => ({
    CurrencyPickerModal: () => null,
}));
jest.mock('../../components/settings/LanguagePickerModal', () => ({
    LanguagePickerModal: () => null,
}));

beforeAll(async () => {
    await i18n.changeLanguage('en');
});

beforeEach(() => {
    jest.clearAllMocks();
});

describe('pass 94 item 2. SettingsScreen testIDs', () => {
    it.each([
        ['settings_security_item', 'settings.security'],
        ['settings_recurring_item', 'recurring.title'],
        ['settings_date_format_item', 'settings.dateFormat'],
        ['settings_export_item', 'export.title'],
    ])('pass 94 item 2. %s is the row titled %s', (id, key) => {
        const { getByTestId } = render(<SettingsScreen />);

        expect(within(getByTestId(id)).getByText(i18n.t(key))).toBeTruthy();
    });

    it('pass 94 item 2. settings_notifications_switch is the notifications Switch', () => {
        const { UNSAFE_getByType, getByTestId } = render(<SettingsScreen />);

        expect(UNSAFE_getByType(Switch).props.testID).toBe('settings_notifications_switch');
        fireEvent(getByTestId('settings_notifications_switch'), 'valueChange', true);
        expect(mockToggleNotifications).toHaveBeenCalledWith(true);
    });
});
