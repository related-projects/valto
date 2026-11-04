/**
 * Centralized Monetary Formatting Utilities
 *
 * ALL monetary values in the app are stored as integers in minor units. The number
 * of minor units per major unit is per-currency (10^decimals), NOT a fixed 100.
 * These functions are the ONLY place where minor->major conversion happens for display.
 *
 * Rules:
 *  - Storage: always integer minor units (e.g. 200050 = $2,000.50 at 2 decimals)
 *  - Input:   accept major units from user, convert with Math.round(Number(input) * 10^decimals)
 *  - Display: always call one of these functions - NEVER divide inline in components
 *
 * Callers pass the active currency's `decimals` exponent in; these functions never
 * read settings themselves. Defaults to 2 for ergonomics, but production paths flow
 * through useFormatting, which always supplies the registry exponent.
 *
 * Grouping character, decimal character, currency-symbol side and symbol gap all
 * come from one table - NUMBER_FORMATS in domain/constants/numberFormats. None of
 * the formatters below restates any of those four rules, so a convention is
 * changed in exactly one place. Grouping is inserted here rather than delegated to
 * toLocaleString: that call routes through the host ICU, whose output varies by
 * device, and the app needs a byte-stable string its own parser can re-read.
 */

import { COMPACT_AMOUNT_FROM_EXPONENT, compactTiersForLanguage } from '../domain/constants/compactAmountFormats';
import { NUMBER_FORMATS } from '../domain/constants/numberFormats';
import type { NumberFormatProfile } from '../domain/entities/Settings';

/**
 * Insert `group` before every run of three digits that ends on a group boundary.
 * Input must be integer digits only.
 */
function groupIntegerDigits(digits: string, group: string): string {
    return digits.replace(/\B(?=(?:\d{3})+$)/g, group);
}

/**
 * Render a non-negative magnitude with the profile's grouping and decimal
 * characters, at a fixed number of fraction digits.
 */
function renderDigits(magnitude: number, decimals: number, profile: NumberFormatProfile): string {
    const { group, decimal } = NUMBER_FORMATS[profile];
    const fixed = magnitude.toFixed(decimals);
    const pointIndex = fixed.indexOf('.');
    const integerPart = pointIndex === -1 ? fixed : fixed.slice(0, pointIndex);
    const fractionPart = pointIndex === -1 ? '' : fixed.slice(pointIndex + 1);
    const grouped = groupIntegerDigits(integerPart, group);
    return fractionPart ? `${grouped}${decimal}${fractionPart}` : grouped;
}

/**
 * Attach the currency symbol on the side the profile dictates, with the gap the
 * profile dictates.
 *
 * An empty symbol yields the bare digits: callers that format a plain number pass
 * '' and must not receive a dangling gap character.
 */
function attachSymbol(digits: string, currency: string, profile: NumberFormatProfile): string {
    if (currency === '') return digits;
    const { symbolPosition, symbolGap } = NUMBER_FORMATS[profile];
    return symbolPosition === 'prefix'
        ? `${currency}${symbolGap}${digits}`
        : `${digits}${symbolGap}${currency}`;
}

/**
 * Format a minor-unit integer for full display.
 *
 * The sign always leads, on either side of the symbol, so a negative amount reads
 * as negative before anything else.
 *
 * @example formatAmount(200050)                    -> "$2,000.50"
 * @example formatAmount(-50)                       -> "-$0.50"
 * @example formatAmount(0)                         -> "$0.00"
 * @example formatAmount(200055, 'EUR', 'comma')    -> "1.234,56<U+00A0>EUR" shape
 * @example formatAmount(200000, 'FCFA', 'space', 0) -> "2<U+00A0>000<U+00A0>FCFA" shape
 * @example formatAmount(1500, 'KD', 'dot', 3)      -> "KD1.500"
 */
export function formatAmount(
    amountMinor: number,
    currency = '$',
    profile: NumberFormatProfile = 'dot',
    decimals = 2,
): string {
    const major = amountMinor / 10 ** decimals;
    const sign = major < 0 ? '-' : '';
    const digits = renderDigits(Math.abs(major), decimals, profile);
    return `${sign}${attachSymbol(digits, currency, profile)}`;
}

/**
 * Format a minor-unit integer with no decimal places (whole-unit display).
 *
 * @example formatAmountWhole(200050) -> "$2,001"
 * @example formatAmountWhole(99)     -> "$1"
 * @example formatAmountWhole(-99)    -> "-$1"
 */
export function formatAmountWhole(
    amountMinor: number,
    currency = '$',
    profile: NumberFormatProfile = 'dot',
    decimals = 2,
): string {
    const major = amountMinor / 10 ** decimals;
    const sign = major < 0 ? '-' : '';
    const digits = renderDigits(Math.abs(major), 0, profile);
    return `${sign}${attachSymbol(digits, currency, profile)}`;
}

/**
 * The compact form of an amount of at least 1 000 000 major units, or null below
 * that (REGISTRE V-128, Owner decision 2, option A).
 *
 * Works on the decimal digits of the minor-unit integer, never on a quotient, so
 * it is exact for every safe integer and cannot produce scientific notation: the
 * major units are the digits before the last `decimals`, the tier comes from
 * their count, and the one decimal kept is the next digit. Dropping every digit
 * after it truncates the magnitude, so the result is truncated toward zero
 * whatever the sign. A zero decimal is dropped ("1 M", not "1,0 M").
 *
 * Only the number part differs from formatAmount: the decimal character, the
 * sign and the currency side and gap follow the same profile rules. The head
 * is never grouped - no in-range value has more than four digits there, and
 * CLDR does not group them either.
 *
 * Returns null for a value that is not a safe integer: amounts are integer minor
 * units, so such a value is not one, and the callers fall back to their exact
 * formatter rather than guess.
 */
function formatCompactLarge(
    amountMinor: number,
    currency: string,
    profile: NumberFormatProfile,
    decimals: number,
    language: string,
): string | null {
    if (!Number.isSafeInteger(amountMinor)) return null;

    const digits = String(Math.abs(amountMinor));
    const majorDigits = digits.slice(0, Math.max(0, digits.length - decimals));
    if (majorDigits.length <= COMPACT_AMOUNT_FROM_EXPONENT) return null;

    const exponent = majorDigits.length - 1;
    const tiers = compactTiersForLanguage(language);
    let tier = tiers[0];
    for (const candidate of tiers) {
        if (candidate.fromExponent <= exponent) tier = candidate;
    }

    const headLength = majorDigits.length - tier.divisorExponent;
    const head = majorDigits.slice(0, headLength);
    const firstDecimal = majorDigits.charAt(headLength);
    const fraction = firstDecimal === '0' ? '' : `${NUMBER_FORMATS[profile].decimal}${firstDecimal}`;

    const sign = amountMinor < 0 ? '-' : '';
    return `${sign}${attachSymbol(`${head}${fraction}${tier.suffix}`, currency, profile)}`;
}

/**
 * Format a minor-unit integer for a tight place (V-128, decision 2).
 *
 * Below 1 000 000 major units: exactly formatAmount's output. From there: the
 * compact form, with the suffixes of `language` (en for a language without a
 * complete bundle). Callers in tight places pair it with an accessibilityLabel
 * holding the formatAmount output, so a screen reader reads the exact amount.
 *
 * @example formatAmountCompactLarge(99999999)                       -> "$999,999.99"
 * @example formatAmountCompactLarge(199999999)                      -> "$1.9M"
 * @example formatAmountCompactLarge(-199999999)                     -> "-$1.9M"
 * @example formatAmountCompactLarge(1999999, 'FCFA', 'space', 0, 'fr') -> "1,9<U+00A0>M<U+00A0>FCFA" shape
 */
export function formatAmountCompactLarge(
    amountMinor: number,
    currency = '$',
    profile: NumberFormatProfile = 'dot',
    decimals = 2,
    language = 'en',
): string {
    return formatCompactLarge(amountMinor, currency, profile, decimals, language)
        ?? formatAmount(amountMinor, currency, profile, decimals);
}

/**
 * formatAmountCompactLarge for a place that shows whole units below 1 000 000:
 * exactly formatAmountWhole's output there, the same compact form from there.
 *
 * @example formatAmountWholeCompactLarge(200050)    -> "$2,001"
 * @example formatAmountWholeCompactLarge(199999999) -> "$1.9M"
 */
export function formatAmountWholeCompactLarge(
    amountMinor: number,
    currency = '$',
    profile: NumberFormatProfile = 'dot',
    decimals = 2,
    language = 'en',
): string {
    return formatCompactLarge(amountMinor, currency, profile, decimals, language)
        ?? formatAmountWhole(amountMinor, currency, profile, decimals);
}
