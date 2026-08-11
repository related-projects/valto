/**
 * Recurrence Date Arithmetic
 *
 * Calendar-month stepping for recurring rules, in both directions.
 *
 * Why this exists: Date.setMonth / Date.setFullYear overflow silently. Asking for
 * "31 February" yields 3 March, so a rule anchored on day 29, 30 or 31 skips the short
 * month and stays permanently displaced to the overflow day. Every month step for a
 * recurring rule must go through addMonthsClamped instead.
 */

/**
 * Number of days in the given month. `month` is 0-based (0 = January).
 *
 * Uses setFullYear rather than the `new Date(year, month, 0)` constructor because that
 * constructor maps years 0-99 onto 1900-1999.
 */
export function daysInMonth(year: number, month: number): number {
    const probe = new Date(0);
    // Day 0 of month+1 is the last day of `month`, and it normalizes month 12 to January
    // of the following year on its own.
    probe.setFullYear(year, month + 1, 0);
    return probe.getDate();
}

/**
 * Shift `base` by `months` calendar months and place the result on `anchorDay`.
 * `months` may be negative to step backwards.
 *
 * Clamping rule - deliberate, not an accident of the arithmetic:
 *
 * 1. When the target month is shorter than `anchorDay`, the result falls on the LAST DAY
 *    of that month. A rule due on the 31st is due on 28 (or 29) February, never skipped.
 * 2. The day is re-derived from `anchorDay` on every call, never carried over from `base`.
 *    That is what makes a clamp local to the short month: after February is clamped to the
 *    28th, March returns to the 31st instead of sticking at 28. Callers must therefore pass
 *    the rule's own anchor day (from its startDate), not `base.getDate()`, whenever `base`
 *    may itself be a clamped occurrence.
 *
 * The time-of-day components of `base` are preserved.
 */
export function addMonthsClamped(base: Date, months: number, anchorDay: number): Date {
    const result = new Date(base);
    // Park on day 1 first: the month shift itself can then never overflow, whatever day
    // `base` happens to sit on.
    result.setDate(1);
    result.setMonth(result.getMonth() + months);
    result.setDate(Math.min(anchorDay, daysInMonth(result.getFullYear(), result.getMonth())));
    return result;
}
