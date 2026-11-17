/**
 * TransferModal - every control has a stable testID (pass 94, item 2)
 *
 * None of the seven controls on the transfer sheet had a testID: the backdrop,
 * close, send, the two wallet triggers, the wallet options and the amount
 * input. Each now carries one; a wallet option carries the wallet id, with a
 * prefix per list so the source and destination lists cannot be confused.
 *
 * Opening a list is checked without the new ids: the wallet name is shown once
 * on the trigger, and once more per option when the list is open.
 *
 * Harness as in TransferModal.currencySymbol.test.tsx: only the data sources
 * are mocked.
 */

import { fireEvent, render, waitFor, within } from '@testing-library/react-native';
import React from 'react';
import { TextInput } from 'react-native';

import { getDefaultSettings } from '../../../data/services/settingsService';
import i18n from '../../../localization/i18n';
import { makeWallet } from '../../../test-utils/testFactories';
import { TransferModal } from '../TransferModal';

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

const SOURCE = makeWallet({ id: 'w-source', name: 'Source Wallet', balance: 250000 });
const DEST = makeWallet({ id: 'w-dest', name: 'Dest Wallet', balance: 10000 });

beforeAll(async () => {
    await i18n.changeLanguage('en');
});

beforeEach(() => {
    jest.clearAllMocks();
    mockedLoadSettings.mockResolvedValue(getDefaultSettings());
    mockedUseWallets.mockReturnValue({
        wallets: [SOURCE, DEST],
        refreshWallets: jest.fn(),
        transferBetweenWallets: jest.fn(),
    });
});

/** Render the open sheet and wait until it has picked its default wallets. */
async function openSheet(onClose: jest.Mock = jest.fn()) {
    const screen = render(<TransferModal visible onClose={onClose} />);
    await waitFor(() => {
        expect(screen.getByText(SOURCE.name)).toBeTruthy();
        expect(screen.getByText(DEST.name)).toBeTruthy();
    });
    return screen;
}

describe('pass 94 item 2. TransferModal testIDs', () => {
    it.each(['transfer_overlay', 'transfer_close_button'])(
        'pass 94 item 2. %s closes the sheet',
        async (id) => {
            const onClose = jest.fn();
            const { getByTestId } = await openSheet(onClose);

            fireEvent.press(getByTestId(id));

            expect(onClose).toHaveBeenCalledTimes(1);
        },
    );

    it('pass 94 item 2. transfer_send_button is the button showing the send label', async () => {
        const { getByTestId } = await openSheet();

        expect(within(getByTestId('transfer_send_button')).getByText(i18n.t('modals.transfer.send'))).toBeTruthy();
    });

    it('pass 94 item 2. transfer_amount_input is the amount TextInput', async () => {
        const { UNSAFE_getByType } = await openSheet();

        expect(UNSAFE_getByType(TextInput).props.testID).toBe('transfer_amount_input');
    });

    it('pass 94 item 2. the source trigger and each source option carry ids', async () => {
        const { getByTestId, getAllByText } = await openSheet();

        fireEvent.press(getByTestId('transfer_source_wallet_picker'));

        // The forcing, independent of the ids: the list is open.
        expect(getAllByText(SOURCE.name)).toHaveLength(2);
        expect(getByTestId(`transfer_source_wallet_${SOURCE.id}`)).toBeTruthy();
        expect(getByTestId(`transfer_source_wallet_${DEST.id}`)).toBeTruthy();
    });

    it('pass 94 item 2. the destination trigger and each destination option carry ids', async () => {
        const { getByTestId, getAllByText, queryByTestId } = await openSheet();

        fireEvent.press(getByTestId('transfer_dest_wallet_picker'));

        // The forcing, independent of the ids: the list is open.
        expect(getAllByText(DEST.name)).toHaveLength(2);
        expect(getByTestId(`transfer_dest_wallet_${DEST.id}`)).toBeTruthy();
        // The source is not offered as a destination.
        expect(queryByTestId(`transfer_dest_wallet_${SOURCE.id}`)).toBeNull();
    });

    it('pass 94 item 2. an option id selects that wallet', async () => {
        const { getByTestId, queryByTestId } = await openSheet();

        fireEvent.press(getByTestId('transfer_source_wallet_picker'));
        fireEvent.press(getByTestId(`transfer_source_wallet_${DEST.id}`));

        // The list closed on the pick and the source trigger names the picked wallet.
        expect(queryByTestId(`transfer_source_wallet_${DEST.id}`)).toBeNull();
        expect(within(getByTestId('transfer_source_wallet_picker')).getByText(DEST.name)).toBeTruthy();
    });
});
