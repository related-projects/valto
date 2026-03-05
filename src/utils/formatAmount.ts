/**
 * Centralized Monetary Formatting Utilities
 *
 * ALL monetary values in the app are stored as integers in minor units (cents).
 * These functions are the ONLY place where minor→major conversion happens for display.
 *
 * Rules:
 *  - Storage: always integer cents (e.g. 200050 = $2,000.50)
 *  - Input:   accept major units from user, convert with Math.round(Number(input) * 100)
 *  - Display: always call one of these functions — NEVER divide by 100 inline in components
 */

import type { DecimalSeparator } from '../data/services/settingsService';

/**
 * Apply decimal separator swap if needed.
 * comma format: 1,000.00 → 1.000,00
 */
function applyDecimalSeparator(formatted: string, separator: DecimalSeparator): string {
    if (separator === 'comma') {
        // Swap . and , by using placeholder
        return formatted
            .replace(/,/g, '#COMMA#')
            .replace(/\./g, ',')
            .replace(/#COMMA#/g, '.');
    }
    return formatted;
}

/**
 * Format a minor-unit integer for full display.
 *
 * @example formatAmount(200050)       → "$2,000.50"
 * @example formatAmount(-50)          → "-$0.50"
 * @example formatAmount(0)            → "$0.00"
 * @example formatAmount(99)           → "$0.99"
 * @example formatAmount(200055, '€')  → "€2,000.55"
 * @example formatAmount(200050, '$', 'comma') → "$2.000,50"
 */
export function formatAmount(
    amountMinor: number,
    currency = '$',
    separator: DecimalSeparator = 'dot',
): string {
    const major = amountMinor / 100;
    const sign = major < 0 ? '-' : '';
    const formatted = Math.abs(major).toLocaleString('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    });
    return `${sign}${currency}${applyDecimalSeparator(formatted, separator)}`;
}

/**
 * Format a minor-unit integer in compact form (for chart labels, etc.).
 *
 * @example formatAmountCompact(200000) → "$2.0k"
 * @example formatAmountCompact(50000)  → "$0.5k"
 */
export function formatAmountCompact(
    amountMinor: number,
    currency = '$',
    separator: DecimalSeparator = 'dot',
): string {
    const major = amountMinor / 100;
    const compact = (major / 1000).toFixed(1);
    const result = `${currency}${compact}k`;
    return separator === 'comma' ? result.replace('.', ',') : result;
}

/**
 * Format a minor-unit integer with no decimal places (whole-dollar display).
 *
 * @example formatAmountWhole(200050) → "$2,001"
 * @example formatAmountWhole(99)     → "$1"
 */
export function formatAmountWhole(
    amountMinor: number,
    currency = '$',
    separator: DecimalSeparator = 'dot',
): string {
    const major = amountMinor / 100;
    const formatted = Math.abs(major).toLocaleString('en-US', {
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
    });
    // Whole numbers only have comma grouping, swap to dot for comma separator
    return `${currency}${separator === 'comma' ? formatted.replace(/,/g, '.') : formatted}`;
}
