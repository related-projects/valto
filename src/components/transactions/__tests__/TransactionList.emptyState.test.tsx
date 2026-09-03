/**
 * TransactionList empty-state tests
 *
 * Rendered against the REAL fr resources rather than a t() stub that echoes the
 * key. The whole point of these assertions is the sentence a user reads: a
 * key-identity stub would pass just as happily on copy that tells the user to
 * hunt for a "+" button, which is the thing being fixed here.
 *
 * The empty state is actionable only when a host supplies a handler. Several
 * hosts render this list without owning an add-transaction modal, so the
 * text-only fallback is asserted too - a button that does nothing would be worse
 * than no button.
 */

jest.mock('expo-router', () => ({
    useRouter: () => ({ push: jest.fn() }),
}));

jest.mock('../../../hooks/useCategories', () => ({
    useCategories: () => ({ categories: [] }),
}));

jest.mock('../../../hooks/useWallets', () => ({
    useWallets: () => ({ wallets: [] }),
}));

jest.mock('../../../hooks/useFormatting', () => ({
    useFormatting: () => ({ formatAmount: (v: number) => String(v) }),
}));

import { fireEvent, render } from '@testing-library/react-native';
import React from 'react';

import i18n from '../../../localization/i18n';
import { TransactionList } from '../TransactionList';

beforeAll(async () => {
    await i18n.changeLanguage('fr');
});

describe('TransactionList empty state', () => {
    it('renders an actionable button when a handler is supplied', () => {
        const onAdd = jest.fn();
        const { getByText } = render(
            <TransactionList transactions={[]} onAddTransaction={onAdd} />,
        );

        fireEvent.press(getByText('Ajouter une dépense'));

        expect(onAdd).toHaveBeenCalledTimes(1);
    });

    it('falls back to text only when no handler is supplied', () => {
        const { getByText, queryByText } = render(
            <TransactionList transactions={[]} />,
        );

        expect(getByText('Aucune transaction')).toBeTruthy();
        expect(queryByText('Ajouter une dépense')).toBeNull();
    });

    it('no longer tells the user to find a + button', () => {
        const { getByText, queryByText } = render(
            <TransactionList transactions={[]} onAddTransaction={jest.fn()} />,
        );

        expect(getByText('Les dépenses et revenus enregistrés apparaîtront ici')).toBeTruthy();
        expect(queryByText(/Appuyez sur \+/)).toBeNull();
    });
});
