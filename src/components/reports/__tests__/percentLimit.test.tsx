import { render, screen } from '@testing-library/react-native';
import React from 'react';

import { getDefaultSettings } from '../../../data/services/settingsService';
import i18n from '../../../localization/i18n';
import { CategoryBreakdownTable } from '../CategoryBreakdownTable';
import { FinancialSummary } from '../FinancialSummary';
import { ReportDonutChart } from '../ReportDonutChart';
import { YtdSummaryCard } from '../YtdSummaryCard';

/**
 * Reports - a percentage beyond 999 % is shown as "over 999%" / "below -999%"
 *
 * REGISTRE C28, Owner decisions 21/11, decision 1. A savings rate over a tiny
 * income printed every digit ("-99999999898,1%"). Beyond 999 in either
 * direction the screen now says so in words; a value within range keeps its
 * digits exactly as before (the controls below).
 *
 * Harness as in FinancialSummary.percentSeparator.test.tsx: real useFormatting,
 * real bundles, profile set in settingsService.loadSettings. Expected strings
 * are written out: en "over 999%" / "below -999%", fr "plus de 999%" /
 * "moins de -999%". Amount strings prove the settings are loaded before the
 * percentage is read (space profile: U+00A0 groups, written \xA0).
 */

jest.mock('../../../data/services/settingsService', () => {
    const actual = jest.requireActual('../../../data/services/settingsService');
    return { ...actual, loadSettings: jest.fn() };
});

const mockedLoadSettings = jest.requireMock('../../../data/services/settingsService')
    .loadSettings as jest.Mock;

const withSettings = (language: 'en' | 'fr', decimalSeparator: 'dot' | 'space') => {
    mockedLoadSettings.mockResolvedValue({
        ...getDefaultSettings(),
        currency: 'USD',
        language,
        decimalSeparator,
    });
};

beforeEach(async () => {
    jest.clearAllMocks();
    await i18n.changeLanguage('en');
});

afterAll(async () => {
    await i18n.changeLanguage('en');
});

describe('C28 FinancialSummary savings rate', () => {
    const base = { totalIncome: 1, totalExpense: 100000000000, netBalance: -99999999999, hasActivity: true };

    it('fr: a rate of -99999999898.1 % reads "moins de -999%"', async () => {
        await i18n.changeLanguage('fr');
        withSettings('fr', 'space');
        render(<FinancialSummary {...base} savingsRate={-99999999898.1} />);

        expect(await screen.findByText('0,01\xA0$')).toBeTruthy();
        expect(screen.getByText('moins de -999%')).toBeTruthy();
        expect(screen.queryByText(/99999999898/)).toBeNull();
    });

    it('en: a rate above 999 reads "over 999%"', async () => {
        withSettings('en', 'dot');
        render(<FinancialSummary {...base} savingsRate={1000.5} />);

        expect(await screen.findByText('$0.01')).toBeTruthy();
        expect(screen.getByText('over 999%')).toBeTruthy();
    });

    it('control: 999 and -999 keep their digits', async () => {
        withSettings('en', 'dot');
        const { rerender } = render(<FinancialSummary {...base} savingsRate={999} />);
        expect(await screen.findByText('$0.01')).toBeTruthy();
        expect(screen.getByText('999.0%')).toBeTruthy();

        rerender(<FinancialSummary {...base} savingsRate={-999} />);
        expect(screen.getByText('-999.0%')).toBeTruthy();
    });
});

describe('C28 YtdSummaryCard savings rate', () => {
    it('en: a ratio of -999999 (-99999900 %) reads "below -999%"', async () => {
        withSettings('en', 'dot');
        render(
            <YtdSummaryCard
                totalIncome={100}
                totalExpenses={100000000}
                net={-99999900}
                savingsRate={-999999}
                year={2026}
                hasActivity
            />,
        );

        expect(await screen.findByText('$1.00')).toBeTruthy();
        expect(screen.getByText('below -999%')).toBeTruthy();
        expect(screen.queryByText(/99999900\.0/)).toBeNull();
    });

    it('control: a ratio of 0.125 keeps "12.5%"', async () => {
        withSettings('en', 'dot');
        render(
            <YtdSummaryCard
                totalIncome={100000}
                totalExpenses={87500}
                net={12500}
                savingsRate={0.125}
                year={2026}
                hasActivity
            />,
        );

        expect(await screen.findByText('$1,000.00')).toBeTruthy();
        expect(screen.getByText('12.5%')).toBeTruthy();
    });
});

describe('C28 category percentages', () => {
    it('ReportDonutChart: a share above 999 reads "over 999%", a share within range keeps its digits', async () => {
        withSettings('en', 'dot');
        render(
            <ReportDonutChart
                totalExpense={100000}
                data={[
                    { name: 'Food', value: 100000, color: '#ff0000', percentage: 1500 },
                    { name: 'Rent', value: 40000, color: '#00ff00', percentage: 40 },
                ]}
            />,
        );

        expect(await screen.findByText('Food')).toBeTruthy();
        expect(screen.getByText('over 999%')).toBeTruthy();
        expect(screen.getByText('40%')).toBeTruthy();
        expect(screen.queryByText('1500%')).toBeNull();
    });

    it('CategoryBreakdownTable: a share below -999 reads "below -999%", a share within range keeps its digits', async () => {
        withSettings('en', 'dot');
        render(
            <CategoryBreakdownTable
                data={[
                    { categoryName: 'Food', categoryColor: '#ff0000', amount: 100000, percentage: -1500, isOverBudget: false },
                    { categoryName: 'Rent', categoryColor: '#00ff00', amount: 40000, percentage: 40, isOverBudget: false },
                ]}
            />,
        );

        expect(await screen.findByText('Food')).toBeTruthy();
        expect(screen.getByText('below -999%')).toBeTruthy();
        expect(screen.getByText('40%')).toBeTruthy();
        expect(screen.queryByText('-1500%')).toBeNull();
    });
});
