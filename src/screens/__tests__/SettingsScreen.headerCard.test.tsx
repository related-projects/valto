import { render, screen } from '@testing-library/react-native';
import React from 'react';

import i18n from '../../localization/i18n';
import { SettingsScreen } from '../SettingsScreen';

/**
 * SettingsScreen - no account-like header card
 *
 * Pass 77, Owner decision 1. The screen opened on a card holding an avatar, a
 * user name and "Compte Premium", with a chevron that led nowhere. The app has
 * no account and no paid offer, so the card is removed outright.
 *
 * The strings asserted absent are the bundle values at 4d9767a
 * (fr.json / en.json, settings.userName and settings.premiumAccount, :388-389).
 * They are written out here rather than read through t() because the keys go
 * with the card: once removed, t() would return the key itself and the
 * assertion would prove nothing.
 *
 * The screen title is the precondition: it is rendered with or without the
 * card, so a passing absence check cannot come from a screen that never drew.
 */

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
            settings: { ...getDefaultSettings(), currency: 'XOF', language: 'fr' },
            currency: getCurrencyByCode('XOF'),
            language: getLanguageByCode('fr'),
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

// The three modals are closed on first render and carry their own suites.
jest.mock('../../components/security/SecuritySetupModal', () => ({
    SecuritySetupModal: () => null,
}));
jest.mock('../../components/settings/CurrencyPickerModal', () => ({
    CurrencyPickerModal: () => null,
}));
jest.mock('../../components/settings/LanguagePickerModal', () => ({
    LanguagePickerModal: () => null,
}));

afterAll(async () => {
    await i18n.changeLanguage('en');
});

describe('SettingsScreen header card', () => {
    it.each([
        ['fr', 'settings.userName', 'Utilisateur Valto'],
        ['fr', 'settings.premiumAccount', 'Compte Premium'],
        ['en', 'settings.userName', 'Valto User'],
        ['en', 'settings.premiumAccount', 'Premium Account'],
    ])('in %s, does not show the text of %s (%s)', async (language, _key, text) => {
        await i18n.changeLanguage(language);
        render(<SettingsScreen />);

        expect(screen.getByText(i18n.t('settings.title'))).toBeTruthy();
        expect(screen.queryByText(text)).toBeNull();
    });
});
