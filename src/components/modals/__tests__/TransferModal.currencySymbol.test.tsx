/**
 * TransferModal - currency symbol on the amount input
 *
 * The transfer screen renders money in five places. Four of them go through
 * formatAmount, which takes its symbol from the user's settings currency. If a
 * sixth place hardcodes one, it does not merely fail to translate - it
 * contradicts the other four on the same screen the moment the user is not on
 * USD.
 *
 * So these tests put the app on EUR and assert the screen speaks one currency:
 * the settings symbol appears, and no other currency symbol is rendered at all.
 * The real i18n bundle and the real useFormatting are used - a key -> key
 * translation mock would drop the {{amount}} interpolation that carries the
 * symbol, which is the thing under test.
 */

import { render, waitFor } from '@testing-library/react-native';
import React from 'react';

import { getDefaultSettings } from '../../../data/services/settingsService';
import { getCurrencyByCode } from '../../../domain/constants/currencies';
import i18n from '../../../localization/i18n';
import { makeWallet } from '../../../test-utils/testFactories';
import { TransferModal } from '../TransferModal';

// --- Mocks -------------------------------------------------------------
// Only the data sources are mocked. useFormatting, formatAmount and the real
// locale bundle all run for real - they are what decides the symbol.

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

// --- Fixtures ----------------------------------------------------------

// Two wallets: the screen refuses to render the amount field with fewer.
const SOURCE = makeWallet({ id: 'w-source', name: 'Source Wallet', balance: 250000 });
const DEST = makeWallet({ id: 'w-dest', name: 'Dest Wallet', balance: 10000 });

const TEST_CURRENCY = 'EUR';

/**
 * Read the expected symbol out of the currency table rather than restating it -
 * the same idiom FinancialSummary.test.tsx:16 and YtdSummaryCard.test.tsx:25 use
 * for locale copy, and it keeps this source ASCII. This is also the exact table
 * useFormatting reads, so the test stops restating a value the component derives.
 */
const expectedSymbol = () => getCurrencyByCode(TEST_CURRENCY).symbol;

/**
 * The symbol this screen used to hardcode. The test currency is EUR, so a
 * dollar sign reaching the output can only have come from the component.
 */
const FOREIGN_SYMBOL = '$';

beforeAll(async () => {
    await i18n.changeLanguage('en');
});

beforeEach(() => {
    jest.clearAllMocks();
    mockedLoadSettings.mockResolvedValue({ ...getDefaultSettings(), currency: TEST_CURRENCY });
    mockedUseWallets.mockReturnValue({
        wallets: [SOURCE, DEST],
        refreshWallets: jest.fn(),
        transferBetweenWallets: jest.fn(),
    });
});

/** Render the open modal and wait for useFormatting to resolve the settings. */
async function renderTransferModal() {
    const utils = render(
        <TransferModal visible onClose={jest.fn()} onSuccess={jest.fn()} />,
    );
    await waitFor(() => expect(mockedLoadSettings).toHaveBeenCalled());
    return utils;
}

// --- Tests -------------------------------------------------------------

describe('TransferModal - currency symbol', () => {
    it('renders the settings currency symbol beside the amount the user can send', async () => {
        const { getByText } = await renderTransferModal();

        // The "Available:" helper sits directly under the amount input, and
        // carries the balance formatted in the settings currency.
        await waitFor(() => expect(getByText(/Available:/)).toBeTruthy());
        expect(getByText(/Available:/).props.children).toContain(expectedSymbol());
    });

    it('renders no currency symbol other than the one the user selected', async () => {
        const { queryByText, toJSON } = await renderTransferModal();

        await waitFor(() => expect(queryByText(/Available:/)).toBeTruthy());

        // A bare symbol rendered as its own text node - the shape a hardcoded
        // label next to an input takes.
        expect(queryByText(FOREIGN_SYMBOL)).toBeNull();

        // And nowhere inside the tree at all, in case it is concatenated into
        // a larger string rather than standing alone.
        expect(JSON.stringify(toJSON())).not.toContain(FOREIGN_SYMBOL);
    });
});
