/**
 * TransactionsScreen - search finds a transfer by the note the user reads
 *
 * REGISTRE C38, Owner decisions 24/11, decision 1, option A. transferFunds
 * stores each leg's note with an English prefix, "Transfer to <wallet>" /
 * "Transfer from <wallet>", and the screens now show that prefix translated.
 * Search matched only the stored text, so a French user typing what the detail
 * screen shows ("Transfert vers") found nothing. It now matches the displayed
 * note too, and the stored text still matches (raw match kept).
 *
 * Rendered against the REAL fr resources. Rows are addressed by testID; the
 * search field by its placeholder, read from the bundle so no line here needs a
 * non-ASCII character. The incoming prefix is read from fr.json too (pass
 * 101b item 6 changed its value). Harness from
 * TransactionsScreen.addControl.test.tsx.
 */

import { fireEvent, render, screen } from '@testing-library/react-native';
import React from 'react';

import i18n from '../../localization/i18n';
import frBundle from '../../localization/locales/fr.json';
import { TransactionsScreen } from '../TransactionsScreen';

// jest.mock is hoisted above the imports above, so every factory here is
// self-contained.
jest.mock('react-native-safe-area-context', () => ({
    useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.mock('expo-router', () => ({
    useRouter: () => ({ push: jest.fn() }),
}));

jest.mock('../../hooks/useTransactions', () => {
    const { makeTransaction } = jest.requireActual('../../test-utils/testFactories');
    const { TransactionType: Type } = jest.requireActual('../../domain/entities');
    // The two legs transferFunds writes for a typed note "loyer", and an
    // expense whose own note happens to start with the same English words.
    const transactions = [
        makeTransaction({ id: 'leg-out', type: Type.TRANSFER, categoryId: 'transfer-out', note: 'Transfer to Banque - loyer' }),
        makeTransaction({ id: 'leg-in', type: Type.TRANSFER, categoryId: 'transfer-in', note: 'Transfer from Caisse - loyer' }),
        makeTransaction({ id: 'plain', type: Type.EXPENSE, note: 'Transfer to Mum' }),
    ];
    return {
    useTransactions: () => ({
        transactions,
        filteredTransactions: transactions,
        filters: {},
        setFilters: jest.fn(),
        resetFilters: jest.fn(),
        loadNextPage: jest.fn(),
        loadingMore: false,
        refreshTransactions: jest.fn().mockResolvedValue(undefined),
        createTransaction: jest.fn(),
    }),
    };
});

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
        formatAmountCompactLarge: (v: number) => String(v),
        formatAmountWhole: (v: number) => String(v),
        formatAmountWholeCompactLarge: (v: number) => String(v),
        parseAmountToCentsResult: (v: string) =>
            (v ? { ok: true, value: Number(v) } : { ok: false, cause: 'empty' }),
        amountPlaceholder: '0.00',
        decimals: 2,
    }),
}));

beforeEach(async () => {
    await i18n.changeLanguage('fr');
});

afterAll(async () => {
    await i18n.changeLanguage('en');
});

const search = (text: string) => {
    fireEvent.changeText(screen.getByPlaceholderText(i18n.t('transactions.searchPlaceholder')), text);
};

const rowsShown = () =>
    ['leg-out', 'leg-in', 'plain'].filter(id => screen.queryByTestId(`transaction_list_row_${id}`) !== null);

describe('C38 TransactionsScreen search on transfer notes', () => {
    it('precondition: all three rows are listed before any search', () => {
        render(<TransactionsScreen />);
        expect(rowsShown()).toEqual(['leg-out', 'leg-in', 'plain']);
    });

    it('fr: "transfert vers" finds the outgoing leg by its displayed note', () => {
        render(<TransactionsScreen />);
        search('transfert vers');
        expect(rowsShown()).toEqual(['leg-out']);
    });

    it('fr: the incoming prefix followed by "Caisse" finds the incoming leg by its displayed note', () => {
        render(<TransactionsScreen />);
        search(`${frBundle.transactions.transferNote.from} Caisse`);
        expect(rowsShown()).toEqual(['leg-in']);
    });

    it('control: the stored English text still matches, and the expense note is matched as typed', () => {
        render(<TransactionsScreen />);
        search('transfer to');
        expect(rowsShown()).toEqual(['leg-out', 'plain']);
    });

    it('control: the wallet name and the typed note match on every leg', () => {
        render(<TransactionsScreen />);
        search('loyer');
        expect(rowsShown()).toEqual(['leg-out', 'leg-in']);
    });
});
