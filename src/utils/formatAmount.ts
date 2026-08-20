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
 * the three formatters below restates any of those four rules, so a convention is
 * changed in exactly one place. Grouping is inserted here rather than delegated to
 * toLocaleString: that call routes through the host ICU, whose output varies by
 * device, and the app needs a byte-stable string its own parser can re-read.
 */

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
 * Format a minor-unit integer in compact form (for chart labels, etc.).
 *
 * @example formatAmountCompact(200000) -> "$2.0k"
 * @example formatAmountCompact(50000)  -> "$0.5k"
 */
export function formatAmountCompact(
    amountMinor: number,
    currency = '$',
    profile: NumberFormatProfile = 'dot',
    decimals = 2,
): string {
    const major = amountMinor / 10 ** decimals;
    const compact = (major / 1000).toFixed(1).replace('.', NUMBER_FORMATS[profile].decimal);
    return attachSymbol(`${compact}k`, currency, profile);
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
