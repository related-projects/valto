/**
 * Savings Health Evaluator
 *
 * Pure domain function that interprets income vs. expenses
 * and returns a health classification with a translation key + params.
 */

export type SavingsLevel = 'deficit' | 'weak' | 'acceptable' | 'strong';

export interface SavingsHealthResult {
    /** Fraction of income saved (0–1 scale, can be negative for deficit) */
    savingsRate: number;
    /** Qualitative level */
    level: SavingsLevel;
    /** Human-readable insight message (English fallback) */
    message: string;
    /** i18n translation key */
    messageKey: string;
    /** i18n interpolation params */
    messageParams?: Record<string, string | number>;
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
            messageKey: expenses > 0 ? 'insights.noIncomeDeficit' : 'insights.noActivity',
        };
    }

    const savingsRate = (income - expenses) / income;
    const percent = Math.abs(Math.round(savingsRate * 100));

    if (savingsRate < 0) {
        return {
            savingsRate,
            level: 'deficit',
            message: `You're spending ${percent}% more than you earn.`,
            messageKey: 'insights.spendingOverIncome',
            messageParams: { percent },
        };
    }

    if (savingsRate < 0.1) {
        return {
            savingsRate,
            level: 'weak',
            message: `Saving only ${percent}% of income — try to reach 10%.`,
            messageKey: 'insights.savingWeak',
            messageParams: { percent },
        };
    }

    if (savingsRate < 0.2) {
        return {
            savingsRate,
            level: 'acceptable',
            message: `Saving ${percent}% of income — on a healthy track.`,
            messageKey: 'insights.savingAcceptable',
            messageParams: { percent },
        };
    }

    return {
        savingsRate,
        level: 'strong',
        message: `Great! Saving ${percent}% of income.`,
        messageKey: 'insights.savingStrong',
        messageParams: { percent },
    };
}
