/**
 * Display Placeholders
 *
 * Rendered in place of a figure that is UNDEFINED for the period rather than zero:
 * a savings rate with no income to divide by has no value, and printing "0.0%"
 * would state a fact that was never measured. Zero itself is still printed as
 * zero - this is only for the absent case.
 *
 * Deliberately NOT a t() key. An em dash reads the same in every language the app
 * ships, and ten locale files do not need a key for a dash. It lives here rather
 * than inline in a component so the two summary cards on the Reports screen cannot
 * drift apart on which character they use.
 */

// The single deliberate non-ASCII literal in src. Sources are otherwise ASCII, so
// a future ASCII check whitelists THIS ONE LINE instead of hunting typographic
// punctuation across every component.
export const EMPTY_VALUE_PLACEHOLDER = '—'; // U+2014 EM DASH
