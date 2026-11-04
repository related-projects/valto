/**
 * StatCard - large amounts are compact, small ones stay whole, labelled exact
 * (V-128, pass 89)
 *
 * StatCard (Transactions tab) showed formatAmountWhole. Owner answer, pass 89:
 * below 1 000 000 major units it keeps that whole display byte for byte; from
 * 1 000 000 it is compact. Both carry the exact formatAmount output, decimals
 * included, as accessibilityLabel.
 *
 * Real useFormatting with settingsService.loadSettings mocked one level below it.
 * EUR: 2 decimals, symbol U+20AC; comma profile: group ".", decimal ",", symbol
 * after U+00A0. Language fr: "M" after U+00A0.
 */

import { render, screen, waitFor } from '@testing-library/react-native';
import React from 'react';

import { getDefaultSettings } from '../../../data/services/settingsService';
import { StatCard } from '../StatCard';

jest.mock('../../../data/services/settingsService', () => {
    const actual = jest.requireActual('../../../data/services/settingsService');
    return { ...actual, loadSettings: jest.fn() };
});

const mockedLoadSettings = jest.requireMock('../../../data/services/settingsService')
    .loadSettings as jest.Mock;

const NBSP = '\u00A0';
/** U+20AC, the EUR symbol in currencies.ts. */
const EURO = '\u20AC';

/**
 * Renders the card and waits for the EUR settings: before they load the hook
 * falls back to "$" in front, so a trailing U+20AC proves they are in. True
 * before and after the fix.
 */
async function renderAmount(amount: number) {
    render(<StatCard label="Income" amount={amount} variant="success" />);
    const node = () => screen.getByText(new RegExp(`${EURO}$`));
    await waitFor(() => expect(node()).toBeTruthy());
    return node();
}

beforeEach(() => {
    jest.clearAllMocks();
    mockedLoadSettings.mockResolvedValue({
        ...getDefaultSettings(),
        currency: 'EUR',
        language: 'fr',
        decimalSeparator: 'comma',
    });
});

describe('StatCard - compact large amounts', () => {
    it('shows 1 999 999,99 compact, labelled exact', async () => {
        const node = await renderAmount(199_999_999);

        expect(node.props.children).toBe(`1,9${NBSP}M${NBSP}${EURO}`);
        expect(node.props.accessibilityLabel).toBe(`1.999.999,99${NBSP}${EURO}`);
    });

    it('keeps an amount below 1 000 000 whole, labelled exact', async () => {
        const node = await renderAmount(200_050);

        expect(node.props.children).toBe(`2.001${NBSP}${EURO}`);
        expect(node.props.accessibilityLabel).toBe(`2.000,50${NBSP}${EURO}`);
    });
});
