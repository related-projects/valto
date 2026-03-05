/**
 * Monthly Spending Trend Comparator
 *
 * Pure domain function that compares two months of expense data
 * and returns the direction and magnitude of change.
 */

export type SpendingDirection = 'increase' | 'decrease' | 'stable';

export interface MonthlySpendingData {
    totalExpenses: number;
}

export interface MonthlySpendingTrendResult {
    /** Percentage change from previous to current (can be negative) */
    changePercentage: number;
    /** Qualitative direction */
    direction: SpendingDirection;
    /** Human-readable insight message */
    message: string;
    /** i18n translation key */
    messageKey: string;
    /** i18n interpolation params */
    messageParams?: Record<string, string | number>;
}

/**
 * Compare current month spending to previous month.
 *
 * @param currentMonthData  Aggregate expenses for the current month
 * @param previousMonthData Aggregate expenses for the previous month
 */
export function compareMonthlySpending(
    currentMonthData: MonthlySpendingData,
    previousMonthData: MonthlySpendingData,
): MonthlySpendingTrendResult {
    const current = currentMonthData.totalExpenses;
    const previous = previousMonthData.totalExpenses;

    // No previous data — can't compute a meaningful trend
    if (previous === 0) {
        return {
            changePercentage: current > 0 ? 100 : 0,
            direction: current > 0 ? 'increase' : 'stable',
            message:
                current > 0
                    ? 'No spending last month — this is your first tracked month.'
                    : 'No spending recorded in either month.',
            messageKey: current > 0 ? 'insights.trendFirstMonth' : 'insights.trendNoSpending',
        };
    }

    const changePercentage = ((current - previous) / previous) * 100;

    // ±1 % tolerance counts as stable
    if (Math.abs(changePercentage) <= 1) {
        return {
            changePercentage,
            direction: 'stable',
            message: 'Spending is roughly the same as last month.',
            messageKey: 'insights.trendStable',
        };
    }

    if (changePercentage > 0) {
        const percent = changePercentage.toFixed(1);
        return {
            changePercentage,
            direction: 'increase',
            message: `Spending increased by ${percent}% compared to last month.`,
            messageKey: 'insights.trendIncrease',
            messageParams: { percent },
        };
    }

    const percent = Math.abs(changePercentage).toFixed(1);
    return {
        changePercentage,
        direction: 'decrease',
        message: `Spending decreased by ${percent}% compared to last month.`,
        messageKey: 'insights.trendDecrease',
        messageParams: { percent },
    };
}
