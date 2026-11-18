/**
 * TransactionsScreen - one tap on a pill or a row with the keyboard up (pass 95)
 *
 * The search field sits above the quick-type pills (a horizontal ScrollView)
 * and the transaction list (a ScrollView holding TransactionList's FlatList).
 * All three left keyboardShouldPersistTaps unset ("never"), so after typing a
 * search the first tap on a pill or a row only closed the keyboard.
 *
 * Jest has no soft keyboard, so this pins the prop on every scroll view above
 * a pill and above a row (see test-utils/scrollAncestors).
 *
 * Harness as in TransactionsScreen.addControl.test.tsx, with one transaction.
 */

import { render } from '@testing-library/react-native';
import React from 'react';

import i18n from '../../localization/i18n';
import { makeTransaction } from '../../test-utils/testFactories';
import { scrollAncestorTapModes } from '../../test-utils/scrollAncestors';
import { TransactionsScreen } from '../TransactionsScreen';

// The factories read the `mock`-prefixed fixtures only when the hooks are
// called, at render, never while the mocked module is first required.
jest.mock('react-native-safe-area-context', () => ({
    useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.mock('expo-router', () => ({
    useRouter: () => ({ push: jest.fn() }),
}));

jest.mock('../../hooks/useTransactions', () => ({
    useTransactions: () => ({
        transactions: mockTransactions,
        filteredTransactions: mockTransactions,
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
        wallets: [{ id: 'wallet-1', name: 'Cash Wallet', balance: 0, type: 'cash' }],
        refreshWallets: jest.fn(),
        transferBetweenWallets: jest.fn(),
    }),
}));

jest.mock('../../hooks/useCategories', () => ({
    useCategories: () => ({
        categories: [{ id: 'cat-food', name: 'Groceries', type: 'expense', icon: 'restaurant', color: '#F59E0B' }],
        expenseCategories: [],
        incomeCategories: [],
    }),
}));

jest.mock('../../hooks/useFormatting', () => ({
    useFormatting: () => ({
        formatAmount: (v: number) => String(v),
        formatAmountCompactLarge: (v: number) => String(v),
        formatAmountWhole: (v: number) => String(v),
        formatAmountWholeCompactLarge: (v: number) => String(v),
        parseAmountToCentsResult: (v: string) =>
            (v ? { ok: true, value: Number(v) } : { ok: false, cause: 'empty' }),
        amountPlaceholder: '0.00',
        decimals: 2,
    }),
}));

const mockTransactions = [makeTransaction({ id: 'tx-1', categoryId: 'cat-food', walletId: 'wallet-1' })];

beforeAll(async () => {
    await i18n.changeLanguage('en');
});

describe('pass 95. TransactionsScreen under the search field with the keyboard up', () => {
    it('pass 95. the scroll view above a quick-type pill keeps the tap for the pill', () => {
        const { getByText } = render(<TransactionsScreen />);

        // "All" is a pill label only; "Income" is also a summary card title.
        expect(scrollAncestorTapModes(getByText(i18n.t('transactions.filterAll')))).toEqual(['handled']);
    });

    it('pass 95. every scroll view above a transaction row keeps the tap for the row', () => {
        const { getByTestId } = render(<TransactionsScreen />);

        // Nearest first: TransactionList's FlatList, then the screen ScrollView.
        expect(scrollAncestorTapModes(getByTestId('transaction_list_row_tx-1'))).toEqual([
            'handled',
            'handled',
        ]);
    });
});
