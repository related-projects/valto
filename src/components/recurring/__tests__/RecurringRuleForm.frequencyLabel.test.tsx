/**
 * V-70, call site A - the live label under the interval input.
 *
 * RecurringRuleForm computes its hint from the text input directly, on every
 * keystroke, so this is the phrase a user watches while typing an interval. It
 * used to read "Tous les 2 moiss" in French and "Kazhdye 5 mesyats" in Russian.
 *
 * The real locale bundle and the real formatter run here. A key -> key
 * translation mock - which the alert-key suite for this feature uses on purpose -
 * would drop the interpolation that carries the whole defect.
 *
 * The first import removes Intl.PluralRules, so the rendered phrase is the one a
 * Hermes device produces (V-43), not the one Node's full ICU would allow.
 */

import '../../../../tests/helpers/withoutIntlPluralRules';

import { fireEvent, render } from '@testing-library/react-native';
import React from 'react';

import { D6_PHRASES } from '../../../../tests/helpers/d6FrequencyPhrases';
import i18n from '../../../localization/i18n';
import { RecurringRuleForm } from '../RecurringRuleForm';

jest.mock('react-native-safe-area-context', () => ({
    useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

// The form reads both lists only to fill its pickers. Nothing here opens one.
jest.mock('../../../hooks/useWallets', () => ({
    useWallets: () => ({ wallets: [] }),
}));

jest.mock('../../../hooks/useCategories', () => ({
    useCategories: () => ({ categories: [] }),
}));

jest.mock('../../../hooks/useFormatting', () => ({
    useFormatting: () => ({
        formatAmount: (v: number) => String(v),
        formatDate: (d: Date) => d.toISOString().slice(0, 10),
        centsToMajor: (v: number) => v / 100,
        parseAmountToCentsResult: (v: string) =>
            (v ? { ok: true, value: Number(v) } : { ok: false, cause: 'empty' }),
        amountPlaceholder: '0.00',
        decimals: 2,
    }),
}));

/**
 * The interval input is the only field seeded with a value ("1"); amount and
 * description both start empty, so this query cannot match another field.
 */
const intervalInput = (queries: { getByDisplayValue: (v: string) => unknown }) =>
    queries.getByDisplayValue('1');

const renderForm = () =>
    render(<RecurringRuleForm onSubmit={jest.fn()} onCancel={jest.fn()} />);

afterAll(async () => {
    await i18n.changeLanguage('en');
});

describe('RecurringRuleForm - the frequency hint agrees with the interval', () => {
    // The form opens on MONTHLY, the unit whose Latin plural was wrong in all
    // three of fr, es and pt.
    it('fr renders the D6 phrase for 2 months', async () => {
        await i18n.changeLanguage('fr');
        const queries = renderForm();

        fireEvent.changeText(intervalInput(queries) as never, '2');

        expect(queries.getByText(D6_PHRASES.fr.month[2])).toBeTruthy();
    });

    it('ru renders the D6 phrase for 5 months', async () => {
        await i18n.changeLanguage('ru');
        const queries = renderForm();

        fireEvent.changeText(intervalInput(queries) as never, '5');

        expect(queries.getByText(D6_PHRASES.ru.month[5])).toBeTruthy();
    });
});
