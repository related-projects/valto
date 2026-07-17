/**
 * Amount Normalization Utilities
 *
 * Converts user-entered amounts (major units, e.g. dollars) to the system-wide
 * storage format: integer minor units. The number of minor units per major unit
 * is per-currency (10^decimals), NOT a fixed 100.
 *
 * Rules:
 *  - User inputs major units (e.g. 15.75)
 *  - System stores integer minor units (e.g. 1575 at 2 decimals)
 *  - This module is the ONLY place where input→storage conversion should happen
 *
 * Parsing is the inverse of formatAmount and must accept exactly what it emits:
 * dot preference renders "2,000.50", comma preference renders "2.000,50". Callers
 * pass the active separator preference AND the currency's `decimals` exponent in;
 * this module never reads settings itself. `decimals` defaults to 2 for ergonomics;
 * production paths flow through useFormatting, which always supplies the exponent.
 */

import type { DecimalSeparator } from '../domain/entities/Settings';

/**
 * Convert a major-unit amount to integer minor units.
 *
 * @example normalizeAmount(15.75)      → 1575
 * @example normalizeAmount(1500)       → 150000
 * @example normalizeAmount(0.5)        → 50
 * @example normalizeAmount(1000, 0)    → 1000
 * @example normalizeAmount(1.5, 3)     → 1500
 */
export function normalizeAmount(majorUnits: number, decimals = 2): number {
    return Math.round(majorUnits * 10 ** decimals);
}

const SEPARATORS: Record<
    DecimalSeparator,
    { decimal: string; thousands: string; decimalRe: string; thousandsRe: string }
> = {
    dot: { decimal: '.', thousands: ',', decimalRe: '\\.', thousandsRe: ',' },
    comma: { decimal: ',', thousands: '.', decimalRe: ',', thousandsRe: '\\.' },
};

/**
 * Parse a user-typed amount string into major units, honouring the active decimal
 * separator preference. Returns null for anything that is not a single clean number,
 * or that carries more fraction digits than the currency's `decimals` allows.
 *
 * Sign and magnitude are returned as typed — callers apply their own zero/negative
 * policy. Use parseAndNormalizeAmount instead when the rule is "positive amounts only".
 *
 * A thousands separator is only read as grouping where it forms a valid 3-digit group;
 * otherwise it is taken as the decimal point, so a comma-locale user typing "12,50"
 * under the default dot preference gets 12.5 rather than 12. This grouping rule is
 * exponent-blind by design: "1.500" means 1500 units in every currency (the decimal
 * separator, which formatAmount emits, always routes to the decimal branch).
 *
 * @example parseAmountInput('12,50', 'dot')      → 12.5
 * @example parseAmountInput('2.000,50', 'comma') → 2000.5
 * @example parseAmountInput('1,000', 'dot')      → 1000
 * @example parseAmountInput('1,2,3', 'dot')      → null
 * @example parseAmountInput('12.5', 'dot', 0)    → null  (more fraction digits than allowed)
 * @example parseAmountInput('12.555', 'dot', 2)  → null
 */
export function parseAmountInput(
    input: string,
    separator: DecimalSeparator = 'dot',
    decimals = 2,
): number | null {
    const trimmed = input.trim();
    if (trimmed === '') return null;

    const sign = /^[+-]/.test(trimmed) ? trimmed[0] : '';
    const body = sign ? trimmed.slice(1) : trimmed;
    const { decimal, thousands, decimalRe, thousandsRe } = SEPARATORS[separator];

    let cleaned: string | null = null;
    if (new RegExp(`^\\d{1,3}(?:${thousandsRe}\\d{3})+(?:${decimalRe}\\d*)?$`).test(body)) {
        cleaned = body.split(thousands).join('').split(decimal).join('.');
    } else if (new RegExp(`^(?:\\d+(?:${decimalRe}\\d*)?|${decimalRe}\\d+)$`).test(body)) {
        cleaned = body.split(decimal).join('.');
    } else if (new RegExp(`^(?:\\d+(?:${thousandsRe}\\d*)?|${thousandsRe}\\d+)$`).test(body)) {
        // Not a valid group, so the grouping character can only have been meant as a decimal.
        cleaned = body.split(thousands).join('.');
    }
    if (cleaned === null) return null;

    // Reject more fraction digits than the currency's minor unit allows.
    const dotIndex = cleaned.indexOf('.');
    if (dotIndex !== -1 && cleaned.length - dotIndex - 1 > decimals) return null;

    const parsed = Number(`${sign}${cleaned}`);
    return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Parse a string input and convert to integer minor units.
 * Returns null if the input is not a valid positive number for the currency.
 *
 * @example parseAndNormalizeAmount('15.75')          → 1575
 * @example parseAndNormalizeAmount('12,50', 'comma') → 1250
 * @example parseAndNormalizeAmount('1000', 'dot', 0) → 1000
 * @example parseAndNormalizeAmount('1.5', 'dot', 3)  → 1500
 * @example parseAndNormalizeAmount('abc')            → null
 * @example parseAndNormalizeAmount('-5')             → null
 * @example parseAndNormalizeAmount('')               → null
 */
export function parseAndNormalizeAmount(
    input: string,
    separator: DecimalSeparator = 'dot',
    decimals = 2,
): number | null {
    const parsed = parseAmountInput(input, separator, decimals);
    if (parsed === null || parsed <= 0) return null;
    return normalizeAmount(parsed, decimals);
}

/**
 * Convert minor units back to major units for display in input fields.
 *
 * @example centsToMajor(1575)      → 15.75
 * @example centsToMajor(150000)    → 1500
 * @example centsToMajor(1000, 0)   → 1000
 * @example centsToMajor(1500, 3)   → 1.5
 */
export function centsToMajor(minorUnits: number, decimals = 2): number {
    return minorUnits / 10 ** decimals;
}
