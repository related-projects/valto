/**
 * SpendingBreakdown - the donut centre and legend (V-128, pass 89)
 *
 * The centre used formatAmountCompact, a single "k" tier that rendered 2 000,00
 * as "2,0k". Item 2 of the brief replaces it: the centre now follows the same
 * rule as every tight place - exact below 1 000 000 major units, compact from
 * there - and so does the legend. Each carries the exact amount as its
 * accessibilityLabel.
 *
 * Real useFormatting with settingsService.loadSettings mocked one level below it.
 * EUR: 2 decimals, symbol U+20AC; comma profile: group ".", decimal ",", symbol
 * after U+00A0. Language en: "M" with no gap.
 */

import { render, screen } from '@testing-library/react-native';
import React from 'react';

import { getDefaultSettings } from '../../../data/services/settingsService';
import i18n from '../../../localization/i18n';
import { SpendingBreakdown } from '../SpendingBreakdown';

jest.mock('../../../data/services/settingsService', () => {
    const actual = jest.requireActual('../../../data/services/settingsService');
    return { ...actual, loadSettings: jest.fn() };
});

const mockedLoadSettings = jest.requireMock('../../../data/services/settingsService')
    .loadSettings as jest.Mock;

const NBSP = '\u00A0';
/** U+20AC, the EUR symbol in currencies.ts. */
const EURO = '\u20AC';

const item = (name: string, value: number, color: string) => ({ name, value, color, percentage: 50 });

beforeAll(async () => {
    await i18n.changeLanguage('en');
});

beforeEach(() => {
    jest.clearAllMocks();
    mockedLoadSettings.mockResolvedValue({
        ...getDefaultSettings(),
        currency: 'EUR',
        language: 'en',
        decimalSeparator: 'comma',
    });
});

describe('SpendingBreakdown - donut centre and legend', () => {
    it('shows a centre total below 1 000 000 exact, not in thousands', async () => {
        render(<SpendingBreakdown data={[item('Food', 150_000, '#F59E0B'), item('Rent', 50_000, '#10B981')]} />);

        // The legend is exact before and after the fix: it proves the EUR settings are in.
        await screen.findByText(`1.500,00${NBSP}${EURO}`);

        const centre = screen.getByText(`2.000,00${NBSP}${EURO}`);
        expect(centre.props.children).toBe(`2.000,00${NBSP}${EURO}`);
        expect(centre.props.accessibilityLabel).toBe(`2.000,00${NBSP}${EURO}`);
    });

    it('shows a large centre total and legend amount compact, labelled exact', async () => {
        render(<SpendingBreakdown data={[item('Food', 150_000_000, '#F59E0B'), item('Rent', 49_999_999, '#10B981')]} />);

        await screen.findByText(`499.999,99${NBSP}${EURO}`);

        const centre = screen.getByText(`1,9M${NBSP}${EURO}`);
        expect(centre.props.children).toBe(`1,9M${NBSP}${EURO}`);
        expect(centre.props.accessibilityLabel).toBe(`1.999.999,99${NBSP}${EURO}`);

        const legend = screen.getByText(`1,5M${NBSP}${EURO}`);
        expect(legend.props.children).toBe(`1,5M${NBSP}${EURO}`);
        expect(legend.props.accessibilityLabel).toBe(`1.500.000,00${NBSP}${EURO}`);
    });
});
