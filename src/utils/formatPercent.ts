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
 *  - no grouping: printed ungrouped, as before; the display sites never show
 *    more than 999 in digits (REGISTRE C28, below);
 *  - no rounding rule of its own: toFixed's, so each site keeps its precision.
 *
 * The value is taken on the 0-100 scale; a caller holding a 0-1 ratio scales it.
 */

import type { TFunction } from 'i18next';
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

// --- Beyond 999 % (REGISTRE C28) -------------------------------------------
// A percentage over a near-zero base grows without bound: a savings rate on an
// income of one minor unit printed "-99999999898,1%". Owner decisions 21/11,
// decision 1: beyond 999 in either direction a percentage is shown in words,
// "over 999%" / "below -999%"; within range it keeps its digits. The words are
// translated (common.percentOver / common.percentBelow) and, like the digits,
// carry no "%": the call sites and the insight templates append it.

/** The largest magnitude still shown in digits. */
export const PERCENT_DISPLAY_LIMIT = 999;

/** Which side of the range a percentage falls on, if outside it. */
export type PercentOutOfRange = 'over' | 'below';

/**
 * 'over' above 999, 'below' under -999 (infinities included), null from -999
 * to 999 inclusive. NaN is null: it is not a magnitude, and what to show for it
 * stays with the caller, as before.
 */
export function percentOutOfRange(value: number): PercentOutOfRange | null {
    if (value > PERCENT_DISPLAY_LIMIT) return 'over';
    if (value < -PERCENT_DISPLAY_LIMIT) return 'below';
    return null;
}

/** "over 999" / "below -999" in the language of `t`, without the "%". */
export function percentLimitText(range: PercentOutOfRange, t: TFunction): string {
    return range === 'over'
        ? t('common.percentOver', { limit: String(PERCENT_DISPLAY_LIMIT) })
        : t('common.percentBelow', { limit: `-${PERCENT_DISPLAY_LIMIT}` });
}

/**
 * Interpolation params for a template holding "{{percent}}%" (the insight
 * banners): the same object when `percent` is absent or within range, a copy
 * with `percent` replaced by the words when it is beyond 999. `percent` may be
 * a number or the string a domain function wrote with toFixed ("Infinity"
 * included).
 */
export function boundPercentParams<P extends Record<string, string | number>>(params: P, t: TFunction): P {
    if (!Object.prototype.hasOwnProperty.call(params, 'percent')) return params;
    const range = percentOutOfRange(Number(params.percent));
    return range ? ({ ...params, percent: percentLimitText(range, t) } as P) : params;
}
