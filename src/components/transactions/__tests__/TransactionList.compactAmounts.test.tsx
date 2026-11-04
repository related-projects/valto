/**
 * TransactionList rows - large amounts are compact, labelled exact (V-128, pass 89)
 *
 * Both list renderers (compact flat rows, comfortable sectioned rows) hand
 * TransactionPresenter the compact formatter; the detail screen keeps the exact
 * one (see TransactionDetailsModal.exactAmount.test.tsx). Each row amount carries
 * the exact amount, sign included, as its accessibilityLabel.
 *
 * Real useFormatting with settingsService.loadSettings mocked one level below it.
 * EUR: 2 decimals, symbol U+20AC; comma profile: group ".", decimal ",", symbol
 * after U+00A0. Language en, so the suffixes are M / B with no gap.
 */

import { render, screen, waitFor } from '@testing-library/react-native';
import React from 'react';

import { getDefaultSettings } from '../../../data/services/settingsService';
import { Transaction, TransactionType } from '../../../domain/entities';
import i18n from '../../../localization/i18n';
import { makeTransaction } from '../../../test-utils/testFactories';
import { TransactionList } from '../TransactionList';

jest.mock('expo-router', () => ({
    useRouter: () => ({ push: jest.fn() }),
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

const NBSP = '\u00A0';
/** U+20AC, the EUR symbol in currencies.ts. */
const EURO = '\u20AC';

const LARGE_EXPENSE = makeTransaction({ amount: 199_999_999, type: TransactionType.EXPENSE });
const LARGE_INCOME = makeTransaction({ amount: 250_000_000_000, type: TransactionType.INCOME });
const SMALL_EXPENSE = makeTransaction({ amount: 99_999_999, type: TransactionType.EXPENSE });

const amount = () => screen.getByTestId('transaction_row_amount');

/**
 * Renders one row and waits for the EUR settings: before they load the hook
 * falls back to "$" in front, so a trailing U+20AC proves they are in. True
 * before and after the fix.
 */
async function renderRow(transaction: Transaction, showDateHeaders: boolean) {
    render(<TransactionList transactions={[transaction]} showDateHeaders={showDateHeaders} />);
    await waitFor(() => expect(amount().props.children.endsWith(EURO)).toBe(true));
    return amount();
}

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

describe.each([
    ['compact rows (no date headers)', false],
    ['comfortable rows (date headers)', true],
])('TransactionList %s', (_name, showDateHeaders) => {
    it('shows a large expense compact with the exact signed amount as label', async () => {
        const row = await renderRow(LARGE_EXPENSE, showDateHeaders);

        expect(row.props.children).toBe(`-1,9M${NBSP}${EURO}`);
        expect(row.props.accessibilityLabel).toBe(`-1.999.999,99${NBSP}${EURO}`);
    });

    it('shows a large income compact with the exact signed amount as label', async () => {
        const row = await renderRow(LARGE_INCOME, showDateHeaders);

        expect(row.props.children).toBe(`+2,5B${NBSP}${EURO}`);
        expect(row.props.accessibilityLabel).toBe(`+2.500.000.000,00${NBSP}${EURO}`);
    });

    it('shows an amount below 1 000 000 exact, labelled exact', async () => {
        const row = await renderRow(SMALL_EXPENSE, showDateHeaders);

        expect(row.props.children).toBe(`-999.999,99${NBSP}${EURO}`);
        expect(row.props.accessibilityLabel).toBe(`-999.999,99${NBSP}${EURO}`);
    });
});
