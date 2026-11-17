/**
 * TransactionList - each row has a stable testID (pass 94, item 2)
 *
 * The row touchables had no testID, so a flow could not address the row of
 * the transaction it had just created. Both renderers now give the row
 * transaction_list_row_<transaction id>. The prefix is not transaction_row_:
 * Maestro id selectors are regular expressions, and transaction_row_.* would
 * also match the title, subtitle and amount ids inside every row.
 *
 * Each test checks the id sits on the row holding that transaction, and that
 * pressing it opens that transaction.
 *
 * Harness as in TransactionList.compactAmounts.test.tsx.
 */

import { fireEvent, render, waitFor, within } from '@testing-library/react-native';
import React from 'react';

import { getDefaultSettings } from '../../../data/services/settingsService';
import i18n from '../../../localization/i18n';
import { makeTransaction } from '../../../test-utils/testFactories';
import { TransactionList } from '../TransactionList';

const mockPush = jest.fn();

jest.mock('expo-router', () => ({
    useRouter: () => ({ push: mockPush }),
}));

jest.mock('../../../hooks/useCategories', () => ({
    useCategories: () => ({
        categories: [{ id: 'cat-food', name: 'Groceries', type: 'expense', icon: 'restaurant', color: '#F59E0B' }],
    }),
}));

jest.mock('../../../hooks/useWallets', () => ({
    useWallets: () => ({ wallets: [{ id: 'wallet-1', name: 'Cash Wallet', balance: 0, type: 'cash' }] }),
}));

jest.mock('../../../data/services/settingsService', () => {
    const actual = jest.requireActual('../../../data/services/settingsService');
    return { ...actual, loadSettings: jest.fn() };
});

const mockedLoadSettings = jest.requireMock('../../../data/services/settingsService')
    .loadSettings as jest.Mock;

const FIRST = makeTransaction({ id: 'tx-first', categoryId: 'cat-food', walletId: 'wallet-1' });
const SECOND = makeTransaction({ id: 'tx-second', categoryId: 'cat-food', walletId: 'wallet-1' });

beforeAll(async () => {
    await i18n.changeLanguage('en');
});

beforeEach(() => {
    jest.clearAllMocks();
    mockedLoadSettings.mockResolvedValue(getDefaultSettings());
});

describe.each([
    ['compact rows (no date headers)', false],
    ['comfortable rows (date headers)', true],
])('pass 94 item 2. TransactionList %s', (_name, showDateHeaders) => {
    it.each([FIRST, SECOND])('pass 94 item 2. transaction_list_row_$id is the row of that transaction', async (tx) => {
        const { getByTestId, getAllByTestId } = render(
            <TransactionList transactions={[FIRST, SECOND]} showDateHeaders={showDateHeaders} />,
        );
        await waitFor(() => expect(mockedLoadSettings).toHaveBeenCalled());

        // The forcing, independent of the ids: both rows are rendered.
        expect(getAllByTestId('transaction_row_title')).toHaveLength(2);

        const row = getByTestId(`transaction_list_row_${tx.id}`);
        expect(within(row).getByTestId('transaction_row_title')).toBeTruthy();

        fireEvent.press(row);
        expect(mockPush).toHaveBeenCalledWith(`/transaction/${tx.id}`);
    });
});
