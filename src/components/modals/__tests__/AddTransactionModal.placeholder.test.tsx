import { render, waitFor } from '@testing-library/react-native';
import React from 'react';

import { getDefaultSettings } from '../../../data/services/settingsService';
import i18n from '../../../localization/i18n';
import { makeCategory, makeWallet } from '../../../test-utils/testFactories';
import { amountPlaceholder } from '../../../utils/amountPlaceholder';
import { AddTransactionModal } from '../AddTransactionModal';

/**
 * AddTransactionModal - the amount placeholder follows the currency
 *
 * Registry F-06, finding 21. The field showed the literal "0.00" whatever the
 * user's currency was. On XOF the app then refused the very shape the field had
 * just advertised.
 *
 * Only the data sources are mocked here. The real useFormatting, the real
 * currency table and the real number-format profiles all run - they are what
 * decides the hint, and a mocked hook would assert nothing but a pass-through.
 */

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

const mockedUseWallets = jest.requireMock('../../../hooks/useWallets').useWallets as jest.Mock;
const mockedUseCategories = jest.requireMock('../../../hooks/useCategories').useCategories as jest.Mock;
const mockedLoadSettings = jest.requireMock('../../../data/services/settingsService')
    .loadSettings as jest.Mock;

const WALLET = makeWallet({ id: 'w-1', name: 'Main' });
const FOOD = makeCategory({ id: 'cat-food', name: 'Food' });

beforeAll(async () => {
    await i18n.changeLanguage('en');
});

beforeEach(() => {
    jest.clearAllMocks();
    mockedUseWallets.mockReturnValue({ wallets: [WALLET], refreshWallets: jest.fn() });
    mockedUseCategories.mockReturnValue({
        categories: [FOOD],
        expenseCategories: [FOOD],
        incomeCategories: [],
        refreshCategories: jest.fn(),
    });
});

/**
 * currency + profile -> the hint the field should carry. Derived from the same
 * helper the component uses, so a translation or table edit cannot leave this
 * test asserting a stale literal.
 */
const CASES: [string, 'dot' | 'comma' | 'space', number][] = [
    ['XOF', 'space', 0],
    ['USD', 'dot', 2],
    ['KWD', 'comma', 3],
];

describe('AddTransactionModal amount placeholder', () => {
    it.each(CASES)('follows %s', async (currency, decimalSeparator, decimals) => {
        mockedLoadSettings.mockResolvedValue({
            ...getDefaultSettings(),
            currency,
            decimalSeparator,
        });

        const { getByTestId } = render(
            <AddTransactionModal visible onClose={jest.fn()} />,
        );

        await waitFor(() => {
            expect(getByTestId('add_tx_amount_input').props.placeholder).toBe(
                amountPlaceholder(decimals, decimalSeparator),
            );
        });
    });
});
