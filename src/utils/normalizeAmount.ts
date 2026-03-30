/**
 * Amount Normalization Utilities
 *
 * Converts user-entered amounts (major units, e.g. dollars) to the system-wide
 * storage format: integer minor units (cents).
 *
 * Rules:
 *  - User inputs major units (e.g. 15.75)
 *  - System stores integer cents (e.g. 1575)
 *  - This module is the ONLY place where input→storage conversion should happen
 */

/**
 * Convert a major-unit amount to integer minor units (cents).
 *
 * @example normalizeAmount(15.75)  → 1575
 * @example normalizeAmount(1500)   → 150000
 * @example normalizeAmount(0.5)    → 50
 */
export function normalizeAmount(majorUnits: number): number {
    return Math.round(majorUnits * 100);
}

/**
 * Parse a string input and convert to integer minor units (cents).
 * Returns null if the input is not a valid positive number.
 *
 * @example parseAndNormalizeAmount('15.75')  → 1575
 * @example parseAndNormalizeAmount('abc')    → null
 * @example parseAndNormalizeAmount('-5')     → null
 * @example parseAndNormalizeAmount('')       → null
 */
export function parseAndNormalizeAmount(input: string): number | null {
    const parsed = parseFloat(input);
    if (isNaN(parsed) || parsed <= 0) return null;
    return normalizeAmount(parsed);
}

/**
 * Convert minor units (cents) back to major units for display in input fields.
 *
 * @example centsToMajor(1575)   → 15.75
 * @example centsToMajor(150000) → 1500
 */
export function centsToMajor(minorUnits: number): number {
    return minorUnits / 100;
}
