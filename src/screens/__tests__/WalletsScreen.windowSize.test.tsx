/**
 * WalletsScreen - the wallet carousel is sized from the window it is shown in.
 *
 * The card width was 78% of the window read once at import, and the carousel
 * snaps by that width plus the gap. After a rotation, a fold or a split-screen
 * resize the cards kept their old width and every snap landed off a card edge
 * (pass 81, Owner decision 3). The ratio and the gap are read off the first
 * render, not restated.
 *
 * The modals and the transaction list are replaced by nulls: they are not what
 * is sized here, and each pulls in its own data hooks.
 */

import { render } from '@testing-library/react-native';
import React from 'react';
import { Dimensions, FlatList } from 'react-native';

import i18n from '../../localization/i18n';
import { nearestHostNumber, resizeWindow, restoreWindow } from '@/tests/helpers/windowSize';
import { WalletsScreen } from '../WalletsScreen';

// jest.mock is hoisted above the imports, so every factory here is
// self-contained rather than closing over a module-level const.
jest.mock('react-native-safe-area-context', () => ({
    useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.mock('../../hooks/useWallets', () => {
    const { makeWallet } = jest.requireActual('../../test-utils/testFactories');
    const wallets = [
        makeWallet({ id: 'w-main', name: 'Main Wallet' }),
        makeWallet({ id: 'w-savings', name: 'Savings Wallet' }),
    ];
    return {
        useWallets: () => ({ wallets, getTotalBalance: () => 0, refreshWallets: jest.fn() }),
    };
});

jest.mock('../../hooks/useTransactions', () => ({
    useTransactions: () => ({ transactions: [] }),
}));

jest.mock('../../hooks/useFormatting', () => ({
    useFormatting: () => ({ formatAmount: (value: number) => String(value) }),
}));

jest.mock('../../components/modals/AddWalletModal', () => ({ AddWalletModal: () => null }));
jest.mock('../../components/modals/EditWalletModal', () => ({ EditWalletModal: () => null }));
jest.mock('../../components/transactions/TransactionList', () => ({ TransactionList: () => null }));

beforeAll(async () => {
    await i18n.changeLanguage('en');
});

afterEach(() => {
    restoreWindow();
});

describe('WalletsScreen - window size', () => {
    it('resizes the wallet cards and the carousel snap when the window changes', () => {
        const { getByText, UNSAFE_getByType } = render(<WalletsScreen />);

        const cardWidth = () => nearestHostNumber(getByText('Main Wallet'), 'width');
        const snapInterval = (): number => UNSAFE_getByType(FlatList).props.snapToInterval;

        const before = Dimensions.get('window');
        const initialCard = cardWidth();
        expect(initialCard).toBeGreaterThan(0);
        const ratio = initialCard! / before.width;
        const gap = snapInterval() - initialCard!;

        // Rotate to landscape.
        resizeWindow(before.height, before.width);

        // The forcing, independent of the fix: the window really is wider now.
        expect(Dimensions.get('window').width).toBe(before.height);

        expect(cardWidth()).toBeCloseTo(before.height * ratio);
        expect(snapInterval()).toBeCloseTo(before.height * ratio + gap);
    });
});
