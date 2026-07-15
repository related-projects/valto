/**
 * Category Risk Evaluator
 *
 * Pure domain function that identifies the top spending category
 * and assigns a risk level based on its share of total expenses.
 */

export type CategoryRiskLevel = 'low' | 'medium' | 'high';

export interface CategoryRiskResult {
    /** Name/key of the highest-spending category */
    topCategory: string;
    /** Percentage of total expenses consumed by the top category */
    percentage: number;
    /** Risk classification */
    riskLevel: CategoryRiskLevel;
}

/**
 * Evaluate concentration risk from category spending distribution.
 *
 * @param expensesByCategory Map of category name/id → total expense amount
 */
export function evaluateCategoryRisk(
    expensesByCategory: Record<string, number>,
): CategoryRiskResult {
    const entries = Object.entries(expensesByCategory);

    if (entries.length === 0) {
        return { topCategory: 'None', percentage: 0, riskLevel: 'low' };
    }

    const totalExpenses = entries.reduce((sum, [, amount]) => sum + amount, 0);

    if (totalExpenses === 0) {
        return { topCategory: entries[0][0], percentage: 0, riskLevel: 'low' };
    }

    // Find the category with the highest spend
    let topCategory = entries[0][0];
    let topAmount = entries[0][1];

    for (let i = 1; i < entries.length; i++) {
        if (entries[i][1] > topAmount) {
            topCategory = entries[i][0];
            topAmount = entries[i][1];
        }
    }

    const percentage = (topAmount / totalExpenses) * 100;

    let riskLevel: CategoryRiskLevel;
    if (percentage >= 40) {
        riskLevel = 'high';
    } else if (percentage >= 30) {
        riskLevel = 'medium';
    } else {
        riskLevel = 'low';
    }

    return { topCategory, percentage, riskLevel };
}
