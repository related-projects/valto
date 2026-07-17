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

// ─── Per-currency exponent (decimals: 0 | 2 | 3) ───────────────────────
describe('formatAmount — currency exponent', () => {
    it('renders a 0-decimal currency with no decimal part (DoD 1)', () => {
        // 100000 minor units in XOF (decimals 0) is 100,000 CFA — a whole amount.
        expect(formatAmount(100000, 'CFA', 'dot', 0)).toBe('CFA100,000');
    });

    it('renders a 0-decimal currency under the comma preference', () => {
        expect(formatAmount(100000, 'CFA', 'comma', 0)).toBe('CFA100.000');
    });

    it('renders a 2-decimal currency unchanged (DoD 2)', () => {
        expect(formatAmount(1250, '$', 'dot', 2)).toBe('$12.50');
    });

    it('renders a 3-decimal currency with three fraction digits (DoD 3)', () => {
        // 1500 minor units in KWD (decimals 3) is 1.500 dinar.
        expect(formatAmount(1500, 'KD', 'dot', 3)).toBe('KD1.500');
    });

    it('renders a 3-decimal currency under the comma preference', () => {
        expect(formatAmount(1500, 'KD', 'comma', 3)).toBe('KD1,500');
    });

    it('compact form honours the exponent', () => {
        // XOF 100000 minor = 100,000 major → 100.0k
        expect(formatAmountCompact(100000, 'CFA', 'dot', 0)).toBe('CFA100.0k');
    });

    it('whole form honours the exponent', () => {
        expect(formatAmountWhole(100000, 'CFA', 'dot', 0)).toBe('CFA100,000');
        // 1.5 dinar rounds to a whole 2.
        expect(formatAmountWhole(1500, 'KD', 'dot', 3)).toBe('KD2');
    });
});
