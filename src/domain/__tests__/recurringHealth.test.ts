/**
 * Recurring Health Insight Tests
 *
 * The dashboard banner that tells the user some standing orders are not
 * running. It appears for faults only: a paused rule is intent and an expired
 * one reached the end it was given, and presenting either as a problem would
 * teach the user to ignore the banner that matters.
 */

import { RecurringRuleStatus } from '../recurring';
import { evaluateRecurringHealth } from '../insights';

describe('evaluateRecurringHealth', () => {
    it('returns a banner when a rule points at a missing reference', () => {
        const result = evaluateRecurringHealth([
            RecurringRuleStatus.ACTIVE,
            RecurringRuleStatus.MISSING_REFERENCE,
        ]);

        expect(result).not.toBeNull();
        expect(result!.messageKey).toBe('insights.recurringRulesNotRunning');
    });

    it('returns a banner when a rule cannot be paid for', () => {
        const result = evaluateRecurringHealth([RecurringRuleStatus.INSUFFICIENT_FUNDS]);

        expect(result).not.toBeNull();
        expect(result!.messageKey).toBe('insights.recurringRulesNotRunning');
    });

    it('returns one banner however many rules are at fault', () => {
        const many = evaluateRecurringHealth([
            RecurringRuleStatus.MISSING_REFERENCE,
            RecurringRuleStatus.MISSING_REFERENCE,
            RecurringRuleStatus.INSUFFICIENT_FUNDS,
        ]);
        const one = evaluateRecurringHealth([RecurringRuleStatus.MISSING_REFERENCE]);

        expect(many).toEqual(one);
    });

    it('carries no count and no identifier', () => {
        const result = evaluateRecurringHealth([
            RecurringRuleStatus.MISSING_REFERENCE,
            RecurringRuleStatus.INSUFFICIENT_FUNDS,
        ]);

        expect(result!.messageParams).toEqual({});
    });

    it('stays silent when the only non-active rules are paused', () => {
        expect(
            evaluateRecurringHealth([RecurringRuleStatus.ACTIVE, RecurringRuleStatus.PAUSED]),
        ).toBeNull();
    });

    it('stays silent when the only non-active rules are expired', () => {
        expect(
            evaluateRecurringHealth([RecurringRuleStatus.ACTIVE, RecurringRuleStatus.EXPIRED]),
        ).toBeNull();
    });

    it('stays silent when rules are paused and expired together', () => {
        expect(
            evaluateRecurringHealth([
                RecurringRuleStatus.PAUSED,
                RecurringRuleStatus.EXPIRED,
                RecurringRuleStatus.PAUSED,
            ]),
        ).toBeNull();
    });

    it('stays silent when there are no rules at all', () => {
        expect(evaluateRecurringHealth([])).toBeNull();
    });
});
