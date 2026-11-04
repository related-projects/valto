/**
 * WalletsScreen - large card balances and the total are compact, labelled exact
 * (V-128, pass 89)
 *
 * The wallet card balance and the "Total" line are tight places (pass 87
 * inventory): from 1 000 000 major units they are shown compact, and each
 * carries the exact formatAmount output as its accessibilityLabel.
 *
 * Real useFormatting with settingsService.loadSettings mocked one level below it
 * (harness of BalanceCard.amountFit.test.tsx). XOF: 0 decimals, symbol "FCFA";
 * space profile: group U+00A0, decimal comma, symbol after U+00A0. The modals and
 * the transaction list are replaced by nulls, as in WalletsScreen.windowSize.test.tsx.
 */

import { render, screen } from '@testing-library/react-native';
import React from 'react';

import { getDefaultSettings } from '../../data/services/settingsService';
import i18n from '../../localization/i18n';
import { WalletsScreen } from '../WalletsScreen';

jest.mock('react-native-safe-area-context', () => ({
    useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.mock('../../hooks/useWallets', () => {
    const { makeWallet } = jest.requireActual('../../test-utils/testFactories');
    const wallets = [
        makeWallet({ id: 'w-main', name: 'Main Wallet', balance: 1_999_999 }),
        makeWallet({ id: 'w-small', name: 'Small Wallet', balance: 999_999 }),
    ];
    return {
        useWallets: () => ({ wallets, getTotalBalance: () => 2_500_000_000, refreshWallets: jest.fn() }),
    };
});

jest.mock('../../hooks/useTransactions', () => ({
    useTransactions: () => ({ transactions: [] }),
}));

jest.mock('../../data/services/settingsService', () => {
    const actual = jest.requireActual('../../data/services/settingsService');
    return { ...actual, loadSettings: jest.fn() };
});

jest.mock('../../components/modals/AddWalletModal', () => ({ AddWalletModal: () => null }));
jest.mock('../../components/modals/EditWalletModal', () => ({ EditWalletModal: () => null }));
jest.mock('../../components/transactions/TransactionList', () => ({ TransactionList: () => null }));

const mockedLoadSettings = jest.requireMock('../../data/services/settingsService')
    .loadSettings as jest.Mock;

const NBSP = '\u00A0';

const CARD_COMPACT = `1,9${NBSP}M${NBSP}FCFA`;
const CARD_EXACT = `1${NBSP}999${NBSP}999${NBSP}FCFA`;
const SMALL_EXACT = `999${NBSP}999${NBSP}FCFA`;
const TOTAL_COMPACT = () => i18n.t('wallets.total', { amount: `2,5${NBSP}Md${NBSP}FCFA` });
const TOTAL_EXACT = () => i18n.t('wallets.total', { amount: `2${NBSP}500${NBSP}000${NBSP}000${NBSP}FCFA` });

/** The small wallet is below 1 000 000, so its exact string proves the XOF / space settings are loaded. */
const settingsLoaded = () => screen.findByText(SMALL_EXACT);

beforeAll(async () => {
    await i18n.changeLanguage('fr');
});

afterAll(async () => {
    await i18n.changeLanguage('en');
});

beforeEach(() => {
    jest.clearAllMocks();
    mockedLoadSettings.mockResolvedValue({
        ...getDefaultSettings(),
        currency: 'XOF',
        language: 'fr',
        decimalSeparator: 'space',
    });
});

describe('WalletsScreen - compact large amounts', () => {
    it('shows a card balance of 1 999 999 compact, labelled exact', async () => {
        render(<WalletsScreen />);
        await settingsLoaded();

        const node = screen.getByText(CARD_COMPACT);
        expect(node.props.children).toBe(CARD_COMPACT);
        expect(node.props.accessibilityLabel).toBe(CARD_EXACT);
    });

    it('shows a card balance below 1 000 000 exact, labelled exact', async () => {
        render(<WalletsScreen />);
        const node = await settingsLoaded();

        expect(node.props.children).toBe(SMALL_EXACT);
        expect(node.props.accessibilityLabel).toBe(SMALL_EXACT);
    });

    it('shows the total compact inside its sentence, the sentence labelled exact', async () => {
        render(<WalletsScreen />);
        await settingsLoaded();

        const node = screen.getByText(TOTAL_COMPACT());
        expect(node.props.children).toBe(TOTAL_COMPACT());
        expect(node.props.accessibilityLabel).toBe(TOTAL_EXACT());
    });
});
