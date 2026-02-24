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

/**
 * Format a minor-unit integer for full display.
 *
 * @example formatAmount(200050)       → "$2,000.50"
 * @example formatAmount(-50)          → "-$0.50"
 * @example formatAmount(0)            → "$0.00"
 * @example formatAmount(99)           → "$0.99"
 * @example formatAmount(200055, '€')  → "€2,000.55"
 */
export function formatAmount(amountMinor: number, currency = '$'): string {
    const major = amountMinor / 100;
    const sign = major < 0 ? '-' : '';
    return `${sign}${currency}${Math.abs(major).toLocaleString('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    })}`;
}

/**
 * Format a minor-unit integer in compact form (for chart labels, etc.).
 *
 * @example formatAmountCompact(200000) → "$2.0k"
 * @example formatAmountCompact(50000)  → "$0.5k"
 */
export function formatAmountCompact(amountMinor: number, currency = '$'): string {
    const major = amountMinor / 100;
    return `${currency}${(major / 1000).toFixed(1)}k`;
}

/**
 * Format a minor-unit integer with no decimal places (whole-dollar display).
 *
 * @example formatAmountWhole(200050) → "$2,001"
 * @example formatAmountWhole(99)     → "$1"
 */
export function formatAmountWhole(amountMinor: number, currency = '$'): string {
    const major = amountMinor / 100;
    return `${currency}${Math.abs(major).toLocaleString('en-US', {
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
    })}`;
}
