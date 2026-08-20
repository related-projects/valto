/**
 * formatAmount Utility Tests
 *
 * Tests for all three formatting functions:
 * formatAmount, formatAmountCompact, formatAmountWhole.
 * Covers all three number-format profiles, negative values, zero, and edge cases.
 *
 * A profile fixes four things at once - grouping character, decimal character,
 * which side the currency symbol sits on, and the gap between symbol and digits -
 * so the assertions below are deliberately full-string and deliberately spell the
 * separator out by code point. A test that only checked the digits would not
 * protect the thing these profiles exist for.
 */

import { formatAmount, formatAmountCompact, formatAmountWhole } from '../formatAmount';

/** U+00A0, the grouping and symbol-gap character. Spelled out so the expected
 *  strings below cannot be satisfied by a plain U+0020. */
const NBSP = '\u00A0';

describe('formatAmount', () => {
    // ─── Basic formatting with the dot profile ─────────────────────────

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

    // ─── Comma profile: dot groups, comma decimal, symbol suffixed ─────

    it('formats with the comma profile', () => {
        expect(formatAmount(200050, '$', 'comma')).toBe(`2.000,50${NBSP}$`);
    });

    it('formats large amount with the comma profile', () => {
        expect(formatAmount(1234567, '€', 'comma')).toBe(`12.345,67${NBSP}€`);
    });

    it('formats sub-dollar with the comma profile', () => {
        expect(formatAmount(99, '€', 'comma')).toBe(`0,99${NBSP}€`);
    });

    it('formats zero with the comma profile', () => {
        expect(formatAmount(0, '$', 'comma')).toBe(`0,00${NBSP}$`);
    });

    it('keeps the sign leading when the symbol is suffixed', () => {
        expect(formatAmount(-5000, '€', 'comma')).toBe(`-50,00${NBSP}€`);
    });

    // ─── Space profile: U+00A0 groups, comma decimal, symbol suffixed ──

    it('formats with the space profile', () => {
        expect(formatAmount(200050, '€', 'space')).toBe(`2${NBSP}000,50${NBSP}€`);
    });

    it('formats large amount with the space profile', () => {
        expect(formatAmount(123456789, '€', 'space')).toBe(`1${NBSP}234${NBSP}567,89${NBSP}€`);
    });

    it('formats an ungrouped amount with the space profile', () => {
        expect(formatAmount(99, '€', 'space')).toBe(`0,99${NBSP}€`);
    });

    it('keeps the sign leading in the space profile', () => {
        expect(formatAmount(-200050, '€', 'space')).toBe(`-2${NBSP}000,50${NBSP}€`);
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

    it('formats with the comma profile', () => {
        expect(formatAmountCompact(200000, '$', 'comma')).toBe(`2,0k${NBSP}$`);
    });

    it('formats with the space profile', () => {
        expect(formatAmountCompact(200000, '€', 'space')).toBe(`2,0k${NBSP}€`);
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

    it('formats with the comma profile (swaps grouping, suffixes the symbol)', () => {
        expect(formatAmountWhole(1234500, '€', 'comma')).toBe(`12.345${NBSP}€`);
    });

    it('formats with the space profile', () => {
        expect(formatAmountWhole(1234500, '€', 'space')).toBe(`12${NBSP}345${NBSP}€`);
    });

    it('uses custom currency symbol', () => {
        expect(formatAmountWhole(100000, '¥')).toBe('¥1,000');
    });

    // A negative whole amount used to render as positive: the magnitude was taken
    // with Math.abs and the sign was never put back. A wrong number on screen.
    it('keeps the sign on a negative amount', () => {
        expect(formatAmountWhole(-200050)).toBe('-$2,001');
        expect(formatAmountWhole(-99)).toBe('-$1');
        expect(formatAmountWhole(-1234500, '€', 'space')).toBe(`-12${NBSP}345${NBSP}€`);
    });

    it('leaves zero unsigned', () => {
        expect(formatAmountWhole(0)).toBe('$0');
        expect(formatAmountWhole(-0)).toBe('$0');
    });
});

// ─── Per-currency exponent (decimals: 0 | 2 | 3) ───────────────────────
describe('formatAmount — currency exponent', () => {
    it('renders a 0-decimal currency with no decimal part (DoD 1)', () => {
        // 100000 minor units in XOF (decimals 0) is 100,000 francs - a whole amount.
        expect(formatAmount(100000, 'FCFA', 'dot', 0)).toBe('FCFA100,000');
    });

    it('renders a 0-decimal currency under the comma profile', () => {
        expect(formatAmount(100000, 'FCFA', 'comma', 0)).toBe(`100.000${NBSP}FCFA`);
    });

    it('renders a 2-decimal currency unchanged (DoD 2)', () => {
        expect(formatAmount(1250, '$', 'dot', 2)).toBe('$12.50');
    });

    it('renders a 3-decimal currency with three fraction digits (DoD 3)', () => {
        // 1500 minor units in KWD (decimals 3) is 1.500 dinar.
        expect(formatAmount(1500, 'KD', 'dot', 3)).toBe('KD1.500');
    });

    it('renders a 3-decimal currency under the comma profile', () => {
        expect(formatAmount(1500, 'KD', 'comma', 3)).toBe(`1,500${NBSP}KD`);
    });

    it('compact form honours the exponent', () => {
        // XOF 100000 minor = 100,000 major -> 100.0k
        expect(formatAmountCompact(100000, 'FCFA', 'dot', 0)).toBe('FCFA100.0k');
    });

    it('whole form honours the exponent', () => {
        expect(formatAmountWhole(100000, 'FCFA', 'dot', 0)).toBe('FCFA100,000');
        // 1.5 dinar rounds to a whole 2.
        expect(formatAmountWhole(1500, 'KD', 'dot', 3)).toBe('KD2');
    });
});

// ─── The three profiles side by side, per exponent ────────────────────
// This is the table the registry entry was raised about. Each expected string is
// written out in full, with every space named by code point, because the defect
// being fixed WAS the spacing and the symbol placement.
describe('formatAmount — profile matrix', () => {
    it('renders XOF 2000 (0 decimals) per profile', () => {
        // The validated target for the app's primary market.
        expect(formatAmount(2000, 'FCFA', 'space', 0)).toBe(`2${NBSP}000${NBSP}FCFA`);
        expect(formatAmount(2000, 'FCFA', 'dot', 0)).toBe('FCFA2,000');
        expect(formatAmount(2000, 'FCFA', 'comma', 0)).toBe(`2.000${NBSP}FCFA`);
    });

    it('renders XOF 60000 (0 decimals) per profile', () => {
        // 60,000 read by a French reader as sixty was the reported defect.
        expect(formatAmount(60000, 'FCFA', 'space', 0)).toBe(`60${NBSP}000${NBSP}FCFA`);
        expect(formatAmount(60000, 'FCFA', 'dot', 0)).toBe('FCFA60,000');
        expect(formatAmount(60000, 'FCFA', 'comma', 0)).toBe(`60.000${NBSP}FCFA`);
    });

    it('renders USD 200050 (2 decimals) per profile', () => {
        expect(formatAmount(200050, '$', 'dot', 2)).toBe('$2,000.50');
        expect(formatAmount(200050, '$', 'comma', 2)).toBe(`2.000,50${NBSP}$`);
        expect(formatAmount(200050, '$', 'space', 2)).toBe(`2${NBSP}000,50${NBSP}$`);
    });

    it('renders KWD 1234567 (3 decimals) per profile', () => {
        expect(formatAmount(1234567, 'KD', 'dot', 3)).toBe('KD1,234.567');
        expect(formatAmount(1234567, 'KD', 'comma', 3)).toBe(`1.234,567${NBSP}KD`);
        expect(formatAmount(1234567, 'KD', 'space', 3)).toBe(`1${NBSP}234,567${NBSP}KD`);
    });

    it('emits no gap and no symbol when the caller passes an empty symbol', () => {
        // Callers that format a bare number must not receive a dangling U+00A0.
        expect(formatAmount(200050, '', 'space')).toBe(`2${NBSP}000,50`);
        expect(formatAmount(200050, '', 'comma')).toBe('2.000,50');
        expect(formatAmount(200050, '', 'dot')).toBe('2,000.50');
    });
});
