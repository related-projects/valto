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
    /** Human-readable insight message (English fallback) */
    message: string;
    /** i18n translation key */
    messageKey: string;
    /** i18n interpolation params */
    messageParams?: Record<string, string | number>;
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
            message: 'Invalid budget period.',
            messageKey: 'insights.invalidBudgetPeriod',
        };
    }

    if (budgetLimit <= 0) {
        return {
            expectedSpentByNow: 0,
            overBudgetPace: spent > 0,
            message: spent > 0
                ? 'No budget set, but you have spending recorded.'
                : 'No budget set for this period.',
            messageKey: spent > 0 ? 'insights.noBudgetSpending' : 'insights.noBudgetNoSpending',
        };
    }

    const expectedSpentByNow = (daysElapsed / totalDays) * budgetLimit;
    const overBudgetPace = spent > expectedSpentByNow;

    if (overBudgetPace) {
        const overBy = spent - expectedSpentByNow;
        const overPct = ((overBy / expectedSpentByNow) * 100) || 0;
        const percent = overPct.toFixed(0);
        return {
            expectedSpentByNow,
            overBudgetPace: true,
            message: `Spending is ${percent}% ahead of budget pace.`,
            messageKey: 'insights.budgetAhead',
            messageParams: { percent },
        };
    }

    return {
        expectedSpentByNow,
        overBudgetPace: false,
        message: 'Spending is on track with your budget pace.',
        messageKey: 'insights.budgetOnTrack',
    };
}
