/**
 * AddTransactionModal - the sheet is sized from the window it is shown in.
 *
 * The sheet height was a module constant, 85% of Dimensions.get('window') read
 * once when the file was first imported. A rotation, a fold or a split-screen
 * resize changes the window and the constant does not follow, so the sheet
 * keeps the height of a window that no longer exists (pass 81, Owner decision 3).
 *
 * The ratio is read off the first render rather than restated, so the test pins
 * "follows the window", not a particular percentage.
 */

import { render, waitFor } from '@testing-library/react-native';
import React from 'react';
import { Dimensions } from 'react-native';

import { getDefaultSettings } from '../../../data/services/settingsService';
import i18n from '../../../localization/i18n';
import { makeCategory, makeWallet } from '../../../test-utils/testFactories';
import { nearestHostNumber, resizeWindow, restoreWindow } from '@/tests/helpers/windowSize';
import { AddTransactionModal } from '../AddTransactionModal';

jest.mock('../../../hooks/useWallets', () => ({
    useWallets: jest.fn(),
}));

jest.mock('../../../hooks/useCategories', () => ({
    useCategories: jest.fn(),
}));

jest.mock('../../../hooks/useTransactions', () => ({
    useTransactions: () => ({ createTransaction: jest.fn() }),
}));

jest.mock('../../../data/services/settingsService', () => {
    const actual = jest.requireActual('../../../data/services/settingsService');
    return { ...actual, loadSettings: jest.fn() };
});

const mockedUseWallets = jest.requireMock('../../../hooks/useWallets').useWallets as jest.Mock;
const mockedUseCategories = jest.requireMock('../../../hooks/useCategories').useCategories as jest.Mock;
const mockedLoadSettings = jest.requireMock('../../../data/services/settingsService')
    .loadSettings as jest.Mock;

const WALLET = makeWallet({ id: 'w-1', name: 'Main' });
const FOOD = makeCategory({ id: 'cat-food', name: 'Food' });

beforeAll(async () => {
    await i18n.changeLanguage('en');
});

beforeEach(() => {
    jest.clearAllMocks();
    mockedLoadSettings.mockResolvedValue(getDefaultSettings());
    mockedUseWallets.mockReturnValue({ wallets: [WALLET], refreshWallets: jest.fn() });
    mockedUseCategories.mockReturnValue({
        categories: [FOOD],
        expenseCategories: [FOOD],
        incomeCategories: [],
        refreshCategories: jest.fn(),
    });
});

afterEach(() => {
    restoreWindow();
});

describe('AddTransactionModal - window size', () => {
    it('resizes the sheet when the window changes', async () => {
        const { getAllByText } = render(<AddTransactionModal visible onClose={jest.fn()} />);
        await waitFor(() => expect(mockedLoadSettings).toHaveBeenCalled());

        const title = i18n.t('modals.addTransaction.title');
        const sheetHeight = () => nearestHostNumber(getAllByText(title)[0], 'height');

        const before = Dimensions.get('window');
        const initial = sheetHeight();
        expect(initial).toBeGreaterThan(0);
        const ratio = initial! / before.height;

        // Rotate to landscape.
        resizeWindow(before.height, before.width);

        // The forcing, independent of the fix: the window really is shorter now.
        expect(Dimensions.get('window').height).toBe(before.width);

        expect(sheetHeight()).toBeCloseTo(before.width * ratio);
    });
});
