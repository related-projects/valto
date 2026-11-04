/**
 * Entry Amount Validator
 *
 * The one rule for an amount coming in from the user (REGISTRE V-128): a
 * finite number no further from zero than MAX_ENTRY_AMOUNT_MINOR. The parser
 * applies it to what was typed, and the repositories apply it on the paths a
 * new amount is written by - create, and the edits that change an amount.
 *
 * It is deliberately NOT part of validateTransaction, validateWallet or
 * validateRecurringTransaction: the restore calls those on every row of a
 * file, and a value above the cap that a file already holds is restored as it
 * is (V-128 decision 1).
 */

import { MAX_ENTRY_AMOUNT_MINOR } from '../constants/amounts';

/** True if `value` (minor units) may be entered: finite and within the cap either side of zero. */
export function isEntryAmountWithinCap(value: number): boolean {
    return typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= MAX_ENTRY_AMOUNT_MINOR;
}
