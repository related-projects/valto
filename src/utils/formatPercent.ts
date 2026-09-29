/**
 * Percentage Formatting
 *
 * The digits of a percentage, written with the user's decimal character. Before
 * this, every percentage was a bare toFixed, which always prints a dot, while
 * the amounts beside it followed the stored number-format profile: one screen,
 * two conventions (registry V-95).
 *
 * The decimal character is read from NUMBER_FORMATS, the table formatAmount and
 * the parser use, so a percentage and an amount cannot disagree on it. Three
 * things are deliberately NOT done here:
 *  - no "%": the sign and any space before it belong to the language (the
 *    translated templates and the call sites), not to the number-format profile;
 *  - no grouping: a percentage above 999 is printed ungrouped, as before;
 *  - no rounding rule of its own: toFixed's, so each site keeps its precision.
 *
 * The value is taken on the 0-100 scale; a caller holding a 0-1 ratio scales it.
 */

import { NUMBER_FORMATS } from '../domain/constants/numberFormats';
import type { NumberFormatProfile } from '../domain/entities/Settings';

/**
 * Format a percentage value (0-100 scale) at a fixed number of fraction digits,
 * without the "%" sign.
 *
 * The profile defaults to dot for ergonomics, like the amount utilities;
 * production paths flow through useFormatting, which always supplies it.
 *
 * @example formatPercentNumber(12.5, 1, 'dot')   -> "12.5"
 * @example formatPercentNumber(12.5, 1, 'comma') -> "12,5"
 * @example formatPercentNumber(39.6, 0, 'space') -> "40"
 */
export function formatPercentNumber(
    value: number,
    digits: number,
    profile: NumberFormatProfile = 'dot',
): string {
    return value.toFixed(digits).replace('.', NUMBER_FORMATS[profile].decimal);
}
