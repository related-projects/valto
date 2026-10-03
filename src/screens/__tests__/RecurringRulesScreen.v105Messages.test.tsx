/**
 * RecurringRulesScreen - the V-105 refusals and the unrecorded debits are named
 *
 * REGISTRE V-105, Owner decisions 2, 5 and 8 of 01/10. An edit refused because
 * the debits due before it could not be recorded, an edit refused because the
 * rule's wallet or category is missing, and a pause that left debits
 * unrecorded must each tell the user what happened, naming the rule and, where
 * there are any, the dates.
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
import {
    RecurringCatchUpRefusedError,
    RecurringRuleReferenceMissingError,
} from '../../domain/useCases/errors';
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
const mockPauseRule = jest.fn();

jest.mock('../../hooks/useRecurringRules', () => ({
    useRecurringRules: () => ({
        rules: mockRules,
        statuses: {},
        loading: false,
        createRule: jest.fn(),
        updateRule: mockUpdateRule,
        deleteRule: jest.fn(),
        pauseRule: mockPauseRule,
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
    walletId: 'wallet-1',
    categoryId: 'cat-1',
    description: 'Rent',
    startDate: new Date(2026, 0, 15, 12, 0),
    frequency: RecurrenceFrequency.MONTHLY,
    interval: 1,
    lastGeneratedDate: new Date(2026, 8, 15),
    lastGeneratedIndex: 8,
    scheduleVersion: 0,
    isPaused: false,
    createdAt: new Date(2026, 0, 15, 12, 0),
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

describe('RecurringRulesScreen V-105 messages', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockRules = [RULE];
        mockFormProps = null;
        jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    it('f. the screen names the funds refusal of an edit: rule, dates, amount needed and amount available', async () => {
        mockUpdateRule.mockRejectedValue(
            new RecurringCatchUpRefusedError([new Date(2026, 9, 15)], 1000, 500),
        );

        const rejection = await submitEdit({ id: 'rule-1', interval: 2 });

        expect(rejection).toBeUndefined();
        expect(lastAlert()).toEqual([
            'recurring.editRefusedTitle',
            'recurring.editRefusedFundsMessage ' +
                JSON.stringify({ name: 'Rent', dates: '2026-10-15', needed: 'amt:1000', available: 'amt:500' }),
        ]);
    });

    it('o. the screen names the missing wallet when a schedule edit is refused for it', async () => {
        mockUpdateRule.mockRejectedValue(new RecurringRuleReferenceMissingError(['wallet']));

        const rejection = await submitEdit({ id: 'rule-1', walletId: 'wallet-2', interval: 2 });

        expect(rejection).toBeUndefined();
        expect(lastAlert()).toEqual([
            'recurring.editRefusedTitle',
            'recurring.editRefusedMissingWallet ' + JSON.stringify({ name: 'Rent' }),
        ]);
    });

    it('j. the screen names the debits a pause left unrecorded: rule and dates', async () => {
        mockPauseRule.mockResolvedValue({
            rule: { ...RULE, isPaused: true },
            unrecorded: [new Date(2026, 9, 15)],
        });

        const screen = render(<RecurringRulesScreen />);
        await act(async () => {
            fireEvent.press(screen.getByLabelText('a11y.pauseRule'));
        });

        expect(mockPauseRule).toHaveBeenCalledWith('rule-1');
        expect(lastAlert()).toEqual([
            'recurring.pausedUnrecordedTitle',
            'recurring.pausedUnrecordedMessage ' + JSON.stringify({ name: 'Rent', dates: '2026-10-15' }),
        ]);
    });

    it('control: a pause that recorded everything shows no alert', async () => {
        mockPauseRule.mockResolvedValue({ rule: { ...RULE, isPaused: true }, unrecorded: [] });

        const screen = render(<RecurringRulesScreen />);
        await act(async () => {
            fireEvent.press(screen.getByLabelText('a11y.pauseRule'));
        });

        expect(mockPauseRule).toHaveBeenCalledWith('rule-1');
        expect(lastAlert()).toBeNull();
    });

    it('control: any other edit failure still reaches the form, which shows its own save-failed alert', async () => {
        const failure = new Error('disk full');
        mockUpdateRule.mockRejectedValue(failure);

        const rejection = await submitEdit({ id: 'rule-1', amount: 2500 });

        expect(rejection).toBe(failure);
        expect(lastAlert()).toBeNull();
    });
});
