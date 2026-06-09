/**
 * Savings Health Evaluator
 *
 * Pure domain function that interprets income vs. expenses
 * and returns a health classification with a translation key for i18n.
 */

export type SavingsLevel = 'deficit' | 'weak' | 'acceptable' | 'strong';

export interface SavingsHealthResult {
    /** Fraction of income saved (0–1 scale, can be negative for deficit) */
    savingsRate: number;
    /** Qualitative level */
    level: SavingsLevel;
    /** i18n translation key */
    messageKey: string;
    /** Interpolation params for the translation key */
    messageParams: Record<string, string | number>;
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
            messageKey: expenses > 0
                ? 'insights.noIncomeSpending'
                : 'insights.noIncomeNoExpense',
            messageParams: {},
        };
    }

    const savingsRate = (income - expenses) / income;

    if (savingsRate < 0) {
        return {
            savingsRate,
            level: 'deficit',
            messageKey: 'insights.spendingOverIncome',
            messageParams: { percent: Math.abs(Math.round(savingsRate * 100)) },
        };
    }

    if (savingsRate < 0.1) {
        return {
            savingsRate,
            level: 'weak',
            messageKey: 'insights.savingsWeak',
            messageParams: { percent: Math.round(savingsRate * 100) },
        };
    }

    if (savingsRate < 0.2) {
        return {
            savingsRate,
            level: 'acceptable',
            messageKey: 'insights.savingsAcceptable',
            messageParams: { percent: Math.round(savingsRate * 100) },
        };
    }

    return {
        savingsRate,
        level: 'strong',
        messageKey: 'insights.savingsStrong',
        messageParams: { percent: Math.round(savingsRate * 100) },
    };
}
