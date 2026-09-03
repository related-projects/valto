/**
 * TransactionsScreen add-control test
 *
 * The screen a user opens to "faire la liste des depenses du mois" had a filter
 * control and no way to add anything: every path to a new transaction went
 * through an unlabelled FAB. This asserts the labelled control and that pressing
 * it actually opens the add-transaction sheet.
 *
 * Rendered against the REAL fr resources - a t() stub returning the key would
 * pass on a button labelled "transactions.add".
 */

jest.mock('react-native-safe-area-context', () => ({
    useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.mock('expo-router', () => ({
    useRouter: () => ({ push: jest.fn() }),
}));

const mockRefreshTransactions = jest.fn().mockResolvedValue(undefined);

jest.mock('../../hooks/useTransactions', () => ({
    useTransactions: () => ({
        transactions: [],
        filteredTransactions: [],
        filters: {},
        setFilters: jest.fn(),
        resetFilters: jest.fn(),
        loadNextPage: jest.fn(),
        loadingMore: false,
        refreshTransactions: mockRefreshTransactions,
        createTransaction: jest.fn(),
    }),
}));

jest.mock('../../hooks/useWallets', () => ({
    useWallets: () => ({
        wallets: [],
        refreshWallets: jest.fn(),
        transferBetweenWallets: jest.fn(),
    }),
}));

jest.mock('../../hooks/useCategories', () => ({
    useCategories: () => ({ categories: [], expenseCategories: [], incomeCategories: [] }),
}));

jest.mock('../../hooks/useFormatting', () => ({
    useFormatting: () => ({
        formatAmount: (v: number) => String(v),
        formatAmountWhole: (v: number) => String(v),
        parseAmountToCents: (v: string) => (v ? Number(v) : null),
        decimals: 2,
    }),
}));

import { fireEvent, render } from '@testing-library/react-native';
import React from 'react';

import i18n from '../../localization/i18n';
import { TransactionsScreen } from '../TransactionsScreen';

beforeAll(async () => {
    await i18n.changeLanguage('fr');
});

describe('TransactionsScreen', () => {
    it('renders a labelled add control in the header', () => {
        const { getByTestId } = render(<TransactionsScreen />);

        const addButton = getByTestId('transactions_add_button');
        expect(addButton.props.accessibilityLabel).toBe('Ajouter');
    });

    it('opens the add-transaction modal when the add control is pressed', () => {
        const { getByTestId, queryByText, getByText } = render(<TransactionsScreen />);

        // The modal title is not on screen before the press.
        expect(queryByText('Ajouter une transaction')).toBeNull();

        fireEvent.press(getByTestId('transactions_add_button'));

        expect(getByText('Ajouter une transaction')).toBeTruthy();
        // And the sheet opens on the expense leg, which is what the user came for.
        expect(getByTestId('add_tx_type_expense')).toBeTruthy();
    });
});
