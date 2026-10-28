/**
 * The Wallets add controls are announced as buttons (pass 84b, item 4)
 *
 * Both controls that open the add-wallet modal - the header button and the
 * empty-state call to action - show their own text, so TalkBack read the text
 * but not that it can be pressed. Each now has the button role; the name stays
 * the visible text.
 *
 * Harness as in WalletsScreen.windowSize.test.tsx, with no wallet, so the empty
 * state is shown beside the header button.
 */

import { render } from '@testing-library/react-native';
import React from 'react';

import i18n from '../../localization/i18n';
import { WalletsScreen } from '../WalletsScreen';

jest.mock('react-native-safe-area-context', () => ({
    useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.mock('../../hooks/useWallets', () => ({
    useWallets: () => ({ wallets: [], getTotalBalance: () => 0, refreshWallets: jest.fn() }),
}));

jest.mock('../../hooks/useTransactions', () => ({
    useTransactions: () => ({ transactions: [] }),
}));

jest.mock('../../hooks/useFormatting', () => ({
    useFormatting: () => ({ formatAmount: (value: number) => String(value) }),
}));

jest.mock('../../components/modals/AddWalletModal', () => ({ AddWalletModal: () => null }));
jest.mock('../../components/modals/EditWalletModal', () => ({ EditWalletModal: () => null }));
jest.mock('../../components/transactions/TransactionList', () => ({ TransactionList: () => null }));

beforeAll(async () => {
    await i18n.changeLanguage('en');
});

describe('pass 84b item 4. Wallets add controls', () => {
    it.each(['wallets.add', 'wallets.createFirst'])('pass 84b item 4. the control showing %s is a button', (key) => {
        const label = i18n.t(key);
        expect(label).not.toBe(key);

        const { getByText, getByRole } = render(<WalletsScreen />);
        // The forcing: the control is on screen with its text.
        expect(getByText(label)).toBeTruthy();

        expect(getByRole('button', { name: label })).toBeTruthy();
    });
});
