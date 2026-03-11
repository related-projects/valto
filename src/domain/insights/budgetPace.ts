/**
 * Budget Pace Evaluator
 *
 * Pure domain function that checks whether spending is on track
 * relative to a linear budget pace through the month.
 */

export interface BudgetPaceResult {
    /** The amount you "should" have spent by now, based on linear pace */
    expectedSpentByNow: number;
    /** True if actual spending exceeds the expected pace */
    overBudgetPace: boolean;
    /** i18n translation key */
    messageKey: string;
    /** Interpolation params for the translation key */
    messageParams: Record<string, string | number>;
}

/**
 * Evaluate whether current spending is ahead or behind the expected
 * linear budget pace.
 *
 * @param spent        Amount already spent (minor units)
 * @param budgetLimit  Total budget for the period (minor units)
 * @param daysElapsed  Number of days elapsed in the period (≥ 0)
 * @param totalDays    Total days in the period (> 0)
 */
export function evaluateBudgetPace(
    spent: number,
    budgetLimit: number,
    daysElapsed: number,
    totalDays: number,
): BudgetPaceResult {
    if (totalDays <= 0) {
        return {
            expectedSpentByNow: 0,
            overBudgetPace: spent > 0,
            messageKey: 'insights.invalidBudgetPeriod',
            messageParams: {},
        };
    }

    if (budgetLimit <= 0) {
        return {
            expectedSpentByNow: 0,
            overBudgetPace: spent > 0,
            messageKey: spent > 0
                ? 'insights.noBudgetWithSpending'
                : 'insights.noBudgetSet',
            messageParams: {},
        };
    }

    const expectedSpentByNow = (daysElapsed / totalDays) * budgetLimit;
    const overBudgetPace = spent > expectedSpentByNow;

    if (overBudgetPace) {
        const overBy = spent - expectedSpentByNow;
        const overPct = ((overBy / expectedSpentByNow) * 100) || 0;
        return {
            expectedSpentByNow,
            overBudgetPace: true,
            messageKey: 'insights.spendingAhead',
            messageParams: { percent: overPct.toFixed(0) },
        };
    }

    return {
        expectedSpentByNow,
        overBudgetPace: false,
        messageKey: 'insights.spendingOnTrack',
        messageParams: {},
    };
}
