import { render, screen } from '@testing-library/react-native';
import React from 'react';

import { getDefaultSettings } from '../../../data/services/settingsService';
import i18n from '../../../localization/i18n';
import { FinancialSummary } from '../FinancialSummary';

/**
 * FinancialSummary - the savings rate follows the user's decimal character
 *
 * Registry V-95. The amounts on this card follow the stored number-format
 * profile; the savings rate was written with toFixed, which always prints a
 * dot. Under the comma profile the card read "2.000,00 $" above "12.5%".
 *
 * Same harness as FinancialSummary.test.tsx: the REAL useFormatting and the REAL
 * bundle, with the profile set one level down, in settingsService.loadSettings.
 * English on purpose: the profile decides, not the language (D1).
 *
 * Every expected string is written out from numberFormats.ts, never read from
 * it: a test that reads the table it checks asserts against its own copy.
 *   comma: group ".", decimal ",", symbol after a no-break space (U+00A0)
 *   space: group U+00A0, decimal ",", symbol after U+00A0
 * U+00A0 is written \xA0 to keep this file ASCII.
 */

jest.mock('../../../data/services/settingsService', () => {
    const actual = jest.requireActual('../../../data/services/settingsService');
    return { ...actual, loadSettings: jest.fn() };
});

const mockedLoadSettings = jest.requireMock('../../../data/services/settingsService')
    .loadSettings as jest.Mock;

const withProfile = (decimalSeparator: 'comma' | 'space') => {
    mockedLoadSettings.mockResolvedValue({
        ...getDefaultSettings(),
        currency: 'USD',
        language: 'en',
        decimalSeparator,
    });
};

const POPULATED = {
    totalIncome: 200000,
    totalExpense: 175000,
    netBalance: 25000,
    savingsRate: 12.5,
    hasActivity: true,
};

beforeAll(async () => {
    await i18n.changeLanguage('en');
});

beforeEach(() => {
    jest.clearAllMocks();
});

describe('FinancialSummary savings rate separator', () => {
    it('writes the savings rate with a comma under the comma profile', async () => {
        withProfile('comma');
        render(<FinancialSummary {...POPULATED} />);

        // The income amount proves the comma profile is loaded before the rate is read.
        expect(await screen.findByText('2.000,00\xA0$')).toBeTruthy();
        expect(screen.getByText('12,5%')).toBeTruthy();
    });

    it('writes the savings rate with a comma under the space profile', async () => {
        withProfile('space');
        render(<FinancialSummary {...POPULATED} />);

        expect(await screen.findByText('2\xA0000,00\xA0$')).toBeTruthy();
        expect(screen.getByText('12,5%')).toBeTruthy();
    });
});
