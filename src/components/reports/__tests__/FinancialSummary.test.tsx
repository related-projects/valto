/**
 * FinancialSummary Tests
 *
 * Same harness as YtdSummaryCard.test.tsx: the REAL useFormatting and the REAL fr
 * resources, with determinism taken from settingsService.loadSettings one level
 * below the hook rather than by mocking the hook itself.
 */

import { render, screen } from '@testing-library/react-native';
import React from 'react';

import i18n from '../../../localization/i18n';
import { EMPTY_VALUE_PLACEHOLDER } from '../../../utils/placeholders';
import { FinancialSummary } from '../FinancialSummary';

/** Read expected copy out of the locale; fr values carry accents, sources stay ASCII. */
const noActivityText = () => i18n.t('reports.financialSummary.noActivity');
const titleText = () => i18n.t('reports.financialSummary.title');

jest.mock('../../../data/services/settingsService', () => ({
    loadSettings: async () => ({
        theme: 'system',
        currency: 'USD',
        currencyLocked: true,
        notificationsEnabled: false,
        language: 'fr',
        dateFormat: 'DD/MM/YYYY',
        firstDayOfWeek: 'monday',
        decimalSeparator: 'dot',
        onboardingCompleted: true,
    }),
}));

beforeAll(async () => {
    await i18n.changeLanguage('fr');
});

const POPULATED = {
    totalIncome: 200000,
    totalExpense: 50000,
    netBalance: 150000,
    savingsRate: 75,
    hasActivity: true,
};

describe('FinancialSummary', () => {
    it('renders the placeholder, not a rate of zero, when the month had no income', async () => {
        render(
            <FinancialSummary
                totalIncome={0}
                totalExpense={50000}
                netBalance={-50000}
                savingsRate={null}
                hasActivity
            />,
        );

        expect(await screen.findByText(EMPTY_VALUE_PLACEHOLDER)).toBeTruthy();
        expect(screen.queryByText('0.0%')).toBeNull();
    });

    it('renders the empty state instead of a column of zeros when nothing happened', async () => {
        render(
            <FinancialSummary
                totalIncome={0}
                totalExpense={0}
                netBalance={0}
                savingsRate={null}
                hasActivity={false}
            />,
        );

        expect(await screen.findByText(noActivityText())).toBeTruthy();
        expect(screen.queryByText('$0.00')).toBeNull();
        expect(screen.getByText(titleText())).toBeTruthy();
    });

    // CONTROL: the empty state must not swallow a card that has data.
    it('CONTROL renders figures unchanged when the period has data', async () => {
        render(<FinancialSummary {...POPULATED} />);

        expect(await screen.findByText('$2,000.00')).toBeTruthy();
        expect(screen.getByText('$500.00')).toBeTruthy();
        expect(screen.getByText('$1,500.00')).toBeTruthy();
        expect(screen.getByText('75.0%')).toBeTruthy();
        expect(screen.queryByText(noActivityText())).toBeNull();
        expect(screen.queryByText(EMPTY_VALUE_PLACEHOLDER)).toBeNull();
    });

    // CONTROL: proves the formatter is real. A mocked one would render "200000".
    it('CONTROL formats through the real formatter, not a stringified integer', async () => {
        render(<FinancialSummary {...POPULATED} />);

        expect(await screen.findByText('$2,000.00')).toBeTruthy();
        expect(screen.queryByText('200000')).toBeNull();
    });

    // CONTROL: a month with movement but no income still shows its real figures.
    it('CONTROL shows figures for a month with spending but no income', async () => {
        render(
            <FinancialSummary
                totalIncome={0}
                totalExpense={50000}
                netBalance={-50000}
                savingsRate={null}
                hasActivity
            />,
        );

        expect(await screen.findByText('$500.00')).toBeTruthy();
        expect(screen.queryByText(noActivityText())).toBeNull();
    });
});
