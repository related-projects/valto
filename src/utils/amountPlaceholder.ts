/**
 * Amount Placeholder Utility
 *
 * The hint shown in an empty amount field. It is DERIVED, never translated:
 * "0.00" is not an English sentence, it is a statement about the currency's
 * minor unit and the user's decimal character, and both of those are already
 * known wherever an amount is typed.
 *
 * A hardcoded "0.00" is not merely untranslated - it is wrong. On a 0-decimal
 * currency such as XOF the field advertised two decimal places that the parser
 * then refused, and on a 3-decimal currency such as KWD it understated what the
 * field would accept.
 *
 * The decimal character is read from NUMBER_FORMATS, the same table
 * normalizeAmount parses with and formatAmount renders with, so the hint cannot
 * promise a shape the parser rejects.
 */

import { NUMBER_FORMATS } from '../domain/constants/numberFormats';
import type { NumberFormatProfile } from '../domain/entities/Settings';

/**
 * Build the placeholder for a currency exponent and a number-format profile.
 *
 * Defaults match the rest of the amount utilities - 2 decimals, dot profile -
 * for ergonomics; production paths flow through useFormatting, which always
 * supplies both.
 *
 * @example amountPlaceholder(0, 'space') -> "0"
 * @example amountPlaceholder(2, 'dot')   -> "0.00"
 * @example amountPlaceholder(2, 'comma') -> "0,00"
 * @example amountPlaceholder(3, 'dot')   -> "0.000"
 */
export function amountPlaceholder(decimals = 2, profile: NumberFormatProfile = 'dot'): string {
    if (decimals <= 0) return '0';
    return `0${NUMBER_FORMATS[profile].decimal}${'0'.repeat(decimals)}`;
}
