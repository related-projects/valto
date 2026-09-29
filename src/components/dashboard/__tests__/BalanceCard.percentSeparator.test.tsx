import { render, screen } from '@testing-library/react-native';
import React from 'react';

import { getDefaultSettings } from '../../../data/services/settingsService';
import i18n from '../../../localization/i18n';
import { BalanceCard } from '../BalanceCard';

/**
 * BalanceCard - the month-on-month change badge follows the user's decimal character
 *
 * Registry V-95. The badge sits directly under the amount it qualifies; the
 * amount followed the stored number-format profile and the badge, written with
 * toFixed, always printed a dot.
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

describe('BalanceCard change badge separator', () => {
    it('writes the income change with a comma under the comma profile', async () => {
        render(
            <BalanceCard
                totalBalance={500000}
                monthlyIncome={100000}
                monthlyExpense={80000}
                incomeChange={12.5}
                expenseChange={null}
            />,
        );

        // The income amount proves the comma profile is loaded before the badge is read.
        expect(await screen.findByText('1.000,00\xA0$')).toBeTruthy();
        expect(screen.getByText('12,5%')).toBeTruthy();
    });
});
