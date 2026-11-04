import { fireEvent, render, waitFor } from '@testing-library/react-native';
import React from 'react';
import { Alert } from 'react-native';

import { CAP_CASES, CAP_MINOR, echoedTooLarge, type CapCase } from '../../../../tests/helpers/amountCapCases';
import { getDefaultSettings } from '../../../data/services/settingsService';
import { makeWallet } from '../../../test-utils/testFactories';
import { TransferModal } from '../TransferModal';

/**
 * TransferModal - an amount above the cap is refused (REGISTRE V-128)
 *
 * Above 999 999 999 999 minor units the sheet shows the tooLarge sentence,
 * naming the maximum in the user's currency, and moves nothing. The source
 * holds twice the cap, so before the fix nothing but the cap could stop it.
 * The tests named "control" pass before the fix: the cap itself is handed to
 * the transfer unchanged.
 *
 * Real here: useFormatting and the parser. The wallets hook is mocked; the
 * write is its transferBetweenWallets.
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

const SOURCE = makeWallet({ id: 'w-source', name: 'Source', balance: 2 * CAP_MINOR });
const DEST = makeWallet({ id: 'w-dest', name: 'Dest', balance: 0 });

const transferBetweenWallets = jest.fn();

beforeEach(() => {
    jest.clearAllMocks();
    transferBetweenWallets.mockResolvedValue(undefined);
    mockedUseWallets.mockReturnValue({
        wallets: [SOURCE, DEST],
        refreshWallets: jest.fn(),
        transferBetweenWallets,
    });
});

afterEach(() => {
    jest.restoreAllMocks();
});

/** Open the sheet under the currency of `c`, type `input`, press Send, wait for an outcome. */
async function send(c: CapCase, input: string) {
    mockedLoadSettings.mockResolvedValue({
        ...getDefaultSettings(),
        currency: c.code,
        decimalSeparator: c.profile,
    });
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    const screen = render(<TransferModal visible onClose={jest.fn()} />);

    // The placeholder follows the currency's settings once they land.
    await waitFor(() => {
        expect(screen.getByPlaceholderText(c.placeholder).props.keyboardType).toBe(c.keyboardType);
    });

    fireEvent.changeText(screen.getByPlaceholderText(c.placeholder), input);
    fireEvent.press(screen.getByText('modals.transfer.send'));

    await waitFor(() => {
        expect(alertSpy.mock.calls.length + transferBetweenWallets.mock.calls.length).toBeGreaterThan(0);
    });
    return alertSpy;
}

const BY_CODE = CAP_CASES.map((c): [string, CapCase] => [c.code, c]);

describe('V-128 TransferModal amount cap', () => {
    it.each(BY_CODE)('V-128 %s: the cap plus one is refused with the maximum, and nothing is moved', async (_code, c) => {
        const alertSpy = await send(c, c.overInput);

        expect(transferBetweenWallets).not.toHaveBeenCalled();
        expect(alertSpy).toHaveBeenCalledWith('modals.transfer.invalidAmount', echoedTooLarge(c.max));
    });

    it.each(BY_CODE)('control: %s: the cap is moved as exactly 999999999999', async (_code, c) => {
        const alertSpy = await send(c, c.capInput);

        expect(alertSpy).not.toHaveBeenCalled();
        expect(transferBetweenWallets).toHaveBeenCalledWith(SOURCE.id, DEST.id, CAP_MINOR);
    });
});
