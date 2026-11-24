/**
 * WalletsScreen - the wallet carousel comes back inside its content when the
 * list shrinks, and getItemLayout counts the left padding
 *
 * REGISTRE C23. After a wallet is deleted the horizontal list is shorter, but
 * the native view keeps the scroll offset it had: scrolled to the end of three
 * cards, the carousel stays past the end of two, showing empty space. Nothing
 * on the screen corrected it. The screen now remembers the offset and, when the
 * content becomes shorter than that offset allows, scrolls back to the new end
 * (the last card, flush with the right padding).
 *
 * getItemLayout gave card i the offset (cardWidth + gap) * i, but the content
 * starts after the 20 dp left padding (spacing.lg), so every offset was 20 short.
 *
 * Geometry under jest: window 750 wide, card 0.78 * 750 = 585, gap 12, padding
 * 20 each side. Content of n cards: 40 + 585n + 12(n - 1). Largest offset:
 * content - 750. Three cards: 1819 - 750 = 1069. Two cards: 1222 - 750 = 472.
 * Written out here, not read from WalletsScreen.tsx.
 *
 * Harness from WalletsScreen.windowSize.test.tsx, with the wallet list held in a
 * mutable variable so a rerender can shrink it.
 */

import { fireEvent, render } from '@testing-library/react-native';
import React from 'react';
import { Dimensions, FlatList } from 'react-native';

import i18n from '../../localization/i18n';
import { makeWallet } from '../../test-utils/testFactories';
import { WalletsScreen } from '../WalletsScreen';

jest.mock('react-native-safe-area-context', () => ({
    useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

// `mock` prefix so jest.mock() hoisting allows the reference.
let mockWallets: ReturnType<typeof makeWallet>[] = [];

jest.mock('../../hooks/useWallets', () => ({
    useWallets: () => ({ wallets: mockWallets, getTotalBalance: () => 0, refreshWallets: jest.fn() }),
}));

jest.mock('../../hooks/useTransactions', () => ({
    useTransactions: () => ({ transactions: [] }),
}));

jest.mock('../../hooks/useFormatting', () => ({
    useFormatting: () => ({
        formatAmount: (value: number) => String(value),
        formatAmountCompactLarge: (value: number) => String(value),
    }),
}));

jest.mock('../../components/modals/AddWalletModal', () => ({ AddWalletModal: () => null }));
jest.mock('../../components/modals/EditWalletModal', () => ({ EditWalletModal: () => null }));
jest.mock('../../components/transactions/TransactionList', () => ({ TransactionList: () => null }));

const THREE = [
    makeWallet({ id: 'w-1', name: 'Main Wallet' }),
    makeWallet({ id: 'w-2', name: 'Savings Wallet' }),
    makeWallet({ id: 'w-3', name: 'Travel Wallet' }),
];

const scrollEvent = (x: number, contentWidth: number) => ({
    nativeEvent: {
        contentOffset: { x, y: 0 },
        contentSize: { width: contentWidth, height: 225 },
        layoutMeasurement: { width: 750, height: 225 },
    },
});

let scrollToOffset: jest.SpyInstance;

beforeAll(async () => {
    await i18n.changeLanguage('en');
});

beforeEach(() => {
    mockWallets = [...THREE];
    scrollToOffset = jest.spyOn(FlatList.prototype, 'scrollToOffset').mockImplementation(() => undefined);
});

afterEach(() => {
    scrollToOffset.mockRestore();
});

describe('C23 WalletsScreen carousel after the list shrinks', () => {
    it('precondition: the jest window is 750 wide', () => {
        expect(Dimensions.get('window').width).toBe(750);
    });

    it('scrolled to the end of three cards, deleting one scrolls back to the end of two (offset 472)', () => {
        const { UNSAFE_getByType, rerender } = render(<WalletsScreen />);

        fireEvent.scroll(UNSAFE_getByType(FlatList), scrollEvent(1069, 1819));

        mockWallets = THREE.slice(0, 2);
        rerender(<WalletsScreen />);

        expect(scrollToOffset).toHaveBeenCalledWith(expect.objectContaining({ offset: 472 }));
    });

    it('control: an offset still inside the shorter content is left alone', () => {
        const { UNSAFE_getByType, rerender } = render(<WalletsScreen />);

        fireEvent.scroll(UNSAFE_getByType(FlatList), scrollEvent(300, 1819));

        mockWallets = THREE.slice(0, 2);
        rerender(<WalletsScreen />);

        expect(scrollToOffset).not.toHaveBeenCalled();
    });
});

describe('C23 WalletsScreen getItemLayout', () => {
    it('counts the 20 dp left padding: card 0 at 20, card 2 at 20 + 2 * 597', () => {
        const { UNSAFE_getByType } = render(<WalletsScreen />);
        const getItemLayout = UNSAFE_getByType(FlatList).props.getItemLayout;

        expect(getItemLayout(THREE, 0)).toEqual({ length: 585, offset: 20, index: 0 });
        expect(getItemLayout(THREE, 2)).toEqual({ length: 585, offset: 1214, index: 2 });
    });
});
