/**
 * EditWalletModal - every control has a stable testID (pass 94, item 2)
 *
 * The edit sheet had no testID at all: backdrop, close, save, the name input,
 * the four type buttons, the colour swatches and the delete button. Each now
 * carries one. A type button carries the type value; a swatch carries its
 * colour as lower-case hex without the '#', so the id stays a plain token.
 *
 * Harness as in EditWalletModal.balance.test.tsx.
 */

import { fireEvent, render, within } from '@testing-library/react-native';
import React from 'react';
import { StyleSheet, TextInput } from 'react-native';

import { Wallet, WalletType } from '../../../domain/entities';
import i18n from '../../../localization/i18n';
import { EditWalletModal } from '../EditWalletModal';
import { WALLET_COLORS, WALLET_TYPES } from '../walletConstants';

jest.mock('../../../hooks/useWallets', () => ({
    useWallets: () => ({
        updateWallet: jest.fn(),
        deleteWallet: jest.fn(),
        hasTransactions: jest.fn(),
    }),
}));

const WALLET: Wallet = {
    id: 'wallet-cash',
    name: 'Cash',
    balance: 100000,
    type: WalletType.CASH,
    color: '#4CAF50',
    createdAt: new Date('2026-01-01T00:00:00'),
};

const colorId = (color: string) => `edit_wallet_color_${color.replace('#', '').toLowerCase()}`;

function renderSheet(onClose: jest.Mock = jest.fn()) {
    return render(<EditWalletModal visible wallet={WALLET} onClose={onClose} />);
}

beforeAll(async () => {
    await i18n.changeLanguage('en');
});

describe('pass 94 item 2. EditWalletModal testIDs', () => {
    it.each(['edit_wallet_overlay', 'edit_wallet_close_button'])('pass 94 item 2. %s closes the sheet', (id) => {
        const onClose = jest.fn();
        const { getByTestId } = renderSheet(onClose);

        fireEvent.press(getByTestId(id));

        expect(onClose).toHaveBeenCalledTimes(1);
    });

    it.each([
        ['edit_wallet_save_button', 'modals.editWallet.save'],
        ['edit_wallet_delete_button', 'modals.editWallet.delete'],
    ])('pass 94 item 2. %s is the button showing %s', (id, key) => {
        const { getByTestId } = renderSheet();

        expect(within(getByTestId(id)).getByText(i18n.t(key))).toBeTruthy();
    });

    it('pass 94 item 2. edit_wallet_name_input is the name TextInput', () => {
        const { UNSAFE_getByType } = renderSheet();

        expect(UNSAFE_getByType(TextInput).props.testID).toBe('edit_wallet_name_input');
    });

    it.each(WALLET_TYPES.map(t => [t.value, t.labelKey]))(
        'pass 94 item 2. the %s type button carries its value',
        (value, labelKey) => {
            const { getByTestId } = renderSheet();

            expect(
                within(getByTestId(`edit_wallet_type_${value}`)).getByText(i18n.t(`wallets.type.${labelKey}`)),
            ).toBeTruthy();
        },
    );

    it.each(WALLET_COLORS)('pass 94 item 2. the %s swatch carries its colour', (color) => {
        const { getByTestId } = renderSheet();

        const swatch = getByTestId(colorId(color));
        expect(StyleSheet.flatten(swatch.props.style).backgroundColor).toBe(color);
    });
});
