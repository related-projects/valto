import { fireEvent, render, waitFor } from '@testing-library/react-native';
import React from 'react';
import { TextInput } from 'react-native';

import { Wallet, WalletType } from '../../../domain/entities';
import i18n from '../../../localization/i18n';
import { EditWalletModal } from '../EditWalletModal';

/**
 * EditWalletModal - no balance field (V-87)
 *
 * A wallet balance moves only through the ledger. The edit sheet used to offer
 * an "Initial Balance" input whose value was written straight over the stored
 * balance, outside the ledger. The sheet now edits name, type and color only,
 * and the repository refuses a balance change regardless
 * (src/data/__tests__/walletEditGuard.test.ts).
 */

const mockUpdateWallet = jest.fn();

jest.mock('../../../hooks/useWallets', () => ({
    useWallets: () => ({
        updateWallet: mockUpdateWallet,
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

beforeAll(async () => {
    await i18n.changeLanguage('en');
});

beforeEach(() => {
    mockUpdateWallet.mockReset();
    mockUpdateWallet.mockResolvedValue(WALLET);
});

describe('EditWalletModal', () => {
    it('renders no balance input', () => {
        const { UNSAFE_getAllByType, queryByDisplayValue } = render(
            <EditWalletModal visible wallet={WALLET} onClose={jest.fn()} />,
        );

        // The name is the only free-text field left.
        expect(UNSAFE_getAllByType(TextInput)).toHaveLength(1);
        expect(queryByDisplayValue('1000')).toBeNull();
    });

    it('saves without a balance', async () => {
        const onClose = jest.fn();
        const { getByText } = render(
            <EditWalletModal visible wallet={WALLET} onClose={onClose} />,
        );

        fireEvent.press(getByText(i18n.t('modals.editWallet.save')));

        await waitFor(() => expect(onClose).toHaveBeenCalled());
        expect(mockUpdateWallet).toHaveBeenCalledTimes(1);
        const dto = mockUpdateWallet.mock.calls[0][0];
        expect(dto).not.toHaveProperty('balance');
        expect(dto).toEqual({
            id: 'wallet-cash',
            name: 'Cash',
            type: WalletType.CASH,
            color: '#4CAF50',
        });
    });
});
