/**
 * WalletsScreen - the cards and the add controls have stable testIDs
 * (pass 94, item 2)
 *
 * Four controls had no testID (WalletsScreen.tsx:95, :123, :165, :219): the
 * wallet card, the menu button on it, the empty-state call to action and the
 * header add button. Each now carries one; the card and its menu carry the
 * wallet id. Each test checks the id sits on the control showing the expected
 * content, so an id on the wrong element fails too.
 *
 * Harness as in WalletsScreen.windowSize.test.tsx (two wallets) and
 * WalletsScreen.addButtonsA11y.test.tsx (none). useWallets is a jest.fn here
 * so one file can serve both.
 */

import { render, within } from '@testing-library/react-native';
import React from 'react';

import i18n from '../../localization/i18n';
import { makeWallet } from '../../test-utils/testFactories';
import { WalletsScreen } from '../WalletsScreen';

jest.mock('react-native-safe-area-context', () => ({
    useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.mock('../../hooks/useWallets', () => ({
    useWallets: jest.fn(),
}));

jest.mock('../../hooks/useTransactions', () => ({
    useTransactions: () => ({ transactions: [] }),
}));

jest.mock('../../hooks/useFormatting', () => ({
    useFormatting: () => ({
        formatAmount: (value: number) => String(value),
        formatAmountCompactLarge: (value: number) => String(value),
    }),
}));

jest.mock('../../components/modals/AddWalletModal', () => ({ AddWalletModal: () => null }));
jest.mock('../../components/modals/EditWalletModal', () => ({ EditWalletModal: () => null }));
jest.mock('../../components/transactions/TransactionList', () => ({ TransactionList: () => null }));

const mockedUseWallets = jest.requireMock('../../hooks/useWallets').useWallets as jest.Mock;

const MAIN = makeWallet({ id: 'w-main', name: 'Main Wallet' });
const SAVINGS = makeWallet({ id: 'w-savings', name: 'Savings Wallet' });

function withWallets(wallets: ReturnType<typeof makeWallet>[]) {
    mockedUseWallets.mockReturnValue({ wallets, getTotalBalance: () => 0, refreshWallets: jest.fn() });
}

beforeAll(async () => {
    await i18n.changeLanguage('en');
});

beforeEach(() => {
    jest.clearAllMocks();
});

describe('pass 94 item 2. WalletsScreen testIDs', () => {
    it.each([MAIN, SAVINGS])('pass 94 item 2. the card of $name carries its wallet id, with its menu inside', (wallet) => {
        withWallets([MAIN, SAVINGS]);
        const { getByTestId } = render(<WalletsScreen />);

        const card = getByTestId(`wallet_card_${wallet.id}`);
        expect(within(card).getByText(wallet.name)).toBeTruthy();
        expect(within(card).getByTestId(`wallet_card_menu_${wallet.id}`)).toBeTruthy();
    });

    it('pass 94 item 2. wallets_add_button is the header button showing wallets.add', () => {
        withWallets([MAIN]);
        const { getByTestId } = render(<WalletsScreen />);

        expect(within(getByTestId('wallets_add_button')).getByText(i18n.t('wallets.add'))).toBeTruthy();
    });

    it('pass 94 item 2. wallets_create_first is the empty-state button showing wallets.createFirst', () => {
        withWallets([]);
        const { getByTestId } = render(<WalletsScreen />);

        expect(within(getByTestId('wallets_create_first')).getByText(i18n.t('wallets.createFirst'))).toBeTruthy();
    });
});
