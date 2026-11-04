import { fireEvent, render, waitFor } from '@testing-library/react-native';
import React from 'react';
import { Alert } from 'react-native';

import { CAP_CASES, CAP_MINOR, echoedTooLarge, type CapCase } from '../../../../tests/helpers/amountCapCases';
import { getDefaultSettings } from '../../../data/services/settingsService';
import { AddWalletModal } from '../AddWalletModal';

/**
 * AddWalletModal - an opening balance above the cap is refused (REGISTRE V-128)
 *
 * The opening balance is read through the shared parser like every other
 * amount. Above 999 999 999 999 minor units the sheet shows the tooLarge
 * sentence, naming the maximum in the user's currency, and creates no wallet.
 * The tests named "control" pass before the fix: the cap itself is handed to
 * createWallet unchanged.
 *
 * Real here: useFormatting and the parser. The wallets hook is mocked; the
 * write is its createWallet.
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

jest.mock('../../../data/services/settingsService', () => {
    const actual = jest.requireActual('../../../data/services/settingsService');
    return { ...actual, loadSettings: jest.fn() };
});

const mockedUseWallets = jest.requireMock('../../../hooks/useWallets').useWallets as jest.Mock;
const mockedLoadSettings = jest.requireMock('../../../data/services/settingsService')
    .loadSettings as jest.Mock;

const createWallet = jest.fn();

beforeEach(() => {
    jest.clearAllMocks();
    createWallet.mockResolvedValue(undefined);
    mockedUseWallets.mockReturnValue({ createWallet });
});

afterEach(() => {
    jest.restoreAllMocks();
});

/** Open the sheet under the currency of `c`, name the wallet, type `input`, press Save. */
async function save(c: CapCase, input: string) {
    mockedLoadSettings.mockResolvedValue({
        ...getDefaultSettings(),
        currency: c.code,
        decimalSeparator: c.profile,
    });
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    const screen = render(<AddWalletModal visible onClose={jest.fn()} />);

    await waitFor(() => {
        expect(screen.getByTestId('add_wallet_balance_input').props.keyboardType).toBe(c.keyboardType);
        expect(screen.getByTestId('add_wallet_balance_input').props.placeholder).toBe(c.placeholder);
    });

    fireEvent.changeText(screen.getByTestId('add_wallet_name_input'), 'Savings');
    fireEvent.changeText(screen.getByTestId('add_wallet_balance_input'), input);
    fireEvent.press(screen.getByTestId('add_wallet_save_button'));

    await waitFor(() => {
        expect(alertSpy.mock.calls.length + createWallet.mock.calls.length).toBeGreaterThan(0);
    });
    return alertSpy;
}

const BY_CODE = CAP_CASES.map((c): [string, CapCase] => [c.code, c]);

describe('V-128 AddWalletModal opening balance cap', () => {
    it.each(BY_CODE)('V-128 %s: the cap plus one is refused with the maximum, and no wallet is created', async (_code, c) => {
        const alertSpy = await save(c, c.overInput);

        expect(createWallet).not.toHaveBeenCalled();
        expect(alertSpy).toHaveBeenCalledWith('modals.addWallet.invalidBalance', echoedTooLarge(c.max));
    });

    it.each(BY_CODE)('control: %s: the cap is the opening balance, exactly 999999999999', async (_code, c) => {
        const alertSpy = await save(c, c.capInput);

        expect(alertSpy).not.toHaveBeenCalled();
        expect(createWallet).toHaveBeenCalledWith(expect.objectContaining({ name: 'Savings', balance: CAP_MINOR }));
    });
});
