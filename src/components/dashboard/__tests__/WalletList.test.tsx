/**
 * WalletList Tests
 *
 * Zero wallets is a normal state after a currency reset or store recovery,
 * so the empty-state CTA must reach the add-wallet flow. AddWalletModal is
 * owned by WalletsScreen's local state, so the CTA routes to the Wallets tab
 * rather than opening a second modal.
 */

const mockPush = jest.fn();

jest.mock('expo-router', () => ({
    useRouter: () => ({ push: mockPush }),
}));

jest.mock('react-i18next', () => ({
    useTranslation: () => ({ t: (key: string) => key }),
}));

jest.mock('../../../hooks/useFormatting', () => ({
    useFormatting: () => ({
        formatAmount: (v: number) => String(v),
    }),
}));

jest.mock('../../../theme/theme', () => ({
    useTheme: () => ({
        colors: {
            background: '#fff',
            foreground: '#000',
            mutedForeground: '#666',
            destructive: '#E14141',
            card: '#f5f5f5',
            secondary: '#eee',
            accent: '#eef',
            accentForeground: '#000',
        },
        spacing: { xs: 4, sm: 8, md: 16, lg: 20, xl: 24 },
        radius: { sm: 8, md: 12, lg: 16, xl: 20, full: 999 },
        typography: {
            sizes: { xs: 12, sm: 14, md: 16, lg: 18 },
            weights: { regular: '400', semibold: '600', bold: '700' },
        },
        shadows: { card: {}, elevated: {} },
    }),
}));

import { fireEvent, render } from '@testing-library/react-native';
import React from 'react';

import { Wallet, WalletType } from '../../../domain/entities';
import { WalletList } from '../WalletList';

const wallet: Wallet = {
    id: 'w1',
    name: 'Cash',
    balance: 1000,
    type: WalletType.CASH,
    createdAt: new Date('2024-01-01T00:00:00.000Z'),
};

beforeEach(() => {
    jest.clearAllMocks();
});

describe('WalletList', () => {
    it('routes the empty-state CTA to the Wallets tab', () => {
        const { getByTestId } = render(<WalletList wallets={[]} />);

        fireEvent.press(getByTestId('wallet_list_create_first'));

        expect(mockPush).toHaveBeenCalledTimes(1);
        expect(mockPush).toHaveBeenCalledWith('/(tabs)/wallets');
    });

    it('routes "See all" to the same Wallets tab when wallets exist', () => {
        const { getByText, queryByTestId } = render(<WalletList wallets={[wallet]} />);

        expect(queryByTestId('wallet_list_create_first')).toBeNull();

        fireEvent.press(getByText('components.walletList.seeAll'));

        expect(mockPush).toHaveBeenCalledWith('/(tabs)/wallets');
    });
});
