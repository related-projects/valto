/**
 * SettingsScreen - the currency picker it hosts, with the keyboard up (pass 95)
 *
 * SettingsScreen mounts CurrencyPickerModal inside its own ScrollView. The
 * touch responder walks the React tree, not the native window, so that
 * ScrollView is offered every tap made inside the picker before the picker's
 * rows are. With keyboardShouldPersistTaps unset ("never") it takes the first
 * tap after a search to close the keyboard, whatever the picker's own list
 * says.
 *
 * Jest has no soft keyboard, so this pins the prop on every scroll view above a
 * picker row (see test-utils/scrollAncestors): the picker's list and the
 * settings ScrollView.
 *
 * Harness as in SettingsScreen.testIDs.test.tsx, with the real picker.
 */

import { fireEvent, render } from '@testing-library/react-native';
import React from 'react';

import { SUPPORTED_CURRENCIES } from '../../domain/constants/currencies';
import i18n from '../../localization/i18n';
import { scrollAncestorTapModes } from '../../test-utils/scrollAncestors';
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
            toggleNotifications: jest.fn(),
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

jest.mock('../../components/settings/LanguagePickerModal', () => ({
    LanguagePickerModal: () => null,
}));

const FIRST = SUPPORTED_CURRENCIES[0];

beforeAll(async () => {
    await i18n.changeLanguage('en');
});

describe('pass 95. SettingsScreen currency picker with the keyboard up', () => {
    it('pass 95. every scroll view above a picker row keeps the tap for the row', () => {
        const { getByTestId, queryByTestId } = render(<SettingsScreen />);
        // The forcing: the picker is closed until the currency row is pressed.
        expect(queryByTestId(`currency_picker_item_${FIRST.code}`)).toBeNull();
        fireEvent.press(getByTestId('settings_currency_item'));

        // Nearest first: the picker's list, then the settings ScrollView.
        expect(scrollAncestorTapModes(getByTestId(`currency_picker_item_${FIRST.code}`))).toEqual([
            'handled',
            'handled',
        ]);
    });
});
