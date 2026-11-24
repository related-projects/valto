/**
 * Compact amount suffixes - checked against CLDR through Node's ICU (V-128, pass 89)
 *
 * COMPACT_AMOUNT_TIERS is the app's own table; the app never calls Intl. This
 * suite uses Node's Intl.NumberFormat with notation 'compact' and compactDisplay
 * 'short' as a TEST-ONLY oracle: for every complete locale and every tier, each
 * sample power of ten inside the tier must carry the table's suffix (gap
 * included) in ICU's output, and the formatter must produce ICU's whole string
 * on samples where rounding and truncation cannot differ.
 *
 * At pass 89 (Node 25.2.1, ICU 78.1, CLDR 48) ICU agreed with the CLDR 49 chart
 * for all five locales; Spanish has no 10^9 suffix in either ("1000 M" at 10^9,
 * "mil M" from 10^10), and the table follows that (Owner answer, pass 89).
 *
 * One tier departs from CLDR on purpose: French has no 10^12 word in the app.
 * CLDR's "Bn" is not understood, so from 10^12 an amount stays in "Md" with its
 * thousands grouped, "1 000 Md" (REGISTRE C32, Owner decision 05/11). That tier
 * is listed in OWNER_DEVIATIONS and checked by its own test below, not by ICU.
 */

import { formatAmountCompactLarge } from '../../utils/formatAmount';
import { COMPACT_AMOUNT_TIERS, compactTiersForLanguage } from '../constants/compactAmountFormats';
import { COMPLETE_LANGUAGE_CODES } from '../constants/languages';

const icuCompact = (locale: string, value: number): string =>
    new Intl.NumberFormat(locale, { notation: 'compact', compactDisplay: 'short' }).format(value);

/** Everything after the leading signed number: the suffix with its gap. */
const icuSuffix = (locale: string, value: number): string =>
    icuCompact(locale, value).replace(/^-?[0-9.,]+/, '');

/** Profile whose decimal character matches the locale's: en writes a point, the rest a comma. */
const profileFor = (locale: string) => (locale === 'en' ? 'dot' as const : 'space' as const);

/**
 * Tiers that follow an Owner decision instead of CLDR, as "locale@fromExponent".
 * The ICU oracle skips them; each has a test of its own.
 */
const OWNER_DEVIATIONS = new Set(['fr@12']);

/** Each power of ten a tier covers, up to the next tier (three for the last). */
function tierExponents(locale: (typeof COMPLETE_LANGUAGE_CODES)[number], index: number): number[] {
    const tiers = COMPACT_AMOUNT_TIERS[locale];
    const from = tiers[index].fromExponent;
    const until = index + 1 < tiers.length ? tiers[index + 1].fromExponent : from + 3;
    const exponents: number[] = [];
    for (let e = from; e < until; e++) exponents.push(e);
    return exponents;
}

describe('COMPACT_AMOUNT_TIERS - shape', () => {
    it('has exactly the complete locales', () => {
        expect(Object.keys(COMPACT_AMOUNT_TIERS).sort()).toEqual([...COMPLETE_LANGUAGE_CODES].sort());
    });

    it('every locale starts at 10^6 and its tiers rise', () => {
        for (const locale of COMPLETE_LANGUAGE_CODES) {
            const tiers = COMPACT_AMOUNT_TIERS[locale];
            expect(tiers[0].fromExponent).toBe(6);
            for (let i = 0; i < tiers.length; i++) {
                expect(tiers[i].divisorExponent).toBeLessThanOrEqual(tiers[i].fromExponent);
                if (i > 0) expect(tiers[i].fromExponent).toBeGreaterThan(tiers[i - 1].fromExponent);
            }
        }
    });

    it('every locale reaches 10^12', () => {
        for (const locale of COMPLETE_LANGUAGE_CODES) {
            const tiers = COMPACT_AMOUNT_TIERS[locale];
            expect(tiers[tiers.length - 1].fromExponent).toBe(12);
        }
    });
});

describe('compactTiersForLanguage', () => {
    it('returns the table entry for each complete locale', () => {
        for (const locale of COMPLETE_LANGUAGE_CODES) {
            expect(compactTiersForLanguage(locale)).toBe(COMPACT_AMOUNT_TIERS[locale]);
        }
    });

    it('falls back to en for incomplete, unknown and missing codes', () => {
        for (const code of ['ar', 'zh', 'hi', 'bn', 'ur', 'xx', '', null, undefined]) {
            expect(compactTiersForLanguage(code)).toBe(COMPACT_AMOUNT_TIERS.en);
        }
    });

    it('reads the language subtag of a region-tagged code', () => {
        expect(compactTiersForLanguage('FR-ci')).toBe(COMPACT_AMOUNT_TIERS.fr);
        expect(compactTiersForLanguage('pt_BR')).toBe(COMPACT_AMOUNT_TIERS.pt);
    });
});

describe('COMPACT_AMOUNT_TIERS - ICU oracle', () => {
    it('precondition: the oracle has locale data for every complete locale', () => {
        for (const locale of COMPLETE_LANGUAGE_CODES) {
            expect(new Intl.NumberFormat(locale).resolvedOptions().locale).toBe(locale);
        }
    });

    for (const locale of COMPLETE_LANGUAGE_CODES) {
        COMPACT_AMOUNT_TIERS[locale].forEach((tier, index) => {
            if (OWNER_DEVIATIONS.has(`${locale}@${tier.fromExponent}`)) return;

            it(`${locale} tier from 10^${tier.fromExponent}: suffix equals ICU's at every power of ten`, () => {
                for (const e of tierExponents(locale, index)) {
                    expect([e, icuSuffix(locale, 10 ** e)]).toEqual([e, tier.suffix]);
                }
            });

            it(`${locale} tier from 10^${tier.fromExponent}: whole string equals ICU's on exact samples`, () => {
                for (const e of tierExponents(locale, index)) {
                    for (const value of [10 ** e, 1.5 * 10 ** e, -(1.5 * 10 ** e)]) {
                        expect([value, formatAmountCompactLarge(value, '', profileFor(locale), 0, locale)])
                            .toEqual([value, icuCompact(locale, value)]);
                    }
                }
            });
        });
    }
});

describe('COMPACT_AMOUNT_TIERS - Owner deviations from CLDR', () => {
    it('C32: fr has no 10^12 word; from 10^12 the suffix stays Md, divided by 10^9 and grouped', () => {
        const fr = COMPACT_AMOUNT_TIERS.fr;
        const last = fr[fr.length - 1];
        expect(last.fromExponent).toBe(12);
        expect(last.divisorExponent).toBe(9);
        expect(last.suffix).toBe(fr[1].suffix);
        expect(last.groupHead).toBe(true);
        // What the deviation replaces: ICU still prints CLDR's word there.
        expect(icuSuffix('fr', 10 ** 12)).not.toBe(last.suffix);
    });

    it('C32: no other locale groups its head', () => {
        for (const locale of COMPLETE_LANGUAGE_CODES) {
            for (const tier of COMPACT_AMOUNT_TIERS[locale]) {
                if (OWNER_DEVIATIONS.has(`${locale}@${tier.fromExponent}`)) continue;
                expect([locale, tier.fromExponent, tier.groupHead ?? false]).toEqual([locale, tier.fromExponent, false]);
            }
        }
    });
});
