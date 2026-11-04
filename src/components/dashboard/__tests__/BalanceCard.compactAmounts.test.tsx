import { fireEvent, render, screen } from '@testing-library/react-native';
import React from 'react';
import { TouchableOpacity } from 'react-native';

import { getDefaultSettings } from '../../../data/services/settingsService';
import i18n from '../../../localization/i18n';
import { BalanceCard } from '../BalanceCard';

/**
 * BalanceCard - large amounts are compact, TalkBack reads them exact (V-128, pass 89)
 *
 * Owner decision 2, option A: from 1 000 000 major units the card's four amounts
 * are shown compact (truncated toward zero, CLDR short suffix of the language);
 * below that they are exact. Every amount carries an accessibilityLabel with the
 * exact formatAmount output - except while the balance is hidden, where nothing
 * may reveal it.
 *
 * Harness as in BalanceCard.amountFit.test.tsx: real useFormatting, real bundle,
 * profile set in settingsService.loadSettings. XOF has 0 decimals and the symbol
 * "FCFA"; space profile: group U+00A0, decimal comma, symbol after U+00A0.
 * Text is compared through props.children so U+00A0 is not normalised away.
 */

jest.mock('../../../data/services/settingsService', () => {
    const actual = jest.requireActual('../../../data/services/settingsService');
    return { ...actual, loadSettings: jest.fn() };
});

const mockedLoadSettings = jest.requireMock('../../../data/services/settingsService')
    .loadSettings as jest.Mock;

const NBSP = '\u00A0';
const MASK = '\u2022'.repeat(6);

const TOTAL = 1_999_999;
const INCOME = 2_500_000_000;
const EXPENSE = 999_999;
const NET = -1_234_567;

const COMPACT = {
    total: `1,9${NBSP}M${NBSP}FCFA`,
    income: `2,5${NBSP}Md${NBSP}FCFA`,
    net: `-1,2${NBSP}M${NBSP}FCFA`,
};

const EXACT = {
    total: `1${NBSP}999${NBSP}999${NBSP}FCFA`,
    income: `2${NBSP}500${NBSP}000${NBSP}000${NBSP}FCFA`,
    expense: `999${NBSP}999${NBSP}FCFA`,
    net: `-1${NBSP}234${NBSP}567${NBSP}FCFA`,
};

const renderCard = () =>
    render(
        <BalanceCard
            totalBalance={TOTAL}
            monthlyIncome={INCOME}
            monthlyExpense={EXPENSE}
            netBalance={NET}
            incomeChange={null}
            expenseChange={null}
            netBalanceChange={null}
        />,
    );

/** The expense is below 1 000 000, so its exact string proves the XOF / space settings are loaded. */
const settingsLoaded = () => screen.findByText(EXACT.expense);

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

describe('BalanceCard - compact large amounts', () => {
    it.each([
        ['total balance', COMPACT.total, EXACT.total],
        ['income', COMPACT.income, EXACT.income],
        ['net', COMPACT.net, EXACT.net],
    ])('shows the %s compact with the exact amount as its label', async (_label, compact, exact) => {
        renderCard();
        await settingsLoaded();

        const node = screen.getByText(compact);
        expect(node.props.children).toBe(compact);
        expect(node.props.accessibilityLabel).toBe(exact);
    });

    it('shows an amount below 1 000 000 exact, labelled exact', async () => {
        renderCard();
        const node = await settingsLoaded();

        expect(node.props.children).toBe(EXACT.expense);
        expect(node.props.accessibilityLabel).toBe(EXACT.expense);
    });

    it('keeps the one-line shrink-to-fit props on a compact amount (pass 77)', async () => {
        renderCard();
        await settingsLoaded();

        const node = screen.getByText(COMPACT.total);
        expect(node.props.numberOfLines).toBe(1);
        expect(node.props.adjustsFontSizeToFit).toBe(true);
        expect(node.props.minimumFontScale).toBe(0.5);
    });

    it('control: hidden balance shows the mask and no label reveals an amount', async () => {
        renderCard();
        await settingsLoaded();

        // The eye toggle is the card's only touchable.
        fireEvent.press(screen.UNSAFE_getByType(TouchableOpacity));

        const masks = screen.getAllByText(MASK);
        expect(masks).toHaveLength(4);
        for (const mask of masks) {
            expect(mask.props.accessibilityLabel).toBeUndefined();
        }
        for (const exact of Object.values(EXACT)) {
            expect(screen.queryByLabelText(exact)).toBeNull();
            expect(screen.queryByText(exact)).toBeNull();
        }
    });
});
