import { fireEvent, render, waitFor } from '@testing-library/react-native';
import React from 'react';
import { Alert } from 'react-native';

import { getDefaultSettings } from '../../../data/services/settingsService';
import i18n from '../../../localization/i18n';
import { makeCategory, makeWallet } from '../../../test-utils/testFactories';
import { AddTransactionModal } from '../AddTransactionModal';

/**
 * AddTransactionModal - a refused amount says WHY it was refused
 *
 * Decimals audit, defect 1. Five different mistakes produced one `null`, so the
 * sheet could only ever show one sentence. The sentence it showed named the
 * sign: a French XOF user who typed "12000,50" - a well-formed amount refused
 * only because the currency has no minor unit - was told to enter an amount
 * greater than zero.
 *
 * D6: the parser names the cause and the sheet picks the matching message. The
 * test runs on XOF so the over-precision cause is reachable at all, and asserts
 * the five messages are five DIFFERENT strings - the property the defect broke.
 * Expected sentences are read from the bundle, never restated.
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

/** XOF: 0 decimals, and the `space` profile a francophone device derives. */
const TEST_LANGUAGE = 'fr';

/** One input per cause. The fifth is the reported case. */
const INPUT_BY_CAUSE: Record<string, string> = {
    empty: '',
    notANumber: 'abc',
    negative: '-5',
    zero: '0',
    tooManyDecimals: '12000,50',
};

beforeAll(async () => {
    await i18n.changeLanguage(TEST_LANGUAGE);
});

afterAll(async () => {
    await i18n.changeLanguage('en');
});

beforeEach(() => {
    jest.clearAllMocks();
    mockedLoadSettings.mockResolvedValue({
        ...getDefaultSettings(),
        currency: 'XOF',
        decimalSeparator: 'space',
        language: TEST_LANGUAGE,
    });
    mockedUseWallets.mockReturnValue({ wallets: [WALLET], refreshWallets: jest.fn() });
    mockedUseCategories.mockReturnValue({
        categories: [FOOD],
        expenseCategories: [FOOD],
        incomeCategories: [],
        refreshCategories: jest.fn(),
    });
});

/** Type `input`, press Save, and hand back the message the alert carried. */
const messageFor = async (input: string): Promise<string> => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => { });

    const { getByTestId, unmount } = render(
        <AddTransactionModal visible onClose={jest.fn()} />,
    );

    // The sheet starts on the default 2 decimals and re-renders once the XOF
    // settings resolve; typing before that would be parsed at the wrong exponent.
    await waitFor(() => {
        expect(getByTestId('add_tx_amount_input').props.keyboardType).toBe('number-pad');
    });

    if (input !== '') {
        fireEvent.changeText(getByTestId('add_tx_amount_input'), input);
    }
    fireEvent.press(getByTestId('add_tx_save_button'));

    await waitFor(() => {
        expect(alertSpy).toHaveBeenCalled();
    });

    const message = String(alertSpy.mock.calls[0][1]);
    alertSpy.mockRestore();
    unmount();
    return message;
};

describe('AddTransactionModal refusal messages', () => {
    it('gives each cause its own sentence', async () => {
        const messages: Record<string, string> = {};
        for (const [cause, input] of Object.entries(INPUT_BY_CAUSE)) {
            messages[cause] = await messageFor(input);
        }

        const distinct = new Set(Object.values(messages));
        expect(distinct.size).toBe(Object.keys(INPUT_BY_CAUSE).length);
    });

    it('keeps the existing sentence for an amount of zero', async () => {
        const fixed = i18n.getFixedT(TEST_LANGUAGE);
        expect(await messageFor(INPUT_BY_CAUSE.zero)).toBe(
            fixed('modals.addTransaction.invalidAmountMessage'),
        );
    });

    it('names over-precision, and shows the shape the currency accepts', async () => {
        const fixed = i18n.getFixedT(TEST_LANGUAGE);
        expect(await messageFor(INPUT_BY_CAUSE.tooManyDecimals)).toBe(
            fixed('common.amountErrors.tooManyDecimals', { example: '0' }),
        );
    });
});
