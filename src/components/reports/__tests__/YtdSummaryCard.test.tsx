/**
 * YtdSummaryCard Tests
 *
 * Deliberately renders the REAL useFormatting and the REAL fr resources.
 *
 * Every other component suite in this repo mocks `useFormatting` and stubs `t` to
 * return the key it was given. Neither can see what the card actually prints, so a
 * card rendering the wrong year inside an interpolated title passes all of them.
 * The year assertion below is the whole point of this file and only works because
 * the real translation runs.
 *
 * Determinism comes from one level lower - settingsService.loadSettings - so the
 * hook, the currency registry and formatAmount all execute for real.
 */

import { render, screen } from '@testing-library/react-native';
import React from 'react';

import i18n from '../../../localization/i18n';
import { EMPTY_VALUE_PLACEHOLDER } from '../../../utils/placeholders';
import { YtdSummaryCard } from '../YtdSummaryCard';

/**
 * Read expected copy out of the locale rather than restating it. The fr values
 * carry accents; test sources in this repo stay ASCII. Asserting through t() also
 * fails loudly if the key is renamed, which a hardcoded string would not.
 */
const noActivityText = () => i18n.t('reports.ytdSummary.noActivity');

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
    totalIncome: 100000,
    totalExpenses: 25000,
    net: 75000,
    savingsRate: 0.75,
    year: 2025,
    hasActivity: true,
};

describe('YtdSummaryCard', () => {
    it('titles itself with the year it is given, not the current year', async () => {
        render(<YtdSummaryCard {...POPULATED} />);

        expect(await screen.findByText('Cumul annuel (2025)')).toBeTruthy();
        expect(screen.queryByText(`Cumul annuel (${new Date().getUTCFullYear()})`)).toBeNull();
    });

    it('renders the placeholder, not a rate of zero, when the year had no income', async () => {
        render(
            <YtdSummaryCard
                totalIncome={0}
                totalExpenses={25000}
                net={-25000}
                savingsRate={null}
                year={2025}
                hasActivity
            />,
        );

        expect(await screen.findByText(EMPTY_VALUE_PLACEHOLDER)).toBeTruthy();
        expect(screen.queryByText('0.0%')).toBeNull();
    });

    it('renders the empty state instead of a column of zeros when nothing happened', async () => {
        render(
            <YtdSummaryCard
                totalIncome={0}
                totalExpenses={0}
                net={0}
                savingsRate={null}
                year={2025}
                hasActivity={false}
            />,
        );

        expect(await screen.findByText(noActivityText())).toBeTruthy();
        expect(screen.queryByText('$0.00')).toBeNull();
        // The card still says which period it is talking about.
        expect(screen.getByText('Cumul annuel (2025)')).toBeTruthy();
    });

    // CONTROL: the empty state must not swallow a card that has data.
    it('CONTROL renders figures unchanged when the period has data', async () => {
        render(<YtdSummaryCard {...POPULATED} />);

        expect(await screen.findByText('$1,000.00')).toBeTruthy();
        expect(screen.getByText('$250.00')).toBeTruthy();
        expect(screen.getByText('75.0%')).toBeTruthy();
        expect(screen.queryByText(noActivityText())).toBeNull();
        expect(screen.queryByText(EMPTY_VALUE_PLACEHOLDER)).toBeNull();
    });

    // CONTROL: proves the formatter is real. A mocked one would render "100000".
    it('CONTROL formats through the real formatter, not a stringified integer', async () => {
        render(<YtdSummaryCard {...POPULATED} />);

        expect(await screen.findByText('$1,000.00')).toBeTruthy();
        expect(screen.queryByText('100000')).toBeNull();
    });

    // CONTROL: the minus on a negative net is a sign, not the placeholder.
    it('CONTROL keeps the sign prefix on a negative net', async () => {
        render(
            <YtdSummaryCard
                totalIncome={25000}
                totalExpenses={100000}
                net={-75000}
                savingsRate={-3}
                year={2025}
                hasActivity
            />,
        );

        expect(await screen.findByText('-$750.00')).toBeTruthy();
    });
});
