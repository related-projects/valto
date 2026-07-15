/**
 * Financial Insights — barrel export
 *
 * All insight functions are pure, stateless, and framework-agnostic.
 * They belong to the domain layer and must not import from hooks or UI.
 */

export { evaluateBudgetPace, type BudgetPaceResult } from './budgetPace';
export { evaluateCategoryRisk, type CategoryRiskLevel, type CategoryRiskResult } from './categoryRisk';
export { compareMonthlySpending, type MonthlySpendingData, type MonthlySpendingTrendResult, type SpendingDirection } from './monthlySpendingTrend';
export { evaluateSavingsHealth, type SavingsHealthResult, type SavingsLevel } from './savingsHealth';

