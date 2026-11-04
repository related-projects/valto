import { fireEvent, render, waitFor } from '@testing-library/react-native';
import React from 'react';
import { Alert } from 'react-native';

import { CAP_CASES, CAP_MINOR, echoedTooLarge, type CapCase } from '../../../../tests/helpers/amountCapCases';
import { getDefaultSettings } from '../../../data/services/settingsService';
import { CategoryType, TransactionType } from '../../../domain/entities';
import { makeCategory, makeWallet } from '../../../test-utils/testFactories';
import { AddTransactionModal } from '../AddTransactionModal';

/**
 * AddTransactionModal - an amount above the cap is refused (REGISTRE V-128)
 *
 * Expense, income and transfer all read the one amount field through the
 * shared parser. Above 999 999 999 999 minor units the sheet now shows the
 * tooLarge sentence, naming the maximum in the user's currency, and hands
 * nothing to the write. The tests named "control" pass before the fix: the cap
 * itself reaches the write unchanged.
 *
 * Real here: useFormatting and the parser, under the currency the mocked
 * settings carry. The data hooks are mocked; the write is the hook call.
 */

jest.mock('react-i18next', () => ({
    ...jest.requireActual('react-i18next'),
    useTranslation: () => ({
        t: (key: string, params?: Record<string, unknown>) =>
            params === undefined ? key : `${key} ${JSON.stringify(params)}`,
        i18n: { language: 'en' },
    }),
}));

jest.mock('../../../hooks/useWallets', () => ({
    useWallets: jest.fn(),
}));

jest.mock('../../../hooks/useCategories', () => ({
    useCategories: jest.fn(),
}));

jest.mock('../../../hooks/useTransactions', () => ({
    useTransactions: jest.fn(),
}));

jest.mock('../../../data/services/settingsService', () => {
    const actual = jest.requireActual('../../../data/services/settingsService');
    return { ...actual, loadSettings: jest.fn() };
});

const mockedUseWallets = jest.requireMock('../../../hooks/useWallets').useWallets as jest.Mock;
const mockedUseCategories = jest.requireMock('../../../hooks/useCategories').useCategories as jest.Mock;
const mockedUseTransactions = jest.requireMock('../../../hooks/useTransactions').useTransactions as jest.Mock;
const mockedLoadSettings = jest.requireMock('../../../data/services/settingsService')
    .loadSettings as jest.Mock;

const SOURCE = makeWallet({ id: 'w-source', name: 'Source', balance: 2 * CAP_MINOR });
const DEST = makeWallet({ id: 'w-dest', name: 'Dest', balance: 0 });
const FOOD = makeCategory({ id: 'cat-food', name: 'Food', type: CategoryType.EXPENSE });
const SALARY = makeCategory({ id: 'cat-salary', name: 'Salary', type: CategoryType.INCOME });

type Mode = 'expense' | 'income' | 'transfer';

const createTransaction = jest.fn();
const transferBetweenWallets = jest.fn();

beforeEach(() => {
    jest.clearAllMocks();
    createTransaction.mockResolvedValue(undefined);
    transferBetweenWallets.mockResolvedValue(undefined);
    mockedUseWallets.mockReturnValue({
        wallets: [SOURCE, DEST],
        refreshWallets: jest.fn(),
        transferBetweenWallets,
    });
    mockedUseCategories.mockReturnValue({
        categories: [FOOD, SALARY],
        expenseCategories: [FOOD],
        incomeCategories: [SALARY],
        refreshCategories: jest.fn(),
    });
    mockedUseTransactions.mockReturnValue({ createTransaction });
});

afterEach(() => {
    jest.restoreAllMocks();
});

/**
 * Open the sheet in `mode` under the currency of `c`, type `input`, press
 * Save, and wait until the sheet either alerted or wrote.
 */
async function save(c: CapCase, mode: Mode, input: string) {
    mockedLoadSettings.mockResolvedValue({
        ...getDefaultSettings(),
        currency: c.code,
        decimalSeparator: c.profile,
    });
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    const screen = render(<AddTransactionModal visible onClose={jest.fn()} initialType={mode} />);

    // Typing before the currency's settings land would parse at the default exponent.
    await waitFor(() => {
        expect(screen.getByTestId('add_tx_amount_input').props.keyboardType).toBe(c.keyboardType);
        expect(screen.getByTestId('add_tx_amount_input').props.placeholder).toBe(c.placeholder);
    });

    if (mode === 'transfer') {
        fireEvent.press(screen.getByTestId('add_tx_dest_wallet_picker'));
        fireEvent.press(screen.getByTestId(`add_tx_dest_wallet_${DEST.id}`));
    }
    fireEvent.changeText(screen.getByTestId('add_tx_amount_input'), input);
    fireEvent.press(screen.getByTestId('add_tx_save_button'));

    await waitFor(() => {
        expect(
            alertSpy.mock.calls.length + createTransaction.mock.calls.length + transferBetweenWallets.mock.calls.length,
        ).toBeGreaterThan(0);
    });
    return alertSpy;
}

const MATRIX: [string, Mode, CapCase][] = CAP_CASES.flatMap((c) =>
    (['expense', 'income', 'transfer'] as Mode[]).map((mode): [string, Mode, CapCase] => [c.code, mode, c]),
);

describe('V-128 AddTransactionModal amount cap', () => {
    it.each(MATRIX)('V-128 %s %s: the cap plus one is refused with the maximum, and nothing is written', async (_code, mode, c) => {
        const alertSpy = await save(c, mode, c.overInput);

        expect(createTransaction).not.toHaveBeenCalled();
        expect(transferBetweenWallets).not.toHaveBeenCalled();
        expect(alertSpy).toHaveBeenCalledWith('modals.addTransaction.invalidAmount', echoedTooLarge(c.max));
    });

    it.each(MATRIX)('control: %s %s: the cap is written as exactly 999999999999', async (_code, mode, c) => {
        const alertSpy = await save(c, mode, c.capInput);

        expect(alertSpy).not.toHaveBeenCalled();
        if (mode === 'transfer') {
            expect(transferBetweenWallets).toHaveBeenCalledWith(SOURCE.id, DEST.id, CAP_MINOR);
            expect(createTransaction).not.toHaveBeenCalled();
        } else {
            expect(createTransaction).toHaveBeenCalledWith(expect.objectContaining({
                type: mode === 'expense' ? TransactionType.EXPENSE : TransactionType.INCOME,
                amount: CAP_MINOR,
            }));
            expect(transferBetweenWallets).not.toHaveBeenCalled();
        }
    });
});
