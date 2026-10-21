import { fireEvent, render, screen } from '@testing-library/react-native';
import React from 'react';
import { TouchableOpacity } from 'react-native';

import { getDefaultSettings } from '../../../data/services/settingsService';
import i18n from '../../../localization/i18n';
import { BalanceCard } from '../BalanceCard';

/**
 * BalanceCard - the four amounts stay on one line and shrink to fit
 *
 * Pass 77, Owner decision 2. Under the "space" profile every gap in an amount
 * is U+00A0, so the string offers Android no break opportunity; with no line
 * limit, a Net of -26500 XOF in its third of the stats row was observed on a
 * device as "-26 500 FCF" / "A". The fix is the single-line pattern already
 * used at ReportDonutChart.tsx:106-108 and SpendingBreakdown.tsx:69-71, so the
 * expected minimumFontScale is that pattern's 0.5.
 *
 * Rendered width cannot be measured under jest; what is asserted is that each
 * amount Text carries the props that make the platform shrink instead of wrap.
 *
 * Harness as in BalanceCard.percentSeparator.test.tsx: real useFormatting, real
 * bundle, profile set in settingsService.loadSettings. Expected strings are
 * written out from numberFormats.ts (space: group U+00A0, symbol after U+00A0,
 * written \xA0) and currencies.ts (XOF: symbol "FCFA", 0 decimals).
 */

jest.mock('../../../data/services/settingsService', () => {
    const actual = jest.requireActual('../../../data/services/settingsService');
    return { ...actual, loadSettings: jest.fn() };
});

const mockedLoadSettings = jest.requireMock('../../../data/services/settingsService')
    .loadSettings as jest.Mock;

const MASK = '\u2022'.repeat(6);

const TOTAL = '500\xA0000\xA0FCFA';
const INCOME = '100\xA0000\xA0FCFA';
const EXPENSE = '126\xA0500\xA0FCFA';
const NET = '-26\xA0500\xA0FCFA';

const renderCard = () =>
    render(
        <BalanceCard
            totalBalance={500000}
            monthlyIncome={100000}
            monthlyExpense={126500}
            netBalance={-26500}
            incomeChange={null}
            expenseChange={null}
            netBalanceChange={null}
        />,
    );

beforeAll(async () => {
    await i18n.changeLanguage('fr');
});

afterAll(async () => {
    await i18n.changeLanguage('en');
});

beforeEach(() => {
    jest.clearAllMocks();
    mockedLoadSettings.mockResolvedValue({
        ...getDefaultSettings(),
        currency: 'XOF',
        language: 'fr',
        decimalSeparator: 'space',
    });
});

describe('BalanceCard amount fit', () => {
    it.each([
        ['total balance', TOTAL],
        ['income', INCOME],
        ['expense', EXPENSE],
        ['net', NET],
    ])('renders the %s amount on one line, shrinking to fit', async (_label, text) => {
        renderCard();

        // The net string proves the XOF / space profile is loaded before any prop is read.
        expect(await screen.findByText(NET)).toBeTruthy();

        const amount = screen.getByText(text);
        expect(amount.props.numberOfLines).toBe(1);
        expect(amount.props.adjustsFontSizeToFit).toBe(true);
        expect(amount.props.minimumFontScale).toBe(0.5);
    });

    it('control: the hidden-amount mask still renders for all four amounts', async () => {
        renderCard();
        expect(await screen.findByText(NET)).toBeTruthy();

        // The eye toggle is the card's only touchable.
        fireEvent.press(screen.UNSAFE_getByType(TouchableOpacity));

        expect(screen.getAllByText(MASK)).toHaveLength(4);
        expect(screen.queryByText(NET)).toBeNull();
    });
});
