import { render, screen } from '@testing-library/react-native';
import React from 'react';

import { getDefaultSettings } from '../../../data/services/settingsService';
import i18n from '../../../localization/i18n';
import { BalanceCard } from '../BalanceCard';

/**
 * BalanceCard - a month-on-month change beyond 999 % reads "over 999%"
 *
 * REGISTRE C28, Owner decisions 21/11, decision 1. The badge prints the
 * absolute change; after a month with almost no income it printed every digit
 * ("18002646.4%"). Beyond 999 it now says "over 999%"; within range the digits
 * are unchanged (control).
 *
 * Harness as in BalanceCard.percentSeparator.test.tsx: real useFormatting, real
 * bundle, settings from settingsService.loadSettings, strings written out.
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
        decimalSeparator: 'dot',
    });
});

describe('C28 BalanceCard change badge', () => {
    it('an income change of 18002646.4 % reads "over 999%"', async () => {
        render(
            <BalanceCard
                totalBalance={500000}
                monthlyIncome={100000}
                monthlyExpense={80000}
                incomeChange={18002646.4}
                expenseChange={null}
            />,
        );

        expect(await screen.findByText('$1,000.00')).toBeTruthy();
        expect(screen.getByText('over 999%')).toBeTruthy();
        expect(screen.queryByText(/18002646/)).toBeNull();
    });

    it('a change of -1500 % (shown as its absolute value) reads "over 999%"', async () => {
        render(
            <BalanceCard
                totalBalance={500000}
                monthlyIncome={100000}
                monthlyExpense={80000}
                incomeChange={null}
                expenseChange={-1500}
            />,
        );

        expect(await screen.findByText('$1,000.00')).toBeTruthy();
        expect(screen.getByText('over 999%')).toBeTruthy();
    });

    it('control: a change of 12.5 % keeps "12.5%"', async () => {
        render(
            <BalanceCard
                totalBalance={500000}
                monthlyIncome={100000}
                monthlyExpense={80000}
                incomeChange={12.5}
                expenseChange={null}
            />,
        );

        expect(await screen.findByText('$1,000.00')).toBeTruthy();
        expect(screen.getByText('12.5%')).toBeTruthy();
    });
});
