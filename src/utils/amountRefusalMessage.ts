/**
 * Amount Refusal Copy
 *
 * Turns the cause of a refused amount into the sentence to show. The causes
 * come from normalizeAmount; this module owns nothing but the mapping.
 *
 * Three of the causes had no vocabulary anywhere in the bundles - nothing said
 * "this is not a number", "the field is empty", or "your currency has no room
 * for that fraction" - so they get shared keys. The fourth, an amount of zero,
 * is already stated at every refusal site, in each site's own words: a budget
 * limit and a transfer amount are not the same noun, and the existing sentences
 * say so. Those are reused rather than flattened into one.
 *
 * `t` is a parameter, as it is for the other helpers here: the copy belongs to
 * the caller's language, not to whatever the module-level instance last held.
 */

import type { TFunction } from 'i18next';

import type { AmountRefusalCause } from './normalizeAmount';

/** The causes no existing message states. */
export const SHARED_AMOUNT_ERROR_KEYS = {
    empty: 'common.amountErrors.empty',
    notANumber: 'common.amountErrors.notANumber',
    negative: 'common.amountErrors.negative',
    tooManyDecimals: 'common.amountErrors.tooManyDecimals',
} as const;

/**
 * The sentence for `cause`.
 *
 * `zeroMessageKey` is the site's own existing "greater than 0" copy.
 * `example` is the shape the field accepts - the same derived placeholder the
 * input shows - so the over-precision message tells the user what to type
 * instead of naming a digit count that no language pluralizes alike.
 *
 * @example amountRefusalMessage('zero', t, 'modals.transfer.invalidAmountMessage', '0')
 * @example amountRefusalMessage('tooManyDecimals', t, key, '0') -> "Enter the amount like 0"
 */
export function amountRefusalMessage(
    cause: AmountRefusalCause,
    t: TFunction,
    zeroMessageKey: string,
    example: string,
): string {
    if (cause === 'zero') return t(zeroMessageKey);
    if (cause === 'tooManyDecimals') {
        return t(SHARED_AMOUNT_ERROR_KEYS.tooManyDecimals, { example });
    }
    return t(SHARED_AMOUNT_ERROR_KEYS[cause]);
}
