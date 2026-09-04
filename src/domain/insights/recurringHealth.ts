/**
 * Recurring Health Evaluator
 *
 * Pure domain function that answers one question for the dashboard: is any
 * standing order meant to be running and not running.
 *
 * Faults only. A paused rule is the user's own intent and an expired rule
 * reached the end it was given; putting either behind a warning would teach the
 * user to ignore the banner on the day it matters.
 *
 * One banner whatever the count, and no count in it. It says the rules screen is
 * where to look, and the per-rule status there says which rule and why. Carrying
 * a number here would mean either a plural form the runtime cannot produce or a
 * second figure to keep in step with the screen.
 */

import { RecurringRuleStatus, isFaultStatus } from '../recurring';

export interface RecurringHealthResult {
    /** i18n translation key */
    messageKey: string;
    /** Interpolation params for the translation key. Deliberately empty. */
    messageParams: Record<string, string | number>;
}

/**
 * Evaluate whether the recurring rules need the user's attention.
 *
 * @param statuses One status per rule, as derived by deriveRecurringRuleStatus.
 * @returns The banner content, or null when nothing needs saying.
 */
export function evaluateRecurringHealth(
    statuses: readonly RecurringRuleStatus[],
): RecurringHealthResult | null {
    if (!statuses.some(isFaultStatus)) return null;

    return {
        messageKey: 'insights.recurringRulesNotRunning',
        messageParams: {},
    };
}
