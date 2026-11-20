/**
 * YtdSummaryCard states the dates of its 12 periods (REGISTRE C20 step 2,
 * pass 98 item 6).
 *
 * With a start day other than 1 the annual card keeps its title, "Annual Total
 * (2026)", and shows the span of the year's 12 periods under it as secondary
 * text (ytd_summary_period), in the populated and in the empty state. With
 * start day 1 the caller passes no label and the card is as before.
 */

import { render, screen } from '@testing-library/react-native';
import React from 'react';

import i18n from '../../../localization/i18n';
import { YtdSummaryCard } from '../YtdSummaryCard';

jest.mock('../../../data/services/settingsService', () => ({
    loadSettings: async () => ({
        theme: 'system',
        currency: 'USD',
        currencyLocked: true,
        notificationsEnabled: false,
        language: 'en',
        dateFormat: 'YYYY-MM-DD',
        firstDayOfWeek: 'monday',
        decimalSeparator: 'dot',
        onboardingCompleted: true,
    }),
}));

beforeAll(async () => {
    await i18n.changeLanguage('en');
});

const POPULATED = {
    totalIncome: 100000,
    totalExpenses: 25000,
    net: 75000,
    savingsRate: 0.75,
    year: 2026,
    hasActivity: true,
};

describe('pass 98 item 6. YtdSummaryCard period dates', () => {
    it('pass 98 item 6. keeps the title and shows the period dates under it, populated or empty', async () => {
        const { unmount } = render(<YtdSummaryCard {...POPULATED} periodLabel="20 Dec 2025 - 19 Dec 2026" />);

        expect(await screen.findByText('Annual Total (2026)')).toBeTruthy();
        expect(screen.getByTestId('ytd_summary_period').props.children).toBe('20 Dec 2025 - 19 Dec 2026');
        unmount();

        render(<YtdSummaryCard {...POPULATED} hasActivity={false} periodLabel="20 Dec 2025 - 19 Dec 2026" />);
        expect(await screen.findByText('Annual Total (2026)')).toBeTruthy();
        expect(screen.getByTestId('ytd_summary_period').props.children).toBe('20 Dec 2025 - 19 Dec 2026');
    });
});
