/**
 * Compact Amount Suffixes (REGISTRE V-128, pass 89)
 *
 * The suffixes a large amount takes in a tight place: "1,9 M", "2,5 Md". One
 * table per complete language, copied from the CLDR short decimal format of that
 * language and held here rather than read from Intl: the app formats amounts
 * with its own code, for the byte-stable output the header of formatAmount.ts
 * explains (V-128, decision 2: the app's own function).
 *
 * A tier reads CLDR's pattern for a magnitude: from 10^fromExponent the amount
 * is divided by 10^divisorExponent and followed by `suffix`. The two exponents
 * differ only where CLDR prints more than three integer digits - Spanish has no
 * 10^9 word, so 10^9 is "1000 M" and "mil M" starts at 10^10 (Owner answer,
 * pass 89: Spanish follows CLDR exactly). Each suffix carries CLDR's own gap,
 * U+00A0 or nothing.
 *
 * src/domain/__tests__/compactAmountFormats.test.ts checks every tier against
 * Node's ICU, which is used there as a test-only oracle.
 *
 * Non-ASCII characters are escapes so this file stays ASCII; the Cyrillic
 * suffixes are "mln", "mlrd" and "trln".
 */

import type { COMPLETE_LANGUAGE_CODES } from './languages';
import { NO_BREAK_SPACE } from './numberFormats';

export type CompleteLanguageCode = (typeof COMPLETE_LANGUAGE_CODES)[number];

export interface CompactTier {
    /** The tier applies from 10^fromExponent major units. */
    readonly fromExponent: number;
    /** The amount is shown divided by 10^divisorExponent. */
    readonly divisorExponent: number;
    /** Written after the digits, gap included. */
    readonly suffix: string;
}

/** Below 10^6 major units an amount is never compact (V-128, decision 2). */
export const COMPACT_AMOUNT_FROM_EXPONENT = 6;

const tier = (fromExponent: number, divisorExponent: number, suffix: string): CompactTier =>
    ({ fromExponent, divisorExponent, suffix });

/**
 * Ascending by fromExponent. Keyed by every complete language, so a bundle that
 * becomes complete does not compile until its suffixes are added here.
 * Incomplete bundles get nothing and fall back to en (compactTiersForLanguage).
 */
export const COMPACT_AMOUNT_TIERS: Record<CompleteLanguageCode, readonly CompactTier[]> = {
    en: [tier(6, 6, 'M'), tier(9, 9, 'B'), tier(12, 12, 'T')],
    es: [
        tier(6, 6, `${NO_BREAK_SPACE}M`),
        tier(10, 9, `${NO_BREAK_SPACE}mil${NO_BREAK_SPACE}M`),
        tier(12, 12, `${NO_BREAK_SPACE}B`),
    ],
    fr: [
        tier(6, 6, `${NO_BREAK_SPACE}M`),
        tier(9, 9, `${NO_BREAK_SPACE}Md`),
        tier(12, 12, `${NO_BREAK_SPACE}Bn`),
    ],
    pt: [
        tier(6, 6, `${NO_BREAK_SPACE}mi`),
        tier(9, 9, `${NO_BREAK_SPACE}bi`),
        tier(12, 12, `${NO_BREAK_SPACE}tri`),
    ],
    ru: [
        tier(6, 6, `${NO_BREAK_SPACE}\u043C\u043B\u043D`),
        tier(9, 9, `${NO_BREAK_SPACE}\u043C\u043B\u0440\u0434`),
        tier(12, 12, `${NO_BREAK_SPACE}\u0442\u0440\u043B\u043D`),
    ],
};

/**
 * The tiers for an app language code ("fr", or a tagged "fr-CI" / "pt_BR").
 * Anything that is not a complete language - a partial bundle, an unknown code,
 * nothing at all - gets en.
 */
export function compactTiersForLanguage(language: string | null | undefined): readonly CompactTier[] {
    const code = (language ?? '').split(/[-_]/)[0].toLowerCase();
    return Object.prototype.hasOwnProperty.call(COMPACT_AMOUNT_TIERS, code)
        ? COMPACT_AMOUNT_TIERS[code as CompleteLanguageCode]
        : COMPACT_AMOUNT_TIERS.en;
}
