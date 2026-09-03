/**
 * TransactionPresenter - what a row actually says
 *
 * The row used to title itself `note || wallet`, so two neighbouring rows showed
 * different KINDS of information in the same position: one the free-text note,
 * the next a wallet name. These tests lock the rule that replaced it - the title
 * is the category, the subtitle is the wallet, always - and they assert it
 * through TransactionList, i.e. the tree the user actually sees, for both
 * renderers.
 *
 * The presenter is exercised, not stubbed: only the data sources are mocked.
 */

import { render } from '@testing-library/react-native';
import React from 'react';

import { Transaction, TransactionType } from '../../../domain/entities';
import { TransactionList } from '../TransactionList';

// ─── Mocks ────────────────────────────────────────────────────────────

const CATEGORIES = [
    { id: 'cat-food', name: 'Groceries', type: 'expense', icon: 'restaurant', color: '#F59E0B' },
];

const WALLETS = [{ id: 'wallet-cash', name: 'Cash Wallet', balance: 100000, type: 'cash' }];

jest.mock('../../../hooks/useCategories', () => ({
    useCategories: () => ({ categories: CATEGORIES, loading: false, error: null }),
}));

jest.mock('../../../hooks/useWallets', () => ({
    useWallets: () => ({ wallets: WALLETS, loading: false, error: null }),
}));

jest.mock('../../../hooks/useFormatting', () => ({
    useFormatting: () => ({
        formatAmount: (cents: number) => `$${(cents / 100).toFixed(2)}`,
    }),
}));

jest.mock('react-i18next', () => ({
    useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en' } }),
}));

jest.mock('expo-router', () => ({
    useRouter: () => ({ push: jest.fn() }),
}));

// ─── Fixtures ─────────────────────────────────────────────────────────

function tx(overrides: Partial<Transaction> = {}): Transaction {
    return {
        id: 'tx-1',
        type: TransactionType.EXPENSE,
        amount: 6000,
        categoryId: 'cat-food',
        walletId: 'wallet-cash',
        date: new Date('2026-03-01T10:00:00'),
        createdAt: new Date('2026-03-01T10:00:00'),
        ...overrides,
    };
}

const WITH_NOTE = tx({ id: 'tx-with-note', note: 'Weekly shop at the market' });
const WITHOUT_NOTE = tx({ id: 'tx-without-note' });

/** Both renderers, driven by the one prop that switches between them. */
const RENDERERS: [string, boolean][] = [
    ['flat', false],
    ['sectioned', true],
];

// ─── Tests ────────────────────────────────────────────────────────────

describe('transaction row content', () => {
    describe.each(RENDERERS)('%s renderer', (_label, showDateHeaders) => {
        it('titles the row with the category and subtitles it with the wallet when a note exists', () => {
            const { getByTestId, queryByText } = render(
                <TransactionList transactions={[WITH_NOTE]} showDateHeaders={showDateHeaders} />,
            );

            expect(getByTestId('transaction_row_title')).toHaveTextContent('Groceries');
            expect(getByTestId('transaction_row_subtitle')).toHaveTextContent('Cash Wallet');
            // The note has left the row entirely - it is announced by the indicator
            // and read in full on the detail screen. This is the assertion that the
            // old `note || wallet` title fails.
            expect(queryByText('Weekly shop at the market')).toBeNull();
        });

        it('titles the row the same way when no note exists', () => {
            const { getByTestId } = render(
                <TransactionList transactions={[WITHOUT_NOTE]} showDateHeaders={showDateHeaders} />,
            );

            expect(getByTestId('transaction_row_title')).toHaveTextContent('Groceries');
            expect(getByTestId('transaction_row_subtitle')).toHaveTextContent('Cash Wallet');
        });

        it('shows neighbouring rows the same kind of information whether or not they carry a note', () => {
            const { getAllByTestId } = render(
                <TransactionList
                    transactions={[WITH_NOTE, WITHOUT_NOTE]}
                    showDateHeaders={showDateHeaders}
                />,
            );

            const titles = getAllByTestId('transaction_row_title').map((node) => node.props.children);
            const subtitles = getAllByTestId('transaction_row_subtitle').map((n) => n.props.children);

            expect(titles).toEqual(['Groceries', 'Groceries']);
            expect(subtitles).toEqual(['Cash Wallet', 'Cash Wallet']);
        });

        it('marks the row that carries a note, and only that row', () => {
            const { queryByTestId, rerender } = render(
                <TransactionList transactions={[WITH_NOTE]} showDateHeaders={showDateHeaders} />,
            );
            expect(queryByTestId('transaction_note_indicator')).not.toBeNull();

            rerender(
                <TransactionList transactions={[WITHOUT_NOTE]} showDateHeaders={showDateHeaders} />,
            );
            expect(queryByTestId('transaction_note_indicator')).toBeNull();
        });

        it('treats a whitespace-only note as no note at all', () => {
            const { queryByTestId } = render(
                <TransactionList
                    transactions={[tx({ id: 'tx-blank-note', note: '   ' })]}
                    showDateHeaders={showDateHeaders}
                />,
            );

            expect(queryByTestId('transaction_note_indicator')).toBeNull();
        });

        it('signs the amount by direction: income credits, expense debits', () => {
            const { getByTestId, rerender } = render(
                <TransactionList
                    transactions={[tx({ id: 'tx-expense' })]}
                    showDateHeaders={showDateHeaders}
                />,
            );
            expect(getByTestId('transaction_row_amount')).toHaveTextContent('-$60.00');

            rerender(
                <TransactionList
                    transactions={[tx({ id: 'tx-income', type: TransactionType.INCOME })]}
                    showDateHeaders={showDateHeaders}
                />,
            );
            expect(getByTestId('transaction_row_amount')).toHaveTextContent('+$60.00');
        });

        it('names a transfer leg by its direction-free label, still over the wallet', () => {
            const { getByTestId } = render(
                <TransactionList
                    transactions={[
                        tx({
                            id: 'tx-transfer',
                            type: TransactionType.TRANSFER,
                            categoryId: 'transfer-out',
                        }),
                    ]}
                    showDateHeaders={showDateHeaders}
                />,
            );

            expect(getByTestId('transaction_row_title')).toHaveTextContent(
                'components.transactionList.transfer',
            );
            expect(getByTestId('transaction_row_subtitle')).toHaveTextContent('Cash Wallet');
        });
    });
});
