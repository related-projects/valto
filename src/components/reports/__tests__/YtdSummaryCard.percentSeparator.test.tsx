import { render, screen } from '@testing-library/react-native';
import React from 'react';

import { getDefaultSettings } from '../../../data/services/settingsService';
import i18n from '../../../localization/i18n';
import { YtdSummaryCard } from '../YtdSummaryCard';

/**
 * YtdSummaryCard - the year's savings rate follows the user's decimal character
 *
 * Registry V-95. The card receives the rate as a 0-1 ratio and scaled it with
 * toFixed, which always prints a dot, next to amounts that follow the stored
 * number-format profile.
 *
 * Harness and conventions as in FinancialSummary.percentSeparator.test.tsx:
 * real useFormatting, real bundle, profile set in settingsService.loadSettings,
 * expected strings written out from numberFormats.ts (comma: group ".", decimal
 * ",", symbol after U+00A0, written \xA0).
 */

jest.mock('../../../data/services/settingsService', () => {
    const actual = jest.requireActual('../../../data/services/settingsService');
    return { ...actual, loadSettings: jest.fn() };
});

const mockedLoadSettings = jest.requireMock('../../../data/services/settingsService')
    .loadSettings as jest.Mock;

beforeAll(async () => {
    await i18n.changeLanguage('en');
});

beforeEach(() => {
    jest.clearAllMocks();
    mockedLoadSettings.mockResolvedValue({
        ...getDefaultSettings(),
        currency: 'USD',
        language: 'en',
        decimalSeparator: 'comma',
    });
});

describe('YtdSummaryCard savings rate separator', () => {
    it('writes the savings rate with a comma under the comma profile', async () => {
        render(
            <YtdSummaryCard
                totalIncome={100000}
                totalExpenses={87500}
                net={12500}
                savingsRate={0.125}
                year={2025}
                hasActivity
            />,
        );

        // The income amount proves the comma profile is loaded before the rate is read.
        expect(await screen.findByText('1.000,00\xA0$')).toBeTruthy();
        expect(screen.getByText('12,5%')).toBeTruthy();
    });
});
