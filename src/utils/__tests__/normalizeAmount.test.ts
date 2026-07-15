/**
 * normalizeAmount Utility Tests
 */

import { formatAmount } from '../formatAmount';
import { centsToMajor, normalizeAmount, parseAmountInput, parseAndNormalizeAmount } from '../normalizeAmount';

describe('normalizeAmount', () => {
    it('converts whole dollar amount to cents', () => {
        expect(normalizeAmount(1500)).toBe(150000);
    });

    it('converts fractional dollar amount to cents', () => {
        expect(normalizeAmount(15.75)).toBe(1575);
    });

    it('converts small amount to cents', () => {
        expect(normalizeAmount(0.5)).toBe(50);
    });

    it('handles zero', () => {
        expect(normalizeAmount(0)).toBe(0);
    });

    it('rounds sub-cent values', () => {
        expect(normalizeAmount(10.999)).toBe(1100);
        expect(normalizeAmount(10.001)).toBe(1000);
    });
});

describe('parseAndNormalizeAmount', () => {
    it('parses valid string and converts to cents', () => {
        expect(parseAndNormalizeAmount('1500')).toBe(150000);
    });

    it('parses decimal string and converts to cents', () => {
        expect(parseAndNormalizeAmount('15.75')).toBe(1575);
    });

    it('returns null for empty string', () => {
        expect(parseAndNormalizeAmount('')).toBeNull();
    });

    it('returns null for non-numeric string', () => {
        expect(parseAndNormalizeAmount('abc')).toBeNull();
    });

    it('returns null for negative amount', () => {
        expect(parseAndNormalizeAmount('-5')).toBeNull();
    });

    it('returns null for zero', () => {
        expect(parseAndNormalizeAmount('0')).toBeNull();
    });

    it('parses a comma decimal separator when the comma preference is active', () => {
        expect(parseAndNormalizeAmount('12,50', 'comma')).toBe(1250);
    });

    it('parses a comma decimal separator under the default dot preference', () => {
        // decimalSeparator defaults to 'dot' and is never locale-derived, so a
        // comma-locale user hits this path unless they change the setting.
        expect(parseAndNormalizeAmount('12,50', 'dot')).toBe(1250);
    });

    it('parses a dot decimal separator when the comma preference is active', () => {
        // A misread here would store 125000 — a silent 100x error.
        expect(parseAndNormalizeAmount('12.50', 'comma')).toBe(1250);
    });

    it('parses a thousands separator in the format formatAmount emits', () => {
        expect(parseAndNormalizeAmount('2,000.50', 'dot')).toBe(200050);
        expect(parseAndNormalizeAmount('2.000,50', 'comma')).toBe(200050);
    });

    it('returns null for multi-separator garbage', () => {
        expect(parseAndNormalizeAmount('1,2,3', 'dot')).toBeNull();
        expect(parseAndNormalizeAmount('1.2.3', 'comma')).toBeNull();
    });

    it('returns null for whitespace-only input', () => {
        expect(parseAndNormalizeAmount('   ')).toBeNull();
    });

    it('returns null for trailing garbage', () => {
        expect(parseAndNormalizeAmount('12abc')).toBeNull();
    });
});

describe('parseAmountInput', () => {
    it('parses a plain decimal under each separator preference', () => {
        expect(parseAmountInput('12.50', 'dot')).toBe(12.5);
        expect(parseAmountInput('12,50', 'comma')).toBe(12.5);
    });

    it('accepts the opposite separator as a decimal when it cannot be a thousands group', () => {
        expect(parseAmountInput('12,50', 'dot')).toBe(12.5);
        expect(parseAmountInput('12.50', 'comma')).toBe(12.5);
    });

    it('reads a valid three-digit group as a thousands separator', () => {
        expect(parseAmountInput('1,000', 'dot')).toBe(1000);
        expect(parseAmountInput('1.000', 'comma')).toBe(1000);
    });

    it('reads the decimal separator as a decimal even on a three-digit group', () => {
        expect(parseAmountInput('1.000', 'dot')).toBe(1);
        expect(parseAmountInput('1,000', 'comma')).toBe(1);
    });

    it('parses grouped amounts with decimals', () => {
        expect(parseAmountInput('2,000.50', 'dot')).toBe(2000.5);
        expect(parseAmountInput('2.000,50', 'comma')).toBe(2000.5);
        expect(parseAmountInput('1,234,567.89', 'dot')).toBe(1234567.89);
    });

    it('preserves parseFloat tolerance for partial decimals', () => {
        expect(parseAmountInput('.50', 'dot')).toBe(0.5);
        expect(parseAmountInput('12.', 'dot')).toBe(12);
        expect(parseAmountInput(',50', 'comma')).toBe(0.5);
    });

    it('allows zero and negative values, leaving policy to the caller', () => {
        expect(parseAmountInput('0')).toBe(0);
        expect(parseAmountInput('-5')).toBe(-5);
    });

    it('trims surrounding whitespace', () => {
        expect(parseAmountInput('  12.50  ', 'dot')).toBe(12.5);
    });

    it('returns null for invalid input', () => {
        expect(parseAmountInput('')).toBeNull();
        expect(parseAmountInput('   ')).toBeNull();
        expect(parseAmountInput('abc')).toBeNull();
        expect(parseAmountInput('12abc')).toBeNull();
        expect(parseAmountInput('12 50')).toBeNull();
        expect(parseAmountInput('.')).toBeNull();
        expect(parseAmountInput('1,2,3', 'dot')).toBeNull();
        expect(parseAmountInput('1.2.3', 'comma')).toBeNull();
    });

    it('rejects a dot-mode string under the comma preference rather than misreading it', () => {
        expect(parseAmountInput('1,234.56', 'comma')).toBeNull();
    });
});

describe('parse/format round-trip', () => {
    // formatAmount prefixes a currency symbol, but the parser's contract is the
    // TextInput value, which never contains one — so format with an empty currency.
    const CENTS = [1250, 200050, 50, 99, 100000, 1234567];

    it('parses back what formatAmount produces under the dot preference', () => {
        for (const cents of CENTS) {
            expect(parseAndNormalizeAmount(formatAmount(cents, '', 'dot'), 'dot')).toBe(cents);
        }
    });

    it('parses back what formatAmount produces under the comma preference', () => {
        for (const cents of CENTS) {
            expect(parseAndNormalizeAmount(formatAmount(cents, '', 'comma'), 'comma')).toBe(cents);
        }
    });
});

describe('centsToMajor', () => {
    it('converts cents to major units', () => {
        expect(centsToMajor(1575)).toBe(15.75);
    });

    it('converts large cent value', () => {
        expect(centsToMajor(150000)).toBe(1500);
    });

    it('handles zero', () => {
        expect(centsToMajor(0)).toBe(0);
    });
});
