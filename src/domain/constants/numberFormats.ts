/**
 * Number Format Profiles
 *
 * One profile per value of the persisted `decimalSeparator` setting. A profile
 * carries EVERY typographic decision a monetary string makes: the grouping
 * character, the decimal character, which side of the digits the currency symbol
 * sits on, and whether a gap separates the two.
 *
 * This table is the single source of truth for those four rules. formatAmount,
 * formatAmountCompact and formatAmountWhole read it and restate none of them;
 * the parser derives its separator set from it so it can always re-read what the
 * formatters write.
 *
 * Separator characters are non-ASCII by necessity. They are written as escapes so
 * this file stays ASCII, and referred to by code point in comments:
 *   U+0020 plain space
 *   U+00A0 no-break space        (what this app emits for space grouping)
 *   U+202F narrow no-break space (what French CLDR emits, so pasted text has it)
 */

import type { NumberFormatProfile } from '../entities/Settings';

/** No-break space, U+00A0. */
export const NO_BREAK_SPACE = '\u00A0';

/** Narrow no-break space, U+202F. */
export const NARROW_NO_BREAK_SPACE = '\u202F';

export type SymbolPosition = 'prefix' | 'suffix';

export interface NumberFormatDefinition {
    /** Character inserted between thousands groups. */
    group: string;
    /** Character separating the integer part from the fraction. */
    decimal: string;
    /** Which side of the digits the currency symbol sits on. */
    symbolPosition: SymbolPosition;
    /** Characters between symbol and digits. Empty string means the two are flush. */
    symbolGap: string;
}

/**
 * The three conventions the app can render.
 *
 * `dot` is byte-identical to what the app rendered before profiles existed, so
 * every existing install keeps the display it had.
 */
export const NUMBER_FORMATS: Record<NumberFormatProfile, NumberFormatDefinition> = {
    /** 1,234.56 and $1,234.56 - English convention, symbol flush against the digits. */
    dot: { group: ',', decimal: '.', symbolPosition: 'prefix', symbolGap: '' },
    /** 1.234,56 and 1.234,56<U+00A0>EUR - continental European convention. */
    comma: { group: '.', decimal: ',', symbolPosition: 'suffix', symbolGap: NO_BREAK_SPACE },
    /** 1<U+00A0>234,56 and 2<U+00A0>000<U+00A0>FCFA - French convention. */
    space: { group: NO_BREAK_SPACE, decimal: ',', symbolPosition: 'suffix', symbolGap: NO_BREAK_SPACE },
};

/** Profile used when nothing else resolves. Matches the pre-profile rendering. */
export const DEFAULT_NUMBER_FORMAT: NumberFormatProfile = 'dot';

export const NUMBER_FORMAT_PROFILES = Object.keys(NUMBER_FORMATS) as NumberFormatProfile[];

/**
 * RegExp character class matching any character a user may type or paste as a
 * GROUPING separator: U+0020, U+00A0, U+202F.
 *
 * No writing convention uses a space as a DECIMAL separator, so the parser can
 * treat all three as grouping in every profile without introducing ambiguity.
 */
export const GROUPING_SPACE_CLASS = '[\\u0020\\u00A0\\u202F]';

/** Global form of GROUPING_SPACE_CLASS, for stripping grouping out of a body. */
export const GROUPING_SPACES_GLOBAL = /[\u0020\u00A0\u202F]/g;

// --- Device locale derivation -----------------------------------------------
// Pure: takes a locale tag, returns a profile. The impure device read lives in
// domain/constants/languages (getDeviceLocale), which owns the NativeModules
// access. Keeping this side effect free is what makes it directly testable.

/**
 * Languages whose convention groups thousands with a space and uses a comma for
 * the decimal. The app normalises every one of them to U+00A0.
 */
const SPACE_GROUPING_LANGUAGES = new Set([
    'be', 'bg', 'cs', 'et', 'fi', 'fr', 'hu', 'kk', 'lt', 'lv',
    'nb', 'nn', 'no', 'pl', 'ru', 'sk', 'sv', 'uk',
]);

/** Languages that write 1.234,56 - dot groups, comma is the decimal. */
const COMMA_DECIMAL_LANGUAGES = new Set([
    'af', 'bs', 'ca', 'da', 'de', 'el', 'es', 'eu', 'gl', 'hr', 'id', 'is',
    'it', 'mk', 'nl', 'pt', 'ro', 'sl', 'sq', 'sr', 'tr', 'vi',
]);

/**
 * The few regions where the language default is wrong. Keyed by
 * "language-REGION" with the region upper-cased. Deliberately small: a locale
 * absent from here falls back to its language rule, which is right far more
 * often than it is wrong.
 */
const REGION_OVERRIDES: Record<string, NumberFormatProfile> = {
    // Latin American Spanish follows the English convention, unlike Spain.
    'es-MX': 'dot',
    'es-US': 'dot',
    // European Portuguese groups with a space; Brazilian Portuguese does not.
    'pt-PT': 'space',
    // Swiss German groups with an apostrophe and uses a dot decimal; of the three
    // profiles the app has, dot is the one that keeps the decimal point right.
    'de-CH': 'dot',
};

/**
 * Map a BCP 47 or POSIX locale tag ("fr", "fr-CI", "es_MX", "zh-Hans-CN") to a
 * number-format profile. Returns the default for anything unrecognised.
 */
export function numberFormatForLocale(locale: string | null | undefined): NumberFormatProfile {
    if (!locale) return DEFAULT_NUMBER_FORMAT;

    const subtags = locale.replace(/_/g, '-').split('-');
    const language = (subtags[0] ?? '').toLowerCase();
    if (!language) return DEFAULT_NUMBER_FORMAT;

    // A region subtag is two letters or three digits. Looking for that shape
    // rather than taking subtags[1] skips scripts, as in "zh-Hans-CN".
    const region = subtags.slice(1).find(part => /^[A-Za-z]{2}$/.test(part) || /^\d{3}$/.test(part));
    if (region) {
        const override = REGION_OVERRIDES[`${language}-${region.toUpperCase()}`];
        if (override) return override;
    }

    if (SPACE_GROUPING_LANGUAGES.has(language)) return 'space';
    if (COMMA_DECIMAL_LANGUAGES.has(language)) return 'comma';
    return DEFAULT_NUMBER_FORMAT;
}
