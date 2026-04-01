/**
 * formatAmount Utility Tests
 *
 * Tests for all three formatting functions:
 * formatAmount, formatAmountCompact, formatAmountWhole.
 * Covers both decimal separators, negative values, zero, and edge cases.
 */

import { formatAmount, formatAmountCompact, formatAmountWhole } from '../formatAmount';

describe('formatAmount', () => {
    // ─── Basic formatting with dot separator ───────────────────────────

    it('formats standard amount', () => {
        expect(formatAmount(200050)).toBe('$2,000.50');
    });

    it('formats zero', () => {
        expect(formatAmount(0)).toBe('$0.00');
    });

    it('formats sub-dollar amount', () => {
        expect(formatAmount(99)).toBe('$0.99');
    });

    it('formats single cent', () => {
        expect(formatAmount(1)).toBe('$0.01');
    });

    it('formats negative amount', () => {
        expect(formatAmount(-5000)).toBe('-$50.00');
    });

    it('formats large amount with thousands separator', () => {
        expect(formatAmount(1234567)).toBe('$12,345.67');
    });

    // ─── Custom currency symbol ────────────────────────────────────────

    it('uses custom currency symbol', () => {
        expect(formatAmount(200055, '€')).toBe('€2,000.55');
    });

    it('uses multi-character currency', () => {
        expect(formatAmount(10000, 'R$')).toBe('R$100.00');
    });

    // ─── Comma separator ───────────────────────────────────────────────

    it('formats with comma separator', () => {
        expect(formatAmount(200050, '$', 'comma')).toBe('$2.000,50');
    });

    it('formats large amount with comma separator', () => {
        expect(formatAmount(1234567, '€', 'comma')).toBe('€12.345,67');
    });

    it('formats sub-dollar with comma separator', () => {
        expect(formatAmount(99, '€', 'comma')).toBe('€0,99');
    });

    it('formats zero with comma separator', () => {
        expect(formatAmount(0, '$', 'comma')).toBe('$0,00');
    });
});

describe('formatAmountCompact', () => {
    it('formats standard amount in compact form', () => {
        expect(formatAmountCompact(200000)).toBe('$2.0k');
    });

    it('formats sub-thousand amount', () => {
        expect(formatAmountCompact(50000)).toBe('$0.5k');
    });

    it('formats large amount', () => {
        expect(formatAmountCompact(10000000)).toBe('$100.0k');
    });

    it('formats with comma separator', () => {
        expect(formatAmountCompact(200000, '$', 'comma')).toBe('$2,0k');
    });

    it('uses custom currency symbol', () => {
        expect(formatAmountCompact(500000, '£')).toBe('£5.0k');
    });
});

describe('formatAmountWhole', () => {
    it('formats without decimals (rounds)', () => {
        expect(formatAmountWhole(200050)).toBe('$2,001');
    });

    it('formats sub-dollar rounds to nearest', () => {
        expect(formatAmountWhole(99)).toBe('$1');
    });

    it('formats exact dollars', () => {
        expect(formatAmountWhole(50000)).toBe('$500');
    });

    it('formats zero', () => {
        expect(formatAmountWhole(0)).toBe('$0');
    });

    it('formats with comma separator (swaps grouping)', () => {
        expect(formatAmountWhole(1234500, '€', 'comma')).toBe('€12.345');
    });

    it('uses custom currency symbol', () => {
        expect(formatAmountWhole(100000, '¥')).toBe('¥1,000');
    });
});
