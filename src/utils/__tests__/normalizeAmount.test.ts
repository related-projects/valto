/**
 * normalizeAmount Utility Tests
 */

import type { NumberFormatProfile } from '../../domain/entities/Settings';
import { formatAmount } from '../formatAmount';
import { centsToMajor, normalizeAmount, parseAmountInput, parseAndNormalizeAmount } from '../normalizeAmount';

/** Separator characters named by code point, so no assertion below can be
 *  satisfied by the wrong kind of space. */
const NBSP = '\u00A0';
const NARROW_NBSP = '\u202F';

const PROFILES: NumberFormatProfile[] = ['dot', 'comma', 'space'];

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
        // A misread here would store 125000 - a silent 100x error.
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
        // A 3-digit group after the DECIMAL separator is the fraction, not thousands.
        // Needs a 3-decimal currency, else the group exceeds the fraction-digit budget.
        expect(parseAmountInput('1.000', 'dot', 3)).toBe(1);
        expect(parseAmountInput('1,000', 'comma', 3)).toBe(1);
    });

    it('rejects a three-digit fraction under the default 2-decimal budget', () => {
        // Same inputs as above, but 3 fraction digits > 2 allowed -> over-precision.
        expect(parseAmountInput('1.000', 'dot')).toBeNull();
        expect(parseAmountInput('1,000', 'comma')).toBeNull();
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
    // formatAmount attaches a currency symbol, but the parser's contract is the
    // TextInput value, which never contains one - so format with an empty currency.
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

    it('parses back what formatAmount produces under the space preference', () => {
        for (const cents of CENTS) {
            expect(parseAndNormalizeAmount(formatAmount(cents, '', 'space'), 'space')).toBe(cents);
        }
    });

    // The full matrix: every profile against a 0-decimal currency (XOF), a
    // 2-decimal one (USD/EUR) and a 3-decimal one (KWD). The magnitudes are chosen
    // so that each exponent gets both grouped and ungrouped renderings, which is
    // where a grouping-character change does its damage.
    it('round-trips every profile at every exponent, grouped and ungrouped', () => {
        const BY_EXPONENT: { decimals: number; minor: number[] }[] = [
            // XOF: 2000 -> "2 000", 999 -> ungrouped, 1234567 -> two groups.
            { decimals: 0, minor: [2000, 60000, 999, 100000, 1234567] },
            // USD/EUR: 200050 -> grouped with a fraction, 99 -> fraction only.
            { decimals: 2, minor: [200050, 1234567, 99, 1250, 100000] },
            // KWD: 1234567 -> grouped with a 3-digit fraction, 1500 -> ungrouped.
            { decimals: 3, minor: [1234567, 1500, 999, 200050, 100000] },
        ];

        for (const { decimals, minor } of BY_EXPONENT) {
            for (const profile of PROFILES) {
                for (const value of minor) {
                    const rendered = formatAmount(value, '', profile, decimals);
                    expect(parseAndNormalizeAmount(rendered, profile, decimals)).toBe(value);
                }
            }
        }
    });

    it('round-trips a rendering that still carries its currency symbol gap', () => {
        // Not the TextInput contract, but the symbol gap is U+00A0 and trim() is
        // the only whitespace handling the parser has - so prove the digits still
        // come back once the symbol is stripped.
        const rendered = formatAmount(2000, 'FCFA', 'space', 0);
        expect(rendered).toBe(`2${NBSP}000${NBSP}FCFA`);
        expect(parseAndNormalizeAmount(rendered.replace('FCFA', ''), 'space', 0)).toBe(2000);
    });
});

// ─── Space as a grouping character (D4) ───────────────────────────────
describe('parseAmountInput - space grouping', () => {
    // U+0020 plain, U+00A0 no-break (what the space profile emits), U+202F narrow
    // no-break (what French CLDR emits, so pasted text carries it).
    const SPACES: [string, string][] = [
        ['U+0020', ' '],
        ['U+00A0', NBSP],
        ['U+202F', NARROW_NBSP],
    ];

    for (const [name, space] of SPACES) {
        it(`accepts ${name} as grouping in every profile`, () => {
            for (const profile of PROFILES) {
                expect(parseAmountInput(`2${space}000`, profile, 0)).toBe(2000);
                expect(parseAmountInput(`1${space}234${space}567`, profile, 0)).toBe(1234567);
            }
        });

        it(`accepts ${name} grouping alongside the profile's own decimal character`, () => {
            expect(parseAmountInput(`2${space}000.50`, 'dot', 2)).toBe(2000.5);
            expect(parseAmountInput(`2${space}000,50`, 'comma', 2)).toBe(2000.5);
            expect(parseAmountInput(`2${space}000,50`, 'space', 2)).toBe(2000.5);
        });
    }

    it('accepts mixed space kinds in one body', () => {
        // A pasted French string next to a typed space is still one number.
        expect(parseAmountInput(`1${NARROW_NBSP}234${NBSP}567`, 'space', 0)).toBe(1234567);
    });

    it('rejects a space that does not form valid groups', () => {
        for (const profile of PROFILES) {
            expect(parseAmountInput('12 34', profile, 2)).toBeNull();
            expect(parseAmountInput('1 23 456', profile, 2)).toBeNull();
            expect(parseAmountInput('1234 5', profile, 2)).toBeNull();
        }
    });

    it('never reads a space as a decimal separator, at any exponent', () => {
        // The point of routing spaces through their own branch: at 3 decimals the
        // tie-break turns a lone "1,234" into 1.234, but "1 234" must stay 1234.
        for (const [, space] of SPACES) {
            for (const profile of PROFILES) {
                expect(parseAmountInput(`1${space}234`, profile, 3)).toBe(1234);
                expect(parseAmountInput(`1${space}500`, profile, 3)).toBe(1500);
            }
        }
    });

    it('still enforces the currency fraction width on space-grouped input', () => {
        expect(parseAmountInput(`2${NBSP}000.50`, 'dot', 0)).toBeNull();
        expect(parseAmountInput(`2${NBSP}000,505`, 'comma', 2)).toBeNull();
    });

    it('accepts a sign in front of space-grouped input', () => {
        expect(parseAmountInput(`-2${NBSP}000`, 'space', 0)).toBe(-2000);
        expect(parseAmountInput(`+2${NBSP}000`, 'space', 0)).toBe(2000);
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

// ─── Per-currency exponent (decimals: 0 | 2 | 3) ───────────────────────
describe('currency exponent', () => {
    it('normalizeAmount scales by 10^decimals', () => {
        expect(normalizeAmount(1000, 0)).toBe(1000);
        expect(normalizeAmount(12.5, 2)).toBe(1250);
        expect(normalizeAmount(1.5, 3)).toBe(1500);
    });

    it('centsToMajor divides by 10^decimals', () => {
        expect(centsToMajor(1000, 0)).toBe(1000);
        expect(centsToMajor(1250, 2)).toBe(12.5);
        expect(centsToMajor(1500, 3)).toBe(1.5);
    });

    it('parses a whole amount for a 0-decimal currency without ×100 (DoD 4)', () => {
        // Under the old 2-decimal assumption this returned 100000.
        expect(parseAndNormalizeAmount('1000', 'dot', 0)).toBe(1000);
    });

    it('rejects more fraction digits than a 0-decimal currency allows (DoD 5)', () => {
        expect(parseAndNormalizeAmount('12.5', 'dot', 0)).toBeNull();
        expect(parseAmountInput('12.5', 'dot', 0)).toBeNull();
    });

    it('rejects more fraction digits than a 2-decimal currency allows', () => {
        expect(parseAmountInput('12.555', 'dot', 2)).toBeNull();
    });

    it('accepts exactly the fraction digits a 3-decimal currency allows', () => {
        expect(parseAmountInput('1.500', 'dot', 3)).toBe(1.5);
        expect(parseAndNormalizeAmount('1.5', 'dot', 3)).toBe(1500);
    });

    it('round-trips parse(format(x)) === x for one currency of each exponent (DoD 6)', () => {
        const cases: [number, number][] = [
            [100000, 0], // XOF
            [1250, 2], // USD
            [1500, 3], // KWD
        ];
        for (const [minor, decimals] of cases) {
            const major = String(centsToMajor(minor, decimals));
            expect(parseAndNormalizeAmount(major, 'dot', decimals)).toBe(minor);
        }
    });
});

// ─── Separator tie-break, pinned BY DECIMALS CLASS ─────────────────────
//
// Organised by exponent class rather than by currency on purpose. The rule that
// decides between "grouping" and "decimal" is a function of `decimals` alone, so a
// future trade-off has to break a named class here rather than slip past a stray
// per-currency case.
//
// Policy under test: a lone grouping separator with exactly `decimals` digits after it
// and no decimal separator reads as a DECIMAL. Grouping stays authoritative wherever
// the string is unambiguous - two separators, or several groups.
describe('separator tie-break by decimals class', () => {
    describe('decimals = 0 (unchanged)', () => {
        it('reads a lone group as grouping under the dot preference', () => {
            expect(parseAmountInput('1,234', 'dot', 0)).toBe(1234);
            expect(parseAmountInput('0,500', 'dot', 0)).toBe(500);
            expect(parseAmountInput('123,456', 'dot', 0)).toBe(123456);
            expect(parseAmountInput('1,000', 'dot', 0)).toBe(1000);
        });

        it('reads a lone group as grouping under the comma preference', () => {
            expect(parseAmountInput('1.234', 'comma', 0)).toBe(1234);
            expect(parseAmountInput('0.500', 'comma', 0)).toBe(500);
            expect(parseAmountInput('123.456', 'comma', 0)).toBe(123456);
            expect(parseAmountInput('1.000', 'comma', 0)).toBe(1000);
        });

        it('keeps multi-group and plain readings', () => {
            expect(parseAmountInput('1,234,567', 'dot', 0)).toBe(1234567);
            expect(parseAmountInput('1.234.567', 'comma', 0)).toBe(1234567);
            expect(parseAmountInput('1234', 'dot', 0)).toBe(1234);
            expect(parseAmountInput('1234', 'comma', 0)).toBe(1234);
        });

        it('still rejects any fraction at all', () => {
            expect(parseAmountInput('12.50', 'dot', 0)).toBeNull();
            expect(parseAmountInput('1.23', 'dot', 0)).toBeNull();
            expect(parseAmountInput('12,50', 'comma', 0)).toBeNull();
            expect(parseAmountInput('1,23', 'comma', 0)).toBeNull();
        });
    });

    describe('decimals = 2 (unchanged)', () => {
        it('reads a lone group as grouping under the dot preference', () => {
            expect(parseAmountInput('1,234', 'dot', 2)).toBe(1234);
            expect(parseAmountInput('0,500', 'dot', 2)).toBe(500);
            expect(parseAmountInput('123,456', 'dot', 2)).toBe(123456);
            expect(parseAmountInput('1,000', 'dot', 2)).toBe(1000);
        });

        it('reads a lone group as grouping under the comma preference', () => {
            expect(parseAmountInput('1.234', 'comma', 2)).toBe(1234);
            expect(parseAmountInput('0.500', 'comma', 2)).toBe(500);
            expect(parseAmountInput('123.456', 'comma', 2)).toBe(123456);
            expect(parseAmountInput('1.000', 'comma', 2)).toBe(1000);
        });

        it('keeps grouped-with-fraction, multi-group and 2-digit fraction readings', () => {
            expect(parseAmountInput('2,000.50', 'dot', 2)).toBe(2000.5);
            expect(parseAmountInput('2.000,50', 'comma', 2)).toBe(2000.5);
            expect(parseAmountInput('1,234,567', 'dot', 2)).toBe(1234567);
            expect(parseAmountInput('1.234.567', 'comma', 2)).toBe(1234567);
            expect(parseAmountInput('12,50', 'dot', 2)).toBe(12.5);
            expect(parseAmountInput('12.50', 'comma', 2)).toBe(12.5);
            expect(parseAmountInput('1.23', 'dot', 2)).toBe(1.23);
            expect(parseAmountInput('1,23', 'comma', 2)).toBe(1.23);
        });

        it('still rejects a 3-digit fraction as over-precision', () => {
            expect(parseAmountInput('1.234', 'dot', 2)).toBeNull();
            expect(parseAmountInput('1,234', 'comma', 2)).toBeNull();
            expect(parseAmountInput('1234.567', 'dot', 2)).toBeNull();
            expect(parseAmountInput('1234,567', 'comma', 2)).toBeNull();
        });
    });

    describe('decimals = 3 (the decimal reading wins)', () => {
        it('reads a lone group as the fraction under the dot preference', () => {
            // Was 1234 - branch B1 claimed the body and stripped the separator.
            expect(parseAmountInput('1,234', 'dot', 3)).toBe(1.234);
            expect(parseAmountInput('1,000', 'dot', 3)).toBe(1);
        });

        it('reads a lone group as the fraction under the comma preference', () => {
            expect(parseAmountInput('1.234', 'comma', 3)).toBe(1.234);
            expect(parseAmountInput('1.000', 'comma', 3)).toBe(1);
        });

        it('reads a leading-zero body as the fraction, which grouping cannot explain', () => {
            // Not an ambiguous tie: no grouping convention writes a leading zero group.
            expect(parseAmountInput('0,500', 'dot', 3)).toBe(0.5);
            expect(parseAmountInput('0.500', 'comma', 3)).toBe(0.5);
        });

        it('reads a 3-digit integer part with a lone group as the fraction', () => {
            expect(parseAmountInput('123,456', 'dot', 3)).toBe(123.456);
            expect(parseAmountInput('123.456', 'comma', 3)).toBe(123.456);
        });

        it('reads a 4-digit integer part as the fraction (never was a valid group)', () => {
            expect(parseAmountInput('1234,567', 'dot', 3)).toBe(1234.567);
            expect(parseAmountInput('1234.567', 'comma', 3)).toBe(1234.567);
        });

        it('keeps grouping when the string carries BOTH separators', () => {
            expect(parseAmountInput('1,234.567', 'dot', 3)).toBe(1234.567);
            expect(parseAmountInput('1.234,567', 'comma', 3)).toBe(1234.567);
        });

        it('keeps grouping when the string carries SEVERAL groups', () => {
            expect(parseAmountInput('1,234,567', 'dot', 3)).toBe(1234567);
            expect(parseAmountInput('1.234.567', 'comma', 3)).toBe(1234567);
        });

        it('leaves plain bodies alone', () => {
            expect(parseAmountInput('1234', 'dot', 3)).toBe(1234);
            expect(parseAmountInput('1234', 'comma', 3)).toBe(1234);
            expect(parseAmountInput('1.23', 'dot', 3)).toBe(1.23);
            expect(parseAmountInput('1,23', 'comma', 3)).toBe(1.23);
        });

        it('round-trips parse(format(x)) === x, proving B1 was not over-narrowed', () => {
            for (const minor of [1500, 1234, 500, 1234567, 999]) {
                for (const profile of PROFILES) {
                    const rendered = formatAmount(minor, '', profile, 3);
                    expect(parseAndNormalizeAmount(rendered, profile, 3)).toBe(minor);
                }
            }
        });

        it('is untouched by the space profile: its own lone separator still reads as the fraction', () => {
            // The space profile's decimal character is a comma, so the tie-break
            // applies to it exactly as it does to the comma profile. Adding spaces
            // to the parser must not have widened or narrowed this.
            expect(parseAmountInput('1,234', 'space', 3)).toBe(1.234);
            expect(parseAmountInput('1,000', 'space', 3)).toBe(1);
            expect(parseAmountInput('0,500', 'space', 3)).toBe(0.5);
            expect(parseAmountInput('123,456', 'space', 3)).toBe(123.456);
            expect(parseAmountInput('1234,567', 'space', 3)).toBe(1234.567);
        });
    });
});
