/**
 * amountCapCases (test-only)
 *
 * The two currencies every V-128 entry-point suite runs: XOF (no minor unit,
 * the `space` profile a francophone device derives) and USD (2 decimals, the
 * `dot` profile). The cap is restated here on purpose, as the number the owner
 * decided (REGISTRE V-128, decision 1), so the suites pin the decision rather
 * than whatever the production constant happens to hold.
 *
 * `max` is the cap as the user's screen renders it, produced by the production
 * formatter for that currency, never typed out by hand.
 */

import { getCurrencyByCode } from '../../src/domain/constants/currencies';
import type { NumberFormatProfile } from '../../src/domain/entities/Settings';
import { amountPlaceholder } from '../../src/utils/amountPlaceholder';
import { formatAmount } from '../../src/utils/formatAmount';

/** 999 999 999 999 minor units. */
export const CAP_MINOR = 999_999_999_999;

export interface CapCase {
    code: string;
    profile: NumberFormatProfile;
    decimals: number;
    /** The cap, typed the way a user of this currency would type it. */
    capInput: string;
    /** The cap plus one minor unit. */
    overInput: string;
    /** The amount field's keyboard once the currency's settings are loaded. */
    keyboardType: 'number-pad' | 'decimal-pad';
    /** The amount field's placeholder once the currency's settings are loaded. */
    placeholder: string;
    /** The cap, formatted as the screen formats amounts. */
    max: string;
}

function capCase(code: string, profile: NumberFormatProfile, capInput: string, overInput: string): CapCase {
    const { symbol, decimals } = getCurrencyByCode(code);
    return {
        code,
        profile,
        decimals,
        capInput,
        overInput,
        keyboardType: decimals === 0 ? 'number-pad' : 'decimal-pad',
        placeholder: amountPlaceholder(decimals, profile),
        max: formatAmount(CAP_MINOR, symbol, profile, decimals),
    };
}

export const CAP_CASES: CapCase[] = [
    capCase('XOF', 'space', '999999999999', '1000000000000'),
    capCase('USD', 'dot', '9999999999.99', '10000000000.00'),
];

/**
 * The refusal as a key-echo `t` renders it: the key, then its options as JSON.
 * The suites that mock react-i18next that way compare against this.
 */
export function echoedTooLarge(max: string): string {
    return `common.amountErrors.tooLarge ${JSON.stringify({ max })}`;
}
