/**
 * Financial Insights Unit Tests
 *
 * Comprehensive coverage of the four pure domain insight functions.
 * Tests edge cases, boundary conditions, and representative scenarios.
 */

import { evaluateBudgetPace } from '../insights/budgetPace';
import { evaluateCategoryRisk } from '../insights/categoryRisk';
import { compareMonthlySpending } from '../insights/monthlySpendingTrend';
import { evaluateSavingsHealth } from '../insights/savingsHealth';

// ───────────────────────────────────────────────
//  evaluateSavingsHealth
// ───────────────────────────────────────────────

describe('evaluateSavingsHealth', () => {
    it('returns deficit when expenses exceed income', () => {
        const result = evaluateSavingsHealth(100_000, 150_000);
        expect(result.level).toBe('deficit');
        expect(result.savingsRate).toBeLessThan(0);
    });

    it('returns weak when savings rate is below 10%', () => {
        // saving 5% → weak
        const result = evaluateSavingsHealth(100_000, 95_000);
        expect(result.level).toBe('weak');
        expect(result.savingsRate).toBeCloseTo(0.05);
    });

    it('returns acceptable when savings rate is 10-19%', () => {
        const result = evaluateSavingsHealth(100_000, 85_000);
        expect(result.level).toBe('acceptable');
        expect(result.savingsRate).toBeCloseTo(0.15);
    });

    it('returns strong when savings rate is 20%+', () => {
        const result = evaluateSavingsHealth(100_000, 70_000);
        expect(result.level).toBe('strong');
        expect(result.savingsRate).toBeCloseTo(0.30);
    });

    it('handles income = 0 with expenses → deficit', () => {
        const result = evaluateSavingsHealth(0, 50_000);
        expect(result.level).toBe('deficit');
        expect(result.savingsRate).toBe(0);
        expect(result.message).toContain('No income');
    });

    it('handles income = 0 and expenses = 0 → weak', () => {
        const result = evaluateSavingsHealth(0, 0);
        expect(result.level).toBe('weak');
        expect(result.savingsRate).toBe(0);
    });

    it('returns strong at exactly 20%', () => {
        const result = evaluateSavingsHealth(100_000, 80_000);
        expect(result.level).toBe('strong');
    });

    it('returns acceptable at exactly 10%', () => {
        const result = evaluateSavingsHealth(100_000, 90_000);
        expect(result.level).toBe('acceptable');
    });

    it('returns weak at exactly 0% (breakeven)', () => {
        const result = evaluateSavingsHealth(100_000, 100_000);
        expect(result.level).toBe('weak');
        expect(result.savingsRate).toBe(0);
    });
});

// ───────────────────────────────────────────────
//  compareMonthlySpending
// ───────────────────────────────────────────────

describe('compareMonthlySpending', () => {
    it('detects an increase', () => {
        const result = compareMonthlySpending(
            { totalExpenses: 60_000 },
            { totalExpenses: 50_000 },
        );
        expect(result.direction).toBe('increase');
        expect(result.changePercentage).toBeCloseTo(20);
    });

    it('detects a decrease', () => {
        const result = compareMonthlySpending(
            { totalExpenses: 40_000 },
            { totalExpenses: 50_000 },
        );
        expect(result.direction).toBe('decrease');
        expect(result.changePercentage).toBeCloseTo(-20);
    });

    it('returns stable for identical months', () => {
        const result = compareMonthlySpending(
            { totalExpenses: 50_000 },
            { totalExpenses: 50_000 },
        );
        expect(result.direction).toBe('stable');
        expect(result.changePercentage).toBe(0);
    });

    it('returns stable within ±1% tolerance', () => {
        const result = compareMonthlySpending(
            { totalExpenses: 50_400 },
            { totalExpenses: 50_000 },
        );
        expect(result.direction).toBe('stable');
    });

    it('handles previous = 0 with current spending → increase', () => {
        const result = compareMonthlySpending(
            { totalExpenses: 30_000 },
            { totalExpenses: 0 },
        );
        expect(result.direction).toBe('increase');
        expect(result.changePercentage).toBe(100);
    });

    it('handles both months at 0 → stable', () => {
        const result = compareMonthlySpending(
            { totalExpenses: 0 },
            { totalExpenses: 0 },
        );
        expect(result.direction).toBe('stable');
    });
});

// ───────────────────────────────────────────────
//  evaluateCategoryRisk
// ───────────────────────────────────────────────

describe('evaluateCategoryRisk', () => {
    it('returns high risk when a category is ≥ 40%', () => {
        const result = evaluateCategoryRisk({
            Food: 50_000,
            Transport: 30_000,
            Entertainment: 20_000,
        });
        expect(result.topCategory).toBe('Food');
        expect(result.percentage).toBe(50);
        expect(result.riskLevel).toBe('high');
    });

    it('returns medium risk when top category is 30-39%', () => {
        const result = evaluateCategoryRisk({
            Food: 35_000,
            Transport: 33_000,
            Entertainment: 32_000,
        });
        expect(result.topCategory).toBe('Food');
        expect(result.riskLevel).toBe('medium');
    });

    it('returns low risk when top category is < 30%', () => {
        const result = evaluateCategoryRisk({
            Food: 25_000,
            Transport: 25_000,
            Entertainment: 25_000,
            Shopping: 25_000,
        });
        expect(result.riskLevel).toBe('low');
    });

    it('returns high risk for a single category at 100%', () => {
        const result = evaluateCategoryRisk({ Rent: 100_000 });
        expect(result.topCategory).toBe('Rent');
        expect(result.percentage).toBe(100);
        expect(result.riskLevel).toBe('high');
    });

    it('handles empty input gracefully', () => {
        const result = evaluateCategoryRisk({});
        expect(result.topCategory).toBe('None');
        expect(result.percentage).toBe(0);
        expect(result.riskLevel).toBe('low');
    });

    it('handles exact 40% boundary as high', () => {
        const result = evaluateCategoryRisk({
            Food: 40_000,
            Other: 60_000,
        });
        expect(result.topCategory).toBe('Other');
        expect(result.percentage).toBe(60);
        expect(result.riskLevel).toBe('high');
    });
});

// ───────────────────────────────────────────────
//  evaluateBudgetPace
// ───────────────────────────────────────────────

describe('evaluateBudgetPace', () => {
    it('detects on-track spending', () => {
        // 15 of 30 days, spent 50% of budget → on track
        const result = evaluateBudgetPace(50_000, 100_000, 15, 30);
        expect(result.overBudgetPace).toBe(false);
        expect(result.expectedSpentByNow).toBe(50_000);
    });

    it('detects over-pace spending', () => {
        // 10 of 30 days, already spent 60% → over pace
        const result = evaluateBudgetPace(60_000, 100_000, 10, 30);
        expect(result.overBudgetPace).toBe(true);
        expect(result.expectedSpentByNow).toBeCloseTo(33_333.33, 0);
    });

    it('handles first day of month', () => {
        const result = evaluateBudgetPace(5_000, 100_000, 1, 31);
        expect(result.expectedSpentByNow).toBeCloseTo(3_225.81, 0);
        expect(result.overBudgetPace).toBe(true);
    });

    it('handles last day of month', () => {
        const result = evaluateBudgetPace(90_000, 100_000, 31, 31);
        expect(result.overBudgetPace).toBe(false);
        expect(result.expectedSpentByNow).toBe(100_000);
    });

    it('handles zero budget limit', () => {
        const result = evaluateBudgetPace(5_000, 0, 10, 30);
        expect(result.overBudgetPace).toBe(true);
        expect(result.message).toContain('No budget set');
    });

    it('handles totalDays = 0 edge case', () => {
        const result = evaluateBudgetPace(5_000, 100_000, 0, 0);
        expect(result.message).toBe('Invalid budget period.');
    });

    it('handles no spending', () => {
        const result = evaluateBudgetPace(0, 100_000, 15, 30);
        expect(result.overBudgetPace).toBe(false);
    });
});
