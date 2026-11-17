/**
 * AddTransactionModal - the date field has a stable testID (pass 94, item 2)
 *
 * Every other field of the sheet already carried an add_tx_* id; the date
 * trigger (AddTransactionModal.tsx:436) did not. It now carries
 * add_tx_date_button. The test presses the id and checks the date picker opens,
 * so an id on another control fails too.
 *
 * Harness as in AddTransactionModal.placeholder.test.tsx; the native picker is
 * replaced by a marker view as in AddTransactionModal.transferDateNote.test.tsx.
 */

import { fireEvent, render, waitFor } from '@testing-library/react-native';
import React from 'react';

import { getDefaultSettings } from '../../../data/services/settingsService';
import i18n from '../../../localization/i18n';
import { makeCategory, makeWallet } from '../../../test-utils/testFactories';
import { AddTransactionModal } from '../AddTransactionModal';

jest.mock('../../../hooks/useWallets', () => ({
    useWallets: jest.fn(),
}));

jest.mock('../../../hooks/useCategories', () => ({
    useCategories: jest.fn(),
}));

jest.mock('../../../hooks/useTransactions', () => ({
    useTransactions: () => ({ createTransaction: jest.fn() }),
}));

jest.mock('../../../data/services/settingsService', () => {
    const actual = jest.requireActual('../../../data/services/settingsService');
    return { ...actual, loadSettings: jest.fn() };
});

jest.mock('@react-native-community/datetimepicker', () => {
    const ReactActual = jest.requireActual('react');
    const { View } = jest.requireActual('react-native');
    return {
        __esModule: true,
        default: () => ReactActual.createElement(View, { testID: 'mock_date_picker' }),
    };
});

const mockedUseWallets = jest.requireMock('../../../hooks/useWallets').useWallets as jest.Mock;
const mockedUseCategories = jest.requireMock('../../../hooks/useCategories').useCategories as jest.Mock;
const mockedLoadSettings = jest.requireMock('../../../data/services/settingsService')
    .loadSettings as jest.Mock;

const WALLET = makeWallet({ id: 'w-1', name: 'Main' });
const RENT = makeCategory({ id: 'cat-rent', name: 'Rent' });

beforeAll(async () => {
    await i18n.changeLanguage('en');
});

beforeEach(() => {
    jest.clearAllMocks();
    mockedLoadSettings.mockResolvedValue(getDefaultSettings());
    mockedUseWallets.mockReturnValue({ wallets: [WALLET], refreshWallets: jest.fn() });
    mockedUseCategories.mockReturnValue({
        categories: [RENT],
        expenseCategories: [RENT],
        incomeCategories: [],
        refreshCategories: jest.fn(),
    });
});

describe('pass 94 item 2. AddTransactionModal testIDs', () => {
    it('pass 94 item 2. add_tx_date_button opens the date picker', async () => {
        const { getByTestId, queryByTestId } = render(
            <AddTransactionModal visible onClose={jest.fn()} />,
        );
        await waitFor(() => expect(mockedLoadSettings).toHaveBeenCalled());

        // The forcing, independent of the id: no picker before the press.
        expect(queryByTestId('mock_date_picker')).toBeNull();

        fireEvent.press(getByTestId('add_tx_date_button'));

        expect(getByTestId('mock_date_picker')).toBeTruthy();
    });
});
