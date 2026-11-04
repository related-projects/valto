/**
 * Amount Limits
 *
 * The largest amount the app accepts when one is entered, in integer minor
 * units of the active currency: 999 999 999 999 (REGISTRE V-128, Owner
 * decision 1, 04/11). Above it a typed amount is refused with a message, and
 * the write paths that take a new amount refuse it too.
 *
 * It bounds ENTRY only. A restore and migration v5 take the values a file or
 * an older build already holds, as they are (V-128 decision 1; policies 14
 * and 10). Totals are not guaranteed exact beyond about 9 007 amounts at the
 * cap (V-128, decision 2): the cap keeps each amount exact, not every sum.
 *
 * It is well below Number.MAX_SAFE_INTEGER, so an amount at the cap, and the
 * cap plus one it is compared with, are both held exactly.
 */
export const MAX_ENTRY_AMOUNT_MINOR = 999_999_999_999;
