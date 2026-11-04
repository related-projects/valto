/**
 * formatAmountCompactLarge - compact display of large amounts (REGISTRE V-128, pass 89)
 *
 * Owner decision 2 (04/11), option A: in tight places an amount whose absolute
 * value is at least 1 000 000 major units is shown compact - one tier per CLDR
 * short decimal pattern of the language, one decimal at most, TRUNCATED toward
 * zero, a trailing zero decimal dropped. Below 1 000 000 the output is exactly
 * formatAmount's. Only the number part changes: the decimal character and the
 * currency side and gap still come from the number-format profile.
 *
 * Spanish follows CLDR exactly (Owner answer, pass 89): CLDR es has no 10^9
 * suffix, so 10^9 to 10^10 stays in "M" with four integer digits, "mil M" starts
 * at 10^10 and "B" at 10^12.
 *
 * Expected strings are written out by hand from those rules. Non-ASCII characters
 * are escapes so this file stays ASCII:
 *   U+00A0 no-break space (profile gap, CLDR gap before the suffix)
 *   ru suffixes, Cyrillic, spelled by code point below
 */

import { formatAmount, formatAmountCompactLarge, formatAmountWhole, formatAmountWholeCompactLarge } from '../formatAmount';

const NBSP = '\u00A0';
/** "mln", "mlrd", "trln" in Cyrillic. */
const RU_MLN = '\u043C\u043B\u043D';
const RU_MLRD = '\u043C\u043B\u0440\u0434';
const RU_TRLN = '\u0442\u0440\u043B\u043D';

/** Major units at 0 decimals, no currency, French-style digits: isolates the number part. */
const bare = (major: number, language: string) => formatAmountCompactLarge(major, '', 'space', 0, language);

describe('formatAmountCompactLarge - threshold', () => {
    it('999 999 major units is exactly formatAmount output', () => {
        expect(formatAmountCompactLarge(99_999_999)).toBe('$999,999.99');
        expect(formatAmountCompactLarge(99_999_999)).toBe(formatAmount(99_999_999));
        expect(bare(999_999, 'fr')).toBe(`999${NBSP}999`);
    });

    it('below the threshold, every profile and language returns formatAmount output', () => {
        for (const profile of ['dot', 'comma', 'space'] as const) {
            for (const language of ['en', 'es', 'fr', 'pt', 'ru', 'ar']) {
                for (const amount of [0, 1, -1, 200050, -99_999_999, 99_999_999]) {
                    expect(formatAmountCompactLarge(amount, 'EUR', profile, 2, language))
                        .toBe(formatAmount(amount, 'EUR', profile, 2));
                }
            }
        }
    });

    it('1 000 000 is the first compact value', () => {
        expect(bare(1_000_000, 'fr')).toBe(`1${NBSP}M`);
        expect(formatAmountCompactLarge(100_000_000)).toBe('$1M');
    });

    it('-999 999 is exact and -1 000 000 is compact', () => {
        expect(bare(-999_999, 'fr')).toBe(`-999${NBSP}999`);
        expect(bare(-1_000_000, 'fr')).toBe(`-1${NBSP}M`);
    });
});

describe('formatAmountCompactLarge - truncation toward zero', () => {
    it('1 999 999 -> 1,9 M', () => {
        expect(bare(1_999_999, 'fr')).toBe(`1,9${NBSP}M`);
    });

    it('999 999 999 -> 999,9 M', () => {
        expect(bare(999_999_999, 'fr')).toBe(`999,9${NBSP}M`);
    });

    it('-1 999 999 -> -1,9 M (toward zero, not away from it)', () => {
        expect(bare(-1_999_999, 'fr')).toBe(`-1,9${NBSP}M`);
        expect(formatAmountCompactLarge(-199_999_999)).toBe('-$1.9M');
    });

    it('drops a trailing zero decimal', () => {
        expect(bare(1_050_000, 'fr')).toBe(`1${NBSP}M`);
        expect(bare(-2_099_999, 'fr')).toBe(`-2${NBSP}M`);
        expect(bare(1_500_000, 'fr')).toBe(`1,5${NBSP}M`);
    });

    it('truncates the minor units too', () => {
        // 1 099 999.99 major: the first decimal of the millions is 0.
        expect(formatAmountCompactLarge(109_999_999)).toBe('$1M');
    });
});

describe('formatAmountCompactLarge - tiers per complete locale', () => {
    it('en: M, B, T, no gap', () => {
        expect(bare(1_000_000, 'en')).toBe('1M');
        expect(bare(999_999_999, 'en')).toBe('999,9M');
        expect(bare(1_000_000_000, 'en')).toBe('1B');
        expect(bare(999_999_999_999, 'en')).toBe('999,9B');
        expect(bare(1_000_000_000_000, 'en')).toBe('1T');
        expect(bare(1_500_000_000_000, 'en')).toBe('1,5T');
    });

    it('es: M up to 10^10 with four integer digits, then mil M, then B (CLDR exactly)', () => {
        expect(bare(1_000_000, 'es')).toBe(`1${NBSP}M`);
        expect(bare(999_999_999, 'es')).toBe(`999,9${NBSP}M`);
        expect(bare(1_000_000_000, 'es')).toBe(`1000${NBSP}M`);
        expect(bare(1_234_567_890, 'es')).toBe(`1234,5${NBSP}M`);
        expect(bare(9_999_999_999, 'es')).toBe(`9999,9${NBSP}M`);
        expect(bare(10_000_000_000, 'es')).toBe(`10${NBSP}mil${NBSP}M`);
        expect(bare(999_999_999_999, 'es')).toBe(`999,9${NBSP}mil${NBSP}M`);
        expect(bare(1_000_000_000_000, 'es')).toBe(`1${NBSP}B`);
    });

    it('fr: M, Md, Bn', () => {
        expect(bare(1_000_000, 'fr')).toBe(`1${NBSP}M`);
        expect(bare(1_000_000_000, 'fr')).toBe(`1${NBSP}Md`);
        expect(bare(2_500_000_000, 'fr')).toBe(`2,5${NBSP}Md`);
        expect(bare(1_000_000_000_000, 'fr')).toBe(`1${NBSP}Bn`);
    });

    it('pt: mi, bi, tri', () => {
        expect(bare(1_000_000, 'pt')).toBe(`1${NBSP}mi`);
        expect(bare(1_000_000_000, 'pt')).toBe(`1${NBSP}bi`);
        expect(bare(1_000_000_000_000, 'pt')).toBe(`1${NBSP}tri`);
    });

    it('ru: mln, mlrd, trln', () => {
        expect(bare(1_000_000, 'ru')).toBe(`1${NBSP}${RU_MLN}`);
        expect(bare(1_000_000_000, 'ru')).toBe(`1${NBSP}${RU_MLRD}`);
        expect(bare(1_000_000_000_000, 'ru')).toBe(`1${NBSP}${RU_TRLN}`);
    });

    it('an incomplete locale falls back to en suffixes', () => {
        for (const language of ['ar', 'zh', 'hi', 'bn', 'ur', 'xx', '']) {
            expect(bare(1_900_000, language)).toBe('1,9M');
            expect(bare(1_000_000_000, language)).toBe('1B');
            expect(bare(1_000_000_000_000, language)).toBe('1T');
        }
    });

    it('a region-tagged code resolves to its language', () => {
        expect(bare(1_000_000_000, 'fr-CI')).toBe(`1${NBSP}Md`);
        expect(bare(1_000_000_000, 'pt_BR')).toBe(`1${NBSP}bi`);
    });
});

describe('formatAmountCompactLarge - separator formats and currency placement', () => {
    const MINOR = 199_999_999; // 1 999 999.99 major at 2 decimals

    it('dot: decimal point, symbol before, flush', () => {
        expect(formatAmountCompactLarge(MINOR, '$', 'dot', 2, 'en')).toBe('$1.9M');
        expect(formatAmountCompactLarge(-MINOR, '$', 'dot', 2, 'en')).toBe('-$1.9M');
    });

    it('comma: decimal comma, symbol after a no-break space', () => {
        expect(formatAmountCompactLarge(MINOR, 'EUR', 'comma', 2, 'es')).toBe(`1,9${NBSP}M${NBSP}EUR`);
        expect(formatAmountCompactLarge(-MINOR, 'EUR', 'comma', 2, 'es')).toBe(`-1,9${NBSP}M${NBSP}EUR`);
    });

    it('space: decimal comma, symbol after a no-break space', () => {
        expect(formatAmountCompactLarge(1_999_999, 'FCFA', 'space', 0, 'fr')).toBe(`1,9${NBSP}M${NBSP}FCFA`);
    });

    it('the profile, not the language, picks the decimal character', () => {
        expect(formatAmountCompactLarge(MINOR, '$', 'dot', 2, 'fr')).toBe(`$1.9${NBSP}M`);
        expect(formatAmountCompactLarge(MINOR, '$', 'space', 2, 'en')).toBe(`1,9M${NBSP}$`);
    });

    it('the currency exponent sets where major units start', () => {
        // KWD, 3 decimals: 1 234 567.891 major.
        expect(formatAmountCompactLarge(1_234_567_891, 'KD', 'dot', 3, 'en')).toBe('KD1.2M');
        // Same minor units at 0 decimals are 1 234 567 891 major.
        expect(formatAmountCompactLarge(1_234_567_891, 'KD', 'dot', 0, 'en')).toBe('KD1.2B');
    });
});

describe('formatAmountCompactLarge - safe integer range', () => {
    it('Number.MAX_SAFE_INTEGER minor units at 0 decimals', () => {
        const out = formatAmountCompactLarge(Number.MAX_SAFE_INTEGER, '$', 'dot', 0, 'en');
        expect(out).toBe('$9007.1T');
        expect(out).not.toMatch(/e\+/i);
    });

    it('Number.MAX_SAFE_INTEGER minor units at 2 decimals', () => {
        const out = formatAmountCompactLarge(Number.MAX_SAFE_INTEGER, '$', 'dot', 2, 'en');
        expect(out).toBe('$90T');
        expect(out).not.toMatch(/e\+/i);
    });

    it('Number.MIN_SAFE_INTEGER minor units at 0 and 2 decimals', () => {
        expect(formatAmountCompactLarge(Number.MIN_SAFE_INTEGER, '$', 'dot', 0, 'en')).toBe('-$9007.1T');
        expect(formatAmountCompactLarge(Number.MIN_SAFE_INTEGER, '$', 'dot', 2, 'en')).toBe('-$90T');
    });

    it('the largest enterable amount (999 999 999 999 minor) at 0 and 2 decimals', () => {
        expect(formatAmountCompactLarge(999_999_999_999, 'FCFA', 'space', 0, 'fr')).toBe(`999,9${NBSP}Md${NBSP}FCFA`);
        expect(formatAmountCompactLarge(999_999_999_999, '$', 'dot', 2, 'en')).toBe('$9.9B');
    });

    it('a value that is not a safe integer is left to formatAmount', () => {
        expect(formatAmountCompactLarge(150_000_000.5)).toBe(formatAmount(150_000_000.5));
    });
});

describe('formatAmountWholeCompactLarge', () => {
    it('below 1 000 000 is exactly formatAmountWhole output', () => {
        expect(formatAmountWholeCompactLarge(200050)).toBe('$2,001');
        expect(formatAmountWholeCompactLarge(-99)).toBe('-$1');
        expect(formatAmountWholeCompactLarge(99_999_999)).toBe(formatAmountWhole(99_999_999));
    });

    it('from 1 000 000 is the same compact string as formatAmountCompactLarge', () => {
        expect(formatAmountWholeCompactLarge(199_999_999, '$', 'dot', 2, 'en')).toBe('$1.9M');
        expect(formatAmountWholeCompactLarge(1_999_999, 'FCFA', 'space', 0, 'fr')).toBe(`1,9${NBSP}M${NBSP}FCFA`);
    });
});
