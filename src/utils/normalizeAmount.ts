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
 *  - This module is the ONLY place where input->storage conversion should happen
 *
 * Parsing is the inverse of formatAmount and must accept exactly what it emits:
 * the dot profile renders "2,000.50", comma renders "2.000,50", space renders
 * "2<U+00A0>000,50". The separator characters are read from NUMBER_FORMATS rather
 * than restated here, so the two sides cannot drift apart. Callers pass the active
 * profile AND the currency's `decimals` exponent in; this module never reads
 * settings itself. `decimals` defaults to 2 for ergonomics; production paths flow
 * through useFormatting, which always supplies the exponent.
 */

import {
    GROUPING_SPACE_CLASS,
    GROUPING_SPACES_GLOBAL,
    NUMBER_FORMATS,
} from '../domain/constants/numberFormats';
import type { NumberFormatProfile } from '../domain/entities/Settings';

/**
 * Convert a major-unit amount to integer minor units.
 *
 * @example normalizeAmount(15.75)      -> 1575
 * @example normalizeAmount(1500)       -> 150000
 * @example normalizeAmount(0.5)        -> 50
 * @example normalizeAmount(1000, 0)    -> 1000
 * @example normalizeAmount(1.5, 3)     -> 1500
 */
export function normalizeAmount(majorUnits: number, decimals = 2): number {
    return Math.round(majorUnits * 10 ** decimals);
}

/** Escape a single separator character for use inside a RegExp source string. */
function escapeForRegExp(char: string): string {
    return char.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

interface ProfileSeparators {
    decimal: string;
    thousands: string;
    decimalRe: string;
    thousandsRe: string;
}

/**
 * Derived from NUMBER_FORMATS rather than restated, so the parser can never drift
 * from the characters the formatters emit.
 */
function separatorsFor(profile: NumberFormatProfile): ProfileSeparators {
    const { group, decimal } = NUMBER_FORMATS[profile];
    return {
        decimal,
        thousands: group,
        decimalRe: escapeForRegExp(decimal),
        thousandsRe: escapeForRegExp(group),
    };
}

const SEPARATORS: Record<NumberFormatProfile, ProfileSeparators> = {
    dot: separatorsFor('dot'),
    comma: separatorsFor('comma'),
    space: separatorsFor('space'),
};

/** True if the body carries any character that can only have meant grouping. */
const CONTAINS_GROUPING_SPACE = new RegExp(GROUPING_SPACE_CLASS);

/**
 * Shared tail of every parse branch: enforce the currency's fraction width, then
 * convert. `normalized` must already use '.' as its decimal point and carry no
 * grouping.
 */
function finishParse(sign: string, normalized: string, decimals: number): number | null {
    const dotIndex = normalized.indexOf('.');
    if (dotIndex !== -1 && normalized.length - dotIndex - 1 > decimals) return null;

    const parsed = Number(`${sign}${normalized}`);
    return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Parse a user-typed amount string into major units, honouring the active decimal
 * separator preference. Returns null for anything that is not a single clean number,
 * or that carries more fraction digits than the currency's `decimals` allows.
 *
 * Sign and magnitude are returned as typed - callers apply their own zero/negative
 * policy. Use parseAndNormalizeAmount instead when the rule is "positive amounts only".
 *
 * A thousands separator is only read as grouping where it forms a valid 3-digit group;
 * otherwise it is taken as the decimal point, so a comma-locale user typing "12,50"
 * under the default dot preference gets 12.5 rather than 12. The grouping rule is
 * exponent-AWARE for the one shape where the two readings collide: a lone group whose
 * digits would exactly fill the currency's fraction reads as the fraction, so at 3
 * decimals "1,234" is 1.234 and not 1234. See the tie-break comment at the branches.
 * Grouping still wins wherever the string is unambiguous - two separators, or several
 * groups - so parse(format(x)) === x holds at every exponent.
 *
 * @example parseAmountInput('12,50', 'dot')      -> 12.5
 * @example parseAmountInput('2.000,50', 'comma') -> 2000.5
 * @example parseAmountInput('1,000', 'dot')      -> 1000
 * @example parseAmountInput('1,234', 'dot', 3)   -> 1.234 (lone group fills the fraction)
 * @example parseAmountInput('1,234.567', 'dot', 3) -> 1234.567 (two separators: grouping)
 * @example parseAmountInput('1,2,3', 'dot')      -> null
 * @example parseAmountInput('12.5', 'dot', 0)    -> null  (more fraction digits than allowed)
 * @example parseAmountInput('12.555', 'dot', 2)  -> null
 * @example parseAmountInput('2 000,50', 'space') -> 2000.5 (any space is grouping)
 */
export function parseAmountInput(
    input: string,
    profile: NumberFormatProfile = 'dot',
    decimals = 2,
): number | null {
    const trimmed = input.trim();
    if (trimmed === '') return null;

    const sign = /^[+-]/.test(trimmed) ? trimmed[0] : '';
    const body = sign ? trimmed.slice(1) : trimmed;
    const { decimal, thousands, decimalRe, thousandsRe } = SEPARATORS[profile];

    // A space is ALWAYS grouping. No writing convention puts a fraction after a
    // space, so U+0020, U+00A0 (what the space profile emits) and U+202F (what
    // French CLDR emits, so pasted text carries it) are accepted as grouping in
    // EVERY profile, and resolved here - before the tie-break below can run.
    // Routing spaces through this branch is what keeps the tie-break untouched:
    // a space can never reach it, so it can never be read as a decimal point.
    // A space that does not form valid groups is not a number at all, so this
    // branch rejects rather than falling through to the character-based rules.
    if (CONTAINS_GROUPING_SPACE.test(body)) {
        const spaceGrouped = new RegExp(
            `^\\d{1,3}(?:${GROUPING_SPACE_CLASS}\\d{3})+(?:${decimalRe}\\d*)?$`,
        );
        if (!spaceGrouped.test(body)) return null;
        const withoutGrouping = body.replace(GROUPING_SPACES_GLOBAL, '').split(decimal).join('.');
        return finishParse(sign, withoutGrouping, decimals);
    }

    // Tie-break: a body with a LONE grouping separator, no decimal separator, and exactly
    // `decimals` digits after it reads as a DECIMAL, not as grouping. This is a deliberate
    // decision, not an accident. Grouping is a writing convenience; the decimal separator
    // carries value. A user who means one thousand two hundred thirty-four can always type
    // "1234", whereas at 3 decimals a user who means 1.234 has no other way to express it
    // with their keyboard's separator. Grouping stays authoritative wherever the string is
    // unambiguous: two separators ("1,234.567") and several groups ("1,234,567") both still
    // take the grouping branch below. The grouping branch only ever claims a trailing run of
    // exactly 3 digits, so this can only divert input at decimals === 3 - it is a no-op for
    // 0- and 2-decimal currencies.
    const loneGroupIsFraction = new RegExp(`^\\d{1,3}${thousandsRe}\\d{${decimals}}$`).test(body);

    let cleaned: string | null = null;
    if (!loneGroupIsFraction && new RegExp(`^\\d{1,3}(?:${thousandsRe}\\d{3})+(?:${decimalRe}\\d*)?$`).test(body)) {
        cleaned = body.split(thousands).join('').split(decimal).join('.');
    } else if (new RegExp(`^(?:\\d+(?:${decimalRe}\\d*)?|${decimalRe}\\d+)$`).test(body)) {
        cleaned = body.split(decimal).join('.');
    } else if (new RegExp(`^(?:\\d+(?:${thousandsRe}\\d*)?|${thousandsRe}\\d+)$`).test(body)) {
        // Not a valid group, so the grouping character can only have been meant as a decimal.
        cleaned = body.split(thousands).join('.');
    }
    if (cleaned === null) return null;

    return finishParse(sign, cleaned, decimals);
}

/**
 * Parse a string input and convert to integer minor units.
 * Returns null if the input is not a valid positive number for the currency.
 *
 * @example parseAndNormalizeAmount('15.75')          -> 1575
 * @example parseAndNormalizeAmount('12,50', 'comma') -> 1250
 * @example parseAndNormalizeAmount('1000', 'dot', 0) -> 1000
 * @example parseAndNormalizeAmount('1.5', 'dot', 3)  -> 1500
 * @example parseAndNormalizeAmount('abc')            -> null
 * @example parseAndNormalizeAmount('-5')             -> null
 * @example parseAndNormalizeAmount('')               -> null
 */
export function parseAndNormalizeAmount(
    input: string,
    profile: NumberFormatProfile = 'dot',
    decimals = 2,
): number | null {
    const parsed = parseAmountInput(input, profile, decimals);
    if (parsed === null || parsed <= 0) return null;
    return normalizeAmount(parsed, decimals);
}

/**
 * Convert minor units back to major units for display in input fields.
 *
 * @example centsToMajor(1575)      -> 15.75
 * @example centsToMajor(150000)    -> 1500
 * @example centsToMajor(1000, 0)   -> 1000
 * @example centsToMajor(1500, 3)   -> 1.5
 */
export function centsToMajor(minorUnits: number, decimals = 2): number {
    return minorUnits / 10 ** decimals;
}
