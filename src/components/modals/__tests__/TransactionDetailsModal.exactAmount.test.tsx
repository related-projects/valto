/**
 * TransactionDetailsModal - the detail screen keeps the exact amount (V-128, pass 89)
 *
 * Owner decision 2, option A: compact display only in tight places; the detail
 * screen is where the full amount is read, so it stays exact at any size. The
 * list rows share TransactionPresenter with it and turn compact
 * (TransactionList.compactAmounts.test.tsx); this pins that the split did not
 * reach the detail screen.
 *
 * Control: this passes on the code before pass 89 as well. It is not a
 * regression test; it guards the exact site the change must leave alone.
 *
 * Real useFormatting with settingsService.loadSettings mocked one level below it.
 * EUR: 2 decimals, symbol U+20AC; comma profile: group ".", decimal ",", symbol
 * after U+00A0.
 */

import { render, screen, waitFor } from '@testing-library/react-native';
import React from 'react';

import { getDefaultSettings } from '../../../data/services/settingsService';
import i18n from '../../../localization/i18n';
import { TransactionDetailsModal } from '../TransactionDetailsModal';

jest.mock('expo-router', () => ({
    useLocalSearchParams: () => ({ id: 'tx-large' }),
    useRouter: () => ({ push: jest.fn() }),
    router: { back: jest.fn() },
    Stack: { Screen: () => null },
}));

jest.mock('../../../hooks/useTransactions', () => {
    const { makeTransaction } = jest.requireActual('../../../test-utils/testFactories');
    const { TransactionType: Type } = jest.requireActual('../../../domain/entities');
    const transactions = [makeTransaction({ id: 'tx-large', amount: 199_999_999, type: Type.EXPENSE })];
    return {
        useTransactions: () => ({ transactions, loading: false, deleteTransaction: jest.fn() }),
    };
});

jest.mock('../../../hooks/useCategories', () => ({
    useCategories: () => ({
        categories: [{ id: 'cat-food', name: 'Groceries', type: 'expense', icon: 'restaurant', color: '#F59E0B' }],
        loading: false,
        error: null,
    }),
}));

jest.mock('../../../hooks/useWallets', () => ({
    useWallets: () => ({ wallets: [{ id: 'wallet-1', name: 'Cash Wallet', balance: 0, type: 'cash' }], loading: false, error: null }),
}));

jest.mock('../../../data/services/settingsService', () => {
    const actual = jest.requireActual('../../../data/services/settingsService');
    return { ...actual, loadSettings: jest.fn() };
});

const mockedLoadSettings = jest.requireMock('../../../data/services/settingsService')
    .loadSettings as jest.Mock;

const NBSP = '\u00A0';
/** U+20AC, the EUR symbol in currencies.ts. */
const EURO = '\u20AC';

beforeAll(async () => {
    await i18n.changeLanguage('en');
});

beforeEach(() => {
    jest.clearAllMocks();
    mockedLoadSettings.mockResolvedValue({
        ...getDefaultSettings(),
        currency: 'EUR',
        language: 'en',
        decimalSeparator: 'comma',
    });
});

describe('TransactionDetailsModal - exact amount', () => {
    it('control: an expense of 1 999 999,99 is shown exact, not compact', async () => {
        render(<TransactionDetailsModal />);

        const amount = () => screen.getByTestId('transaction_row_amount');
        // A trailing U+20AC proves the EUR settings are in (the fallback puts "$" in front).
        await waitFor(() => expect(amount().props.children.endsWith(EURO)).toBe(true));

        expect(amount().props.children).toBe(`-1.999.999,99${NBSP}${EURO}`);
        // Unchanged: the detail amount carries no label of its own, as before.
        expect(amount().props.accessibilityLabel).toBeUndefined();
    });
});
