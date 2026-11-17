/**
 * RecurringRulesScreen - the add controls and the rule rows have stable
 * testIDs (pass 94, item 2)
 *
 * The screen had no testID: back, the add button, the empty-state call to
 * action, and on each rule card the card itself and its edit, pause/resume and
 * delete buttons. Each now carries one; the row ids carry the rule id. The
 * buttons are icon-only, so each test checks the id sits on the control with
 * the expected accessibility label, which existed before this pass.
 *
 * Harness as in RecurringRulesScreen.alertKeys.test.tsx (t is the identity).
 */

import { fireEvent, render, within } from '@testing-library/react-native';
import React from 'react';

import { RecurrenceFrequency, TransactionType, type RecurringTransaction } from '../../domain/entities';
import { RecurringRulesScreen } from '../RecurringRulesScreen';

jest.mock('react-native-safe-area-context', () => ({
    useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

const mockBack = jest.fn();

jest.mock('expo-router', () => ({
    useRouter: () => ({ back: mockBack, push: jest.fn() }),
}));

jest.mock('react-i18next', () => ({
    useTranslation: () => ({ t: (key: string) => key }),
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
        formatAmountCompactLarge: (v: number) => String(v),
        centsToMajor: (v: number) => v / 100,
        formatDate: (d: Date) => d.toISOString().slice(0, 10),
        parseAmountToCentsResult: (v: string) =>
            (v ? { ok: true, value: Number(v) } : { ok: false, cause: 'empty' }),
        amountPlaceholder: '0.00',
        decimals: 2,
    }),
}));

// The form is behind a closed Modal and carries its own testID suite.
jest.mock('../../components/recurring/RecurringRuleForm', () => ({
    RecurringRuleForm: () => null,
}));

jest.mock('../../data/services/RecurringTransactionEngine', () => ({
    processRecurringRules: jest.fn().mockResolvedValue({
        rulesEvaluated: 0,
        transactionsGenerated: 0,
        skipped: [],
        errors: [],
    }),
}));

const RULE: RecurringTransaction = {
    id: 'rule-1',
    type: TransactionType.EXPENSE,
    amount: 1200,
    walletId: 'wallet-1',
    categoryId: 'cat-1',
    description: 'Synthetic rent',
    startDate: new Date('2026-01-01'),
    frequency: RecurrenceFrequency.MONTHLY,
    interval: 1,
    lastGeneratedDate: new Date('2026-01-01'),
    isPaused: false,
    createdAt: new Date('2026-01-01'),
};

let mockRules: RecurringTransaction[] = [RULE];

beforeEach(() => {
    jest.clearAllMocks();
    mockRules = [RULE];
});

describe('pass 94 item 2. RecurringRulesScreen testIDs', () => {
    it('pass 94 item 2. the rule card carries the rule id and holds its description', () => {
        const { getByTestId } = render(<RecurringRulesScreen />);

        expect(within(getByTestId(`recurring_rule_${RULE.id}`)).getByText('Synthetic rent')).toBeTruthy();
    });

    it.each([
        [`recurring_rule_edit_${RULE.id}`, 'a11y.editRule'],
        [`recurring_rule_toggle_pause_${RULE.id}`, 'a11y.pauseRule'],
        [`recurring_rule_delete_${RULE.id}`, 'a11y.deleteRule'],
        ['recurring_add_button', 'a11y.addRecurringRule'],
        ['recurring_back_button', 'a11y.backButton'],
    ])('pass 94 item 2. %s is the control labelled %s', (id, label) => {
        const { getByTestId } = render(<RecurringRulesScreen />);

        expect(getByTestId(id).props.accessibilityLabel).toBe(label);
    });

    it('pass 94 item 2. the row action ids sit inside their rule card', () => {
        const { getByTestId } = render(<RecurringRulesScreen />);

        const card = getByTestId(`recurring_rule_${RULE.id}`);
        expect(within(card).getByTestId(`recurring_rule_edit_${RULE.id}`)).toBeTruthy();
        expect(within(card).getByTestId(`recurring_rule_toggle_pause_${RULE.id}`)).toBeTruthy();
        expect(within(card).getByTestId(`recurring_rule_delete_${RULE.id}`)).toBeTruthy();
    });

    it('pass 94 item 2. recurring_back_button goes back', () => {
        const { getByTestId } = render(<RecurringRulesScreen />);

        fireEvent.press(getByTestId('recurring_back_button'));

        expect(mockBack).toHaveBeenCalledTimes(1);
    });

    it('pass 94 item 2. with no rule, recurring_empty_create_button is the empty-state button', () => {
        mockRules = [];
        const { getByTestId } = render(<RecurringRulesScreen />);

        expect(within(getByTestId('recurring_empty_create_button')).getByText('recurring.createRule')).toBeTruthy();
    });
});
