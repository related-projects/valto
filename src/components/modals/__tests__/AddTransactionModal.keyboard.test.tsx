import { fireEvent, render } from '@testing-library/react-native';
import React from 'react';
import { Keyboard } from 'react-native';

import { makeCategory, makeWallet } from '../../../test-utils/testFactories';
import { AddTransactionModal } from '../AddTransactionModal';

/**
 * AddTransactionModal - one tap on the category picker while typing the amount
 *
 * Registry F-25. After typing the amount, the first tap on "Category" did not
 * give the user an open list. The sheet's ScrollView already uses
 * keyboardShouldPersistTaps="handled" (AddTransactionModal.tsx), so React
 * Native lets the tap through to the picker trigger and leaves the keyboard up
 * over the list that opens below it. D1: one tap closes the keyboard AND opens
 * the list.
 *
 * Jest has no soft keyboard and no native responder system, so this test can
 * only pin the code: a single press opens the list and asks the keyboard to go
 * away. The proof that the list is visible after one tap is on a device.
 */

// --- Mocks -------------------------------------------------------------

jest.mock('react-i18next', () => ({
    useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en' } }),
}));

jest.mock('../../../hooks/useWallets', () => ({
    useWallets: jest.fn(),
}));

jest.mock('../../../hooks/useCategories', () => ({
    useCategories: jest.fn(),
}));

jest.mock('../../../hooks/useTransactions', () => ({
    useTransactions: () => ({ createTransaction: jest.fn() }),
}));

jest.mock('../../../hooks/useFormatting', () => ({
    useFormatting: () => ({
        formatAmount: (cents: number) => String(cents),
        parseAmountToCents: () => null,
        decimals: 2,
    }),
}));

const mockedUseWallets = jest.requireMock('../../../hooks/useWallets').useWallets as jest.Mock;
const mockedUseCategories = jest.requireMock('../../../hooks/useCategories').useCategories as jest.Mock;

// --- Fixtures ----------------------------------------------------------

const WALLET = makeWallet({ id: 'w-1', name: 'Main' });
const FOOD = makeCategory({ id: 'cat-food', name: 'Food', icon: 'fast-food-outline' });

beforeEach(() => {
    jest.restoreAllMocks();
    mockedUseWallets.mockReturnValue({
        wallets: [WALLET],
        refreshWallets: jest.fn(),
        transferBetweenWallets: jest.fn(),
    });
    mockedUseCategories.mockReturnValue({
        categories: [FOOD],
        expenseCategories: [FOOD],
        incomeCategories: [],
    });
});

// --- Tests -------------------------------------------------------------

describe('AddTransactionModal - keyboard and the category picker (F-25)', () => {
    it('opens the category list and dismisses the keyboard on a single press while the amount is focused', () => {
        const dismissSpy = jest.spyOn(Keyboard, 'dismiss');
        const { getByTestId, queryByTestId } = render(
            <AddTransactionModal visible onClose={jest.fn()} onSuccess={jest.fn()} />,
        );

        const amountInput = getByTestId('add_tx_amount_input');
        fireEvent(amountInput, 'focus');
        fireEvent.changeText(amountInput, '12');

        expect(queryByTestId('add_tx_category_cat-food')).toBeNull();

        fireEvent.press(getByTestId('add_tx_category_picker'));

        expect(getByTestId('add_tx_category_cat-food')).toBeTruthy();
        expect(dismissSpy).toHaveBeenCalledTimes(1);
    });
});
