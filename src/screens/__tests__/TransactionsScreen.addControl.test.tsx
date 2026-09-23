/**
 * Controls that open the add-transaction flow from the Transactions tab.
 *
 * The tab carried three of them: a labelled button in the screen header, the
 * empty-state call to action inside the list, and the tab bar's floating button
 * rendered over every tab. The header button is the one removed, so this file
 * asserts it is gone AND that the other two still reach the same sheet - a
 * removal must not quietly take a survivor with it.
 *
 * Rendered against the REAL fr resources: a t() stub returning the key would
 * pass on a button labelled "transactions.add". Every control is addressed by
 * testID rather than by its French label, so no line here needs a non-ASCII
 * character.
 */

import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { fireEvent, render } from '@testing-library/react-native';
import React from 'react';

import { CustomTabBar } from '../../components/navigation/CustomTabBar';
import i18n from '../../localization/i18n';
import { TransactionsScreen } from '../TransactionsScreen';

// jest.mock is hoisted above the imports above, so every factory here is
// self-contained: one closing over a module-level const would read it in its
// temporal dead zone when the mocked module is first required.
jest.mock('react-native-safe-area-context', () => ({
    useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.mock('expo-router', () => ({
    useRouter: () => ({ push: jest.fn() }),
}));

jest.mock('../../hooks/useTransactions', () => ({
    useTransactions: () => ({
        transactions: [],
        filteredTransactions: [],
        filters: {},
        setFilters: jest.fn(),
        resetFilters: jest.fn(),
        loadNextPage: jest.fn(),
        loadingMore: false,
        refreshTransactions: jest.fn().mockResolvedValue(undefined),
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
        parseAmountToCentsResult: (v: string) =>
            (v ? { ok: true, value: Number(v) } : { ok: false, cause: 'empty' }),
        amountPlaceholder: '0.00',
        decimals: 2,
    }),
}));

/** The add sheet's own title in fr. Plain ASCII, so it can be asserted directly. */
const ADD_SHEET_TITLE = 'Ajouter une transaction';

/**
 * The tab bar maps over a navigation state. An empty route list renders no tabs
 * and leaves the floating button, which is the only part of it under test here.
 */
const tabBarProps = {
    state: { index: 0, routes: [] },
    descriptors: {},
    navigation: { emit: jest.fn(), navigate: jest.fn() },
} as unknown as BottomTabBarProps;

beforeAll(async () => {
    await i18n.changeLanguage('fr');
});

describe('TransactionsScreen header', () => {
    it('renders no add control of its own', () => {
        const { queryByTestId } = render(<TransactionsScreen />);

        expect(queryByTestId('transactions_add_button')).toBeNull();
    });

    it('keeps the filter control, which still opens the filter sheet', () => {
        const { getByTestId } = render(<TransactionsScreen />);

        fireEvent.press(getByTestId('filter_icon_button'));

        expect(getByTestId('filter_apply_button')).toBeTruthy();
    });
});

describe('the add controls that remain', () => {
    it('opens the add sheet from the empty-state call to action', () => {
        const { getByTestId, getByText, queryByText } = render(<TransactionsScreen />);

        expect(queryByText(ADD_SHEET_TITLE)).toBeNull();

        fireEvent.press(getByTestId('transaction_list_add_first'));

        expect(getByText(ADD_SHEET_TITLE)).toBeTruthy();
        // And the sheet opens on the expense leg, which is what the user came for.
        expect(getByTestId('add_tx_type_expense')).toBeTruthy();
    });

    it('opens the add sheet from the tab bar floating button', () => {
        const { getByTestId, getByText, queryByText } = render(<CustomTabBar {...tabBarProps} />);

        expect(queryByText(ADD_SHEET_TITLE)).toBeNull();

        fireEvent.press(getByTestId('fab_add_transaction'));

        expect(getByText(ADD_SHEET_TITLE)).toBeTruthy();
    });
});
