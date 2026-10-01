/**
 * RecurringRulesScreen - the V-118 refusal is named
 *
 * REGISTRE V-118, Owner decision 3 of 01/10 (pass 71). An edit of a rule whose
 * wallet or category is missing that places the end before a debit still due,
 * or that reopens an ended rule with a debit still due, is refused; the screen
 * must say so, naming the rule, the missing reference and the dates.
 *
 * `t` echoes the key and its parameters, so an assertion reads both the key
 * chosen and what was passed to it. The form is replaced by a stub that hands
 * its onSubmit to the test, which is how an edit is submitted here.
 *
 * Zones: the dates are built with the local constructor and formatted with
 * local getters, so the suite holds in whatever zone the process runs in
 * (run under TZ=UTC, Africa/Lagos, America/New_York).
 */

import { act, fireEvent, render } from '@testing-library/react-native';
import React from 'react';
import { Alert } from 'react-native';

import { RecurrenceFrequency, TransactionType, type RecurringTransaction } from '../../domain/entities';
import { RecurringEndDateEditRefusedError } from '../../domain/useCases/errors';
import { RecurringRulesScreen } from '../RecurringRulesScreen';

jest.mock('react-native-safe-area-context', () => ({
    useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.mock('expo-router', () => ({
    useRouter: () => ({ back: jest.fn(), push: jest.fn() }),
}));

jest.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string, params?: Record<string, unknown>) =>
            params === undefined ? key : `${key} ${JSON.stringify(params)}`,
    }),
}));

const mockUpdateRule = jest.fn();

jest.mock('../../hooks/useRecurringRules', () => ({
    useRecurringRules: () => ({
        rules: mockRules,
        statuses: {},
        loading: false,
        createRule: jest.fn(),
        updateRule: mockUpdateRule,
        deleteRule: jest.fn(),
        pauseRule: jest.fn(),
        resumeRule: jest.fn(),
        refresh: jest.fn(),
    }),
}));

jest.mock('../../hooks/useFormatting', () => {
    const pad = (n: number) => String(n).padStart(2, '0');
    return {
        useFormatting: () => ({
            formatAmount: (v: number) => `amt:${v}`,
            centsToMajor: (v: number) => v / 100,
            formatDate: (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
            parseAmountToCentsResult: (v: string) =>
                (v ? { ok: true, value: Number(v) } : { ok: false, cause: 'empty' }),
            amountPlaceholder: '0.00',
            decimals: 2,
        }),
    };
});

/** The props the screen last rendered the form with. */
let mockFormProps: { onSubmit: (dto: unknown) => Promise<void> } | null = null;

jest.mock('../../components/recurring/RecurringRuleForm', () => ({
    RecurringRuleForm: (props: { onSubmit: (dto: unknown) => Promise<void> }) => {
        mockFormProps = props;
        return null;
    },
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
    amount: 1000,
    walletId: 'wallet-gone',
    categoryId: 'cat-1',
    description: 'Rent',
    startDate: new Date(2026, 8, 15, 12, 0),
    frequency: RecurrenceFrequency.MONTHLY,
    interval: 1,
    lastGeneratedDate: new Date(2026, 8, 15),
    lastGeneratedIndex: 0,
    scheduleVersion: 0,
    isPaused: false,
    createdAt: new Date(2026, 8, 15, 12, 0),
};

let mockRules: RecurringTransaction[] = [RULE];

/** Title and message of the most recent Alert.alert call, or null when none. */
function lastAlert(): [string, string] | null {
    const spy = Alert.alert as unknown as jest.Mock;
    const call = spy.mock.calls[spy.mock.calls.length - 1];
    return call ? [call[0], call[1]] : null;
}

/** Open the edit form for RULE and submit `dto` through it. */
async function submitEdit(dto: unknown): Promise<unknown> {
    const screen = render(<RecurringRulesScreen />);
    fireEvent.press(screen.getByLabelText('a11y.editRule'));
    expect(mockFormProps).not.toBeNull();
    let rejection: unknown;
    await act(async () => {
        await mockFormProps!.onSubmit(dto).catch((error: unknown) => {
            rejection = error;
        });
    });
    return rejection;
}

describe('RecurringRulesScreen V-118 messages', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockRules = [RULE];
        mockFormProps = null;
        jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    it('V-118 b. the screen names the refusal of an end set before a pending debit: rule, missing wallet and date', async () => {
        mockUpdateRule.mockRejectedValue(
            new RecurringEndDateEditRefusedError(['wallet'], [new Date(2026, 9, 15)]),
        );

        const rejection = await submitEdit({ id: 'rule-1', walletId: 'wallet-2', endDate: new Date(2026, 9, 10) });

        expect(rejection).toBeUndefined();
        expect(lastAlert()).toEqual([
            'recurring.editRefusedTitle',
            'recurring.editRefusedEndDateMissingWallet ' + JSON.stringify({ name: 'Rent', dates: '2026-10-15' }),
        ]);
    });

    it('V-118 b. the screen names the missing category with its own message', async () => {
        mockUpdateRule.mockRejectedValue(
            new RecurringEndDateEditRefusedError(['category'], [new Date(2026, 9, 15)]),
        );

        const rejection = await submitEdit({ id: 'rule-1', endDate: new Date(2026, 9, 10) });

        expect(rejection).toBeUndefined();
        expect(lastAlert()).toEqual([
            'recurring.editRefusedTitle',
            'recurring.editRefusedEndDateMissingCategory ' + JSON.stringify({ name: 'Rent', dates: '2026-10-15' }),
        ]);
    });

    it('V-118 c. the screen names both missing references and every pending date when a reopen is refused', async () => {
        mockUpdateRule.mockRejectedValue(
            new RecurringEndDateEditRefusedError(['wallet', 'category'], [new Date(2026, 8, 15), new Date(2026, 9, 15)]),
        );

        const rejection = await submitEdit({ id: 'rule-1', endDate: null });

        expect(rejection).toBeUndefined();
        expect(lastAlert()).toEqual([
            'recurring.editRefusedTitle',
            'recurring.editRefusedEndDateMissingWalletAndCategory ' +
                JSON.stringify({ name: 'Rent', dates: '2026-09-15, 2026-10-15' }),
        ]);
    });
});
