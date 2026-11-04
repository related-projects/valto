/**
 * TransferModal - the sheet is sized from the window it is shown in.
 *
 * Same defect as AddTransactionModal.windowSize.test.tsx: the height was 70% of
 * the window read once at import, so it ignored every later resize (pass 81,
 * Owner decision 3). The ratio is read off the first render, not restated.
 */

import { render, waitFor } from '@testing-library/react-native';
import React from 'react';
import { Dimensions } from 'react-native';

import { getDefaultSettings } from '../../../data/services/settingsService';
import i18n from '../../../localization/i18n';
import { makeWallet } from '../../../test-utils/testFactories';
import { nearestHostNumber, resizeWindow, restoreWindow } from '@/tests/helpers/windowSize';
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

// Two wallets: the screen refuses to render the transfer form with fewer.
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

afterEach(() => {
    restoreWindow();
});

describe('TransferModal - window size', () => {
    it('resizes the sheet when the window changes', async () => {
        const { getAllByText } = render(
            <TransferModal visible onClose={jest.fn()} onSuccess={jest.fn()} />,
        );
        await waitFor(() => expect(mockedLoadSettings).toHaveBeenCalled());

        const title = i18n.t('modals.transfer.title');
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
