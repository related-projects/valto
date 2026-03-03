/**
 * Savings Health Evaluator
 *
 * Pure domain function that interprets income vs. expenses
 * and returns a health classification with a human-readable message.
 */

export type SavingsLevel = 'deficit' | 'weak' | 'acceptable' | 'strong';

export interface SavingsHealthResult {
    /** Fraction of income saved (0–1 scale, can be negative for deficit) */
    savingsRate: number;
    /** Qualitative level */
    level: SavingsLevel;
    /** Human-readable insight message */
    message: string;
}

/**
 * Evaluate how healthy the user's savings are for a given period.
 *
 * @param income  Total income (minor units, always ≥ 0)
 * @param expenses Total expenses (minor units, always ≥ 0)
 */
export function evaluateSavingsHealth(
    income: number,
    expenses: number,
): SavingsHealthResult {
    if (income === 0) {
        const level: SavingsLevel = expenses > 0 ? 'deficit' : 'weak';
        return {
            savingsRate: 0,
            level,
            message:
                expenses > 0
                    ? 'No income recorded — all spending is from savings.'
                    : 'No income or expenses recorded this period.',
        };
    }

    const savingsRate = (income - expenses) / income;

    if (savingsRate < 0) {
        return {
            savingsRate,
            level: 'deficit',
            message: `You're spending ${Math.abs(Math.round(savingsRate * 100))}% more than you earn.`,
        };
    }

    if (savingsRate < 0.1) {
        return {
            savingsRate,
            level: 'weak',
            message: `Saving only ${Math.round(savingsRate * 100)}% of income — try to reach 10%.`,
        };
    }

    if (savingsRate < 0.2) {
        return {
            savingsRate,
            level: 'acceptable',
            message: `Saving ${Math.round(savingsRate * 100)}% of income — on a healthy track.`,
        };
    }

    return {
        savingsRate,
        level: 'strong',
        message: `Great! Saving ${Math.round(savingsRate * 100)}% of income.`,
    };
}
