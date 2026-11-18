/**
 * TransferModal - one tap on a wallet option with the keyboard up (pass 95)
 *
 * The amount field sits below the two wallet lists. After typing an amount the
 * keyboard stays up while a wallet trigger opens its list (the sheet's
 * ScrollView says "handled"), but the options sit in nested ScrollViews that
 * left keyboardShouldPersistTaps unset ("never"). A nested ScrollView is
 * offered the touch after its parents and before the option, so it took the
 * first tap to close the keyboard.
 *
 * Jest has no soft keyboard, so this pins the prop on every scroll view above
 * a source option and a destination option (see test-utils/scrollAncestors).
 *
 * Harness as in TransferModal.testIDs.test.tsx.
 */

import { fireEvent, render, waitFor } from '@testing-library/react-native';
import React from 'react';

import { getDefaultSettings } from '../../../data/services/settingsService';
import i18n from '../../../localization/i18n';
import { makeWallet } from '../../../test-utils/testFactories';
import { scrollAncestorTapModes } from '../../../test-utils/scrollAncestors';
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
async function openSheet() {
    const screen = render(<TransferModal visible onClose={jest.fn()} />);
    await waitFor(() => {
        expect(screen.getByText(SOURCE.name)).toBeTruthy();
        expect(screen.getByText(DEST.name)).toBeTruthy();
    });
    return screen;
}

describe('pass 95. TransferModal wallet options with the keyboard up', () => {
    it('pass 95. every scroll view above a source option keeps the tap for the option', async () => {
        const { getByTestId } = await openSheet();
        fireEvent.press(getByTestId('transfer_source_wallet_picker'));

        // Nearest first: the source list, then the sheet's ScrollView.
        expect(scrollAncestorTapModes(getByTestId(`transfer_source_wallet_${DEST.id}`))).toEqual([
            'handled',
            'handled',
        ]);
    });

    it('pass 95. every scroll view above a destination option keeps the tap for the option', async () => {
        const { getByTestId } = await openSheet();
        fireEvent.press(getByTestId('transfer_dest_wallet_picker'));

        // Nearest first: the destination list, then the sheet's ScrollView.
        expect(scrollAncestorTapModes(getByTestId(`transfer_dest_wallet_${DEST.id}`))).toEqual([
            'handled',
            'handled',
        ]);
    });
});
