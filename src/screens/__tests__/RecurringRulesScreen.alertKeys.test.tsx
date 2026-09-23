/**
 * RecurringRulesScreen - the failure alert names the operation that failed
 *
 * Registry V-77. Both failure paths on this screen used to render
 * `error instanceof Error ? error.message : t('recurring.saveFailed')`. Because
 * RepositoryError extends Error, the ternary always took the message branch and
 * the fallback key was unreachable - which is how the delete path came to carry
 * the SAVE key without anyone noticing. Removing the message branch promoted
 * that key to the only string a user sees, so a failed deletion said "Failed to
 * save rule": the opposite of what the user had just done, and an invitation to
 * assume an edit had been lost.
 *
 * Two tests, not one. The first pins the delete path on its own key. The second
 * pins the pause path on the save key, so the first cannot be satisfied by
 * making every alert on this screen say the same generic thing - which is the
 * cheapest wrong way to make a mismatched-copy test pass.
 *
 * `t` is the identity here, so an assertion reads the KEY. A stub that returned
 * real copy would let a test pass on two different keys that happen to share a
 * translation, and the defect being pinned is precisely which key is chosen.
 */

import { act, fireEvent, render } from '@testing-library/react-native';
import React from 'react';
import { Alert } from 'react-native';

import { RecurrenceFrequency, TransactionType, type RecurringTransaction } from '../../domain/entities';
import { RecurringRulesScreen } from '../RecurringRulesScreen';

jest.mock('react-native-safe-area-context', () => ({
    useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.mock('expo-router', () => ({
    useRouter: () => ({ back: jest.fn(), push: jest.fn() }),
}));

jest.mock('react-i18next', () => ({
    useTranslation: () => ({ t: (key: string) => key }),
}));

const mockDeleteRule = jest.fn();
const mockPauseRule = jest.fn();
const mockResumeRule = jest.fn();

jest.mock('../../hooks/useRecurringRules', () => ({
    useRecurringRules: () => ({
        rules: mockRules,
        statuses: {},
        loading: false,
        createRule: jest.fn(),
        updateRule: jest.fn(),
        deleteRule: mockDeleteRule,
        pauseRule: mockPauseRule,
        resumeRule: mockResumeRule,
        refresh: jest.fn(),
    }),
}));

jest.mock('../../hooks/useFormatting', () => ({
    useFormatting: () => ({
        formatAmount: (v: number) => String(v),
        centsToMajor: (v: number) => v / 100,
        formatDate: (d: Date) => d.toISOString().slice(0, 10),
        parseAmountToCentsResult: (v: string) =>
            (v ? { ok: true, value: Number(v) } : { ok: false, cause: 'empty' }),
        amountPlaceholder: '0.00',
        decimals: 2,
    }),
}));

// The form is behind a closed Modal and drags in wallets, categories and the
// whole picker stack. Nothing here touches it.
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

const RULE: RecurringTransaction = {
    id: 'rule-1',
    type: TransactionType.EXPENSE,
    amount: 1200,
    walletId: 'wallet-1',
    categoryId: 'cat-1',
    startDate: new Date('2026-01-01'),
    frequency: RecurrenceFrequency.MONTHLY,
    interval: 1,
    lastGeneratedDate: new Date('2026-01-01'),
    isPaused: false,
    createdAt: new Date('2026-01-01'),
};

let mockRules: RecurringTransaction[] = [RULE];

/**
 * The button of the given style off the most recent Alert.alert call. The
 * delete flow asks for confirmation first, so the failure under test only
 * happens once the destructive button is actually invoked.
 */
function lastAlertButton(style: string) {
    const spy = Alert.alert as unknown as jest.Mock;
    const buttons = spy.mock.calls[spy.mock.calls.length - 1][2] as
        | { style?: string; onPress?: () => void | Promise<void> }[]
        | undefined;
    return buttons?.find(b => b.style === style);
}

/** Title and message of the most recent Alert.alert call. */
function lastAlertText(): [string, string] {
    const spy = Alert.alert as unknown as jest.Mock;
    const call = spy.mock.calls[spy.mock.calls.length - 1];
    return [call[0], call[1]];
}

describe('RecurringRulesScreen failure alerts', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockRules = [RULE];
        jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    it('names the DELETE operation when a delete fails', async () => {
        mockDeleteRule.mockRejectedValue(new Error('rule row already gone'));

        const { getByLabelText } = render(<RecurringRulesScreen />);

        fireEvent.press(getByLabelText('a11y.deleteRule'));

        // The confirmation dialog, not the failure: nothing has been attempted.
        expect(mockDeleteRule).not.toHaveBeenCalled();

        await act(async () => {
            await lastAlertButton('destructive')?.onPress?.();
        });

        expect(mockDeleteRule).toHaveBeenCalledWith('rule-1');
        expect(lastAlertText()).toEqual(['common.error', 'recurring.deleteFailed']);
    });

    it('still names the SAVE operation when a pause fails', async () => {
        mockPauseRule.mockRejectedValue(new Error('rule row already gone'));

        const { getByLabelText } = render(<RecurringRulesScreen />);

        // Pause has no confirmation step, so this is the failure directly.
        await act(async () => {
            fireEvent.press(getByLabelText('a11y.pauseRule'));
        });

        expect(mockPauseRule).toHaveBeenCalledWith('rule-1');
        expect(lastAlertText()).toEqual(['common.error', 'recurring.saveFailed']);
    });
});
