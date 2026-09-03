/**
 * AddWalletModal helper-text test
 *
 * Rendered against the REAL fr resources. The wallet/category distinction was
 * stated in exactly one place - onboarding step 2, seen once - and a user who
 * reads "portefeuille" as "envelope" creates a wallet per spending line and then
 * cannot list a month's expenses. This asserts the sentence itself, not a key.
 */

jest.mock('../../../hooks/useWallets', () => ({
    useWallets: () => ({ createWallet: jest.fn() }),
}));

jest.mock('../../../hooks/useFormatting', () => ({
    useFormatting: () => ({
        parseAmount: (v: string) => (v ? Number(v) : null),
        normalizeAmount: (v: number) => Math.round(v * 100),
        decimals: 2,
    }),
}));

import { render } from '@testing-library/react-native';
import React from 'react';

import i18n from '../../../localization/i18n';
import { AddWalletModal } from '../AddWalletModal';

beforeAll(async () => {
    await i18n.changeLanguage('fr');
});

describe('AddWalletModal', () => {
    it('explains what a wallet is and names the contrast with a category', () => {
        const { getByTestId } = render(
            <AddWalletModal visible onClose={jest.fn()} />,
        );

        expect(getByTestId('add_wallet_name_help').props.children).toBe(
            "Un portefeuille est l'endroit où vous gardez votre argent (espèces, compte bancaire, mobile money) ; une ligne de dépense est une catégorie, pas un portefeuille.",
        );
    });
});
