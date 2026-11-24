/**
 * Settings: at the end of the list, the "About" row clears the "+" button
 * (REGISTRE C47, pass 101b item 3)
 *
 * The tab bar and its floating "+" button are drawn over the bottom of every
 * tab screen (CustomTabBar is absolutely positioned). The "+" sits right
 * above the tab bar, at the right edge; its top is
 *   tab bar height + bottom inset + gap + button size
 * from the bottom of the screen. Settings ended its list with a fixed bottom
 * padding (spacing.tabBarOffset, 100) plus the last section's own bottom
 * margin, so once the bottom inset passed a few dp (edge-to-edge is on, so
 * the inset is the navigation bar's height), the last row - About, with its
 * chevron at the right - ended under the "+".
 *
 * Jest renders no layout, so it cannot observe the overlap itself. This test
 * checks the inputs of that layout instead, read from the rendered trees: the
 * "+" button's bottom offset and height, Settings' bottom padding, and the
 * bottom margin of the section holding About. At full scroll the About row's
 * bottom sits (padding + margin) above the screen bottom; it must be at or
 * above the "+" button's top. Inset 0 is a control: the row already cleared
 * the button there.
 */

import { render } from '@testing-library/react-native';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import React from 'react';
import { ScrollView, StyleSheet } from 'react-native';

import { CustomTabBar } from '../../components/navigation/CustomTabBar';
import i18n from '../../localization/i18n';
import { SettingsScreen } from '../SettingsScreen';

let mockBottomInset = 0;

jest.mock('react-native-safe-area-context', () => ({
    useSafeAreaInsets: () => ({ top: 0, bottom: mockBottomInset, left: 0, right: 0 }),
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
            changeMonthStartDay: jest.fn(),
            changeDecimalSeparator: jest.fn(),
            loading: false,
        }),
    };
});

jest.mock('../../components/modals/AddTransactionModal', () => ({
    AddTransactionModal: () => null,
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

interface Node {
    props: Record<string, unknown>;
    parent: Node | null;
}

type Flat = { bottom?: number; height?: number; marginBottom?: number; paddingBottom?: number };

const flat = (style: unknown): Flat => (StyleSheet.flatten(style as never) ?? {}) as Flat;

const ROUTES = ['index', 'transactions', 'wallets', 'reports', 'settings'];

function tabBarProps(): BottomTabBarProps {
    const routes = ROUTES.map((name) => ({ key: `${name}-key`, name }));
    const descriptors = Object.fromEntries(
        routes.map((route) => [route.key, { options: { title: route.name } }]),
    );
    return {
        state: { index: ROUTES.indexOf('settings'), routes },
        descriptors,
        navigation: { emit: () => ({ defaultPrevented: false }), navigate: jest.fn() },
        insets: { top: 0, bottom: mockBottomInset, left: 0, right: 0 },
    } as unknown as BottomTabBarProps;
}

/** Distance from the screen bottom to the top of the "+" button, as CustomTabBar renders it. */
function fabTop(): number {
    const { getByTestId, unmount } = render(<CustomTabBar {...tabBarProps()} />);
    const style = flat(getByTestId('fab_add_transaction').props.style);
    unmount();
    return (style.bottom ?? NaN) + (style.height ?? NaN);
}

/** Distance from the screen bottom to the bottom of the About row, Settings scrolled to its end. */
function aboutRowBottom(): number {
    const { UNSAFE_getAllByType, getByText, unmount } = render(<SettingsScreen />);
    const paddingBottom = flat(UNSAFE_getAllByType(ScrollView)[0].props.contentContainerStyle).paddingBottom ?? NaN;

    // The first bottom margin above the row is that of the section holding it.
    let marginBottom = NaN;
    for (let node: Node | null = getByText(i18n.t('settings.aboutValto')) as unknown as Node; node; node = node.parent) {
        const margin = flat(node.props.style).marginBottom;
        if (margin !== undefined) {
            marginBottom = margin;
            break;
        }
    }
    unmount();
    return paddingBottom + marginBottom;
}

beforeAll(async () => {
    await i18n.changeLanguage('en');
});

describe('C47 pass 101b item 3. Settings: the About row clears the "+" button', () => {
    it.each([24, 48])('C47 pass 101b item 3: with a bottom inset of %i dp, the About row ends above the "+" button', (inset) => {
        mockBottomInset = inset;

        expect(aboutRowBottom()).toBeGreaterThanOrEqual(fabTop());
    });

    it('control: with no bottom inset, the About row ends above the "+" button', () => {
        mockBottomInset = 0;

        expect(aboutRowBottom()).toBeGreaterThanOrEqual(fabTop());
    });
});
