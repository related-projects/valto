/**
 * normalizeAmount Utility Tests
 */

import { normalizeAmount, parseAndNormalizeAmount, centsToMajor } from '../normalizeAmount';

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
