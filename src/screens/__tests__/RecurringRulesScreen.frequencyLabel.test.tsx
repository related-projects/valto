/**
 * V-70, call site B - the details line of a rule card.
 *
 * This is the persisted phrase: every saved rule with an interval above 1 shows
 * it in the list. The validator guarantees interval >= 1 here, so unlike the
 * form's live label this site only ever renders real intervals.
 *
 * Both cases are weekly on purpose. "semaine" and "nedelya" are feminine, and
 * they are the two cells where the LEADING word has to agree as well as the noun:
 * French needs "Toutes les" rather than "Tous les", and Russian at 21 needs the
 * feminine accusative singular "Kazhduyu ... nedelyu" where day, month and year
 * take the masculine "Kazhdyy".
 *
 * The real locale bundle and the real formatter run here; the alert-key suite for
 * this screen mocks `t` to the identity, which cannot see interpolated output.
 * The first import removes Intl.PluralRules, so this is the device condition.
 */

import '../../../tests/helpers/withoutIntlPluralRules';

import { render } from '@testing-library/react-native';
import React from 'react';

import { D6_PHRASES } from '../../../tests/helpers/d6FrequencyPhrases';
import { RecurrenceFrequency, TransactionType, type RecurringTransaction } from '../../domain/entities';
import i18n from '../../localization/i18n';
import { RecurringRulesScreen } from '../RecurringRulesScreen';

jest.mock('react-native-safe-area-context', () => ({
    useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.mock('expo-router', () => ({
    useRouter: () => ({ back: jest.fn(), push: jest.fn() }),
}));

jest.mock('../../hooks/useRecurringRules', () => ({
    useRecurringRules: () => ({
        rules: mockRules,
        statuses: {},
        loading: false,
        createRule: jest.fn(),
        updateRule: jest.fn(),
        deleteRule: jest.fn(),
        pauseRule: jest.fn(),
        resumeRule: jest.fn(),
        refresh: jest.fn(),
    }),
}));

jest.mock('../../hooks/useFormatting', () => ({
    useFormatting: () => ({
        formatAmount: (v: number) => String(v),
        centsToMajor: (v: number) => v / 100,
        parseAmountToCents: (v: string) => (v ? Number(v) : null),
        decimals: 2,
    }),
}));

// The form is behind a closed Modal and drags in the whole picker stack. Its own
// rendering of this phrase is covered by RecurringRuleForm.frequencyLabel.test.
jest.mock('../../components/recurring/RecurringRuleForm', () => ({
    RecurringRuleForm: () => null,
}));

// Rule creation runs the engine. Nothing here creates a rule.
jest.mock('../../data/services/RecurringTransactionEngine', () => ({
    processRecurringRules: jest.fn().mockResolvedValue({
        rulesEvaluated: 0,
        transactionsGenerated: 0,
        skipped: [],
        errors: [],
    }),
}));

const weeklyRule = (interval: number): RecurringTransaction => ({
    id: 'rule-1',
    type: TransactionType.EXPENSE,
    amount: 1200,
    walletId: 'wallet-1',
    categoryId: 'cat-1',
    startDate: new Date('2026-01-01'),
    frequency: RecurrenceFrequency.WEEKLY,
    interval,
    lastGeneratedDate: new Date('2026-01-01'),
    isPaused: false,
    createdAt: new Date('2026-01-01'),
});

let mockRules: RecurringTransaction[] = [weeklyRule(2)];

afterAll(async () => {
    await i18n.changeLanguage('en');
});

describe('RecurringRulesScreen - the rule card states its frequency', () => {
    it('fr renders the D6 phrase for 2 weeks, with the feminine leading word', async () => {
        mockRules = [weeklyRule(2)];
        await i18n.changeLanguage('fr');

        const { getByText } = render(<RecurringRulesScreen />);

        expect(getByText(D6_PHRASES.fr.week[2])).toBeTruthy();
    });

    it('ru renders the D6 phrase for 21 weeks, where 21 takes the singular', async () => {
        mockRules = [weeklyRule(21)];
        await i18n.changeLanguage('ru');

        const { getByText } = render(<RecurringRulesScreen />);

        expect(getByText(D6_PHRASES.ru.week[21])).toBeTruthy();
    });
});
