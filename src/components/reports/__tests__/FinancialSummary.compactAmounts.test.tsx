/**
 * FinancialSummary - large amounts are compact, labelled exact (V-128, pass 89)
 *
 * Income, expense and net are tight places (pass 87 inventory): from 1 000 000
 * major units they are shown compact, each with the exact formatAmount output as
 * its accessibilityLabel. The savings rate is a percentage and out of scope.
 *
 * Real useFormatting with settingsService.loadSettings mocked one level below it.
 * XOF: 0 decimals, symbol "FCFA"; space profile: group U+00A0, decimal comma,
 * symbol after U+00A0. Language fr: M, Md, Bn after U+00A0.
 */

import { render, screen } from '@testing-library/react-native';
import React from 'react';

import { getDefaultSettings } from '../../../data/services/settingsService';
import i18n from '../../../localization/i18n';
import { FinancialSummary } from '../FinancialSummary';

jest.mock('../../../data/services/settingsService', () => {
    const actual = jest.requireActual('../../../data/services/settingsService');
    return { ...actual, loadSettings: jest.fn() };
});

const mockedLoadSettings = jest.requireMock('../../../data/services/settingsService')
    .loadSettings as jest.Mock;

const NBSP = '\u00A0';

const INCOME_COMPACT = `2,5${NBSP}Md${NBSP}FCFA`;
const INCOME_EXACT = `2${NBSP}500${NBSP}000${NBSP}000${NBSP}FCFA`;
const EXPENSE_EXACT = `999${NBSP}999${NBSP}FCFA`;
const NET_COMPACT = `2,4${NBSP}Md${NBSP}FCFA`;
const NET_EXACT = `2${NBSP}499${NBSP}000${NBSP}001${NBSP}FCFA`;

const renderSummary = () =>
    render(
        <FinancialSummary
            totalIncome={2_500_000_000}
            totalExpense={999_999}
            netBalance={2_499_000_001}
            savingsRate={99.9}
            hasActivity
        />,
    );

/** The expense is below 1 000 000, so its exact string proves the XOF / space settings are loaded. */
const settingsLoaded = () => screen.findByText(EXPENSE_EXACT);

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

describe('FinancialSummary - compact large amounts', () => {
    it.each([
        ['income', INCOME_COMPACT, INCOME_EXACT],
        ['net balance', NET_COMPACT, NET_EXACT],
    ])('shows the %s compact with the exact amount as its label', async (_label, compact, exact) => {
        renderSummary();
        await settingsLoaded();

        const node = screen.getByText(compact);
        expect(node.props.children).toBe(compact);
        expect(node.props.accessibilityLabel).toBe(exact);
    });

    it('shows an expense below 1 000 000 exact, labelled exact', async () => {
        renderSummary();
        const node = await settingsLoaded();

        expect(node.props.children).toBe(EXPENSE_EXACT);
        expect(node.props.accessibilityLabel).toBe(EXPENSE_EXACT);
    });
});
