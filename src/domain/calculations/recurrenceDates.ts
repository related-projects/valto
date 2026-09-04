/**
 * Recurrence Date Arithmetic
 *
 * Calendar-month stepping for recurring rules, in both directions.
 *
 * Why this exists: Date.setMonth / Date.setFullYear overflow silently. Asking for
 * "31 February" yields 3 March, so a rule anchored on day 29, 30 or 31 skips the short
 * month and stays permanently displaced to the overflow day. Every month step for a
 * recurring rule must go through addMonthsClamped instead.
 *
 * computeDueDates lives here rather than in the engine because the rules screen has to
 * answer "is anything pending for this rule" without running the engine, and the domain
 * layer may not import from src/data. The engine re-exports it, so its existing callers
 * are unaffected.
 */

import { RecurrenceFrequency, type RecurringTransaction } from '../entities/RecurringTransaction';

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

// --- Due-date computation ---------------------------------------------

/**
 * Strip time component from a Date (midnight UTC-style using local TZ).
 */
export function startOfDay(d: Date): Date {
    const result = new Date(d);
    result.setHours(0, 0, 0, 0);
    return result;
}

/**
 * Compute all due dates for a rule between lastGeneratedDate (exclusive) and today (inclusive).
 * Respects endDate if present.
 */
export function computeDueDates(
    rule: RecurringTransaction,
    today: Date,
): Date[] {
    const dates: Date[] = [];
    const fence = startOfDay(rule.lastGeneratedDate);
    const end = rule.endDate ? startOfDay(rule.endDate) : null;

    // Start from the rule's startDate and step forward
    const start = startOfDay(rule.startDate);
    let cursor = start;

    // Day of the month the rule is anchored on. Monthly and yearly steps re-derive the day
    // from this instead of from the cursor, so a month too short to hold it (February for a
    // day-31 rule) is clamped for that month only and the series returns to the anchor day.
    const anchorDay = start.getDate();

    // Safety limit to prevent infinite loops
    const MAX_ITERATIONS = 3650; // ~10 years of daily
    let iterations = 0;

    const todayFence = startOfDay(today);

    while (cursor.getTime() <= todayFence.getTime() && iterations < MAX_ITERATIONS) {
        iterations++;

        // Only include dates after the watermark
        if (cursor.getTime() > fence.getTime()) {
            // Respect endDate
            if (end && cursor.getTime() > end.getTime()) {
                break;
            }
            dates.push(new Date(cursor));
        }

        cursor = startOfDay(advanceDate(cursor, rule.frequency, rule.interval, anchorDay));
    }

    return dates;
}

/**
 * Advance a date by the given frequency and interval.
 *
 * `anchorDay` is the day of the month the rule is anchored on, taken from its startDate.
 * It has to be passed in: `date` is the previous occurrence, which may itself have been
 * clamped into a short month, so the original anchor day cannot be recovered from it.
 * Stepping from the clamped value would pin the whole series to 28 - the same drift bug in
 * a quieter form. Only the monthly and yearly branches need it; day and week steps cannot
 * overflow a month boundary.
 */
function advanceDate(
    date: Date,
    frequency: RecurrenceFrequency,
    interval: number,
    anchorDay: number,
): Date {
    const next = new Date(date);
    switch (frequency) {
        case RecurrenceFrequency.DAILY:
            next.setDate(next.getDate() + interval);
            break;
        case RecurrenceFrequency.WEEKLY:
            next.setDate(next.getDate() + 7 * interval);
            break;
        case RecurrenceFrequency.MONTHLY:
            return addMonthsClamped(date, interval, anchorDay);
        case RecurrenceFrequency.YEARLY:
            // A year is 12 months, so the yearly step gets the same clamping for free:
            // a 29 February anchor falls on 28 February in non-leap years and returns to
            // the 29th at the next leap year.
            return addMonthsClamped(date, 12 * interval, anchorDay);
    }
    return next;
}
