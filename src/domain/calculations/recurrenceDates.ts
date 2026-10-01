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

/** Safety limit on how many occurrences a walk visits (~10 years of daily). */
const MAX_ITERATIONS = 3650;

/**
 * Walk the rule's occurrences in order - occurrence k, 0-based from startDate - while
 * `keepGoing(date)` holds, and at most MAX_ITERATIONS of them. The one definition of the
 * series, shared by deriveLastGeneratedIndex and computeDueOccurrences so the two can never
 * number an occurrence differently. `visit` returns false to stop early.
 */
function walkOccurrences(
    rule: RecurringTransaction,
    keepGoing: (date: Date) => boolean,
    visit: (index: number, date: Date) => boolean,
): void {
    // Start from the rule's startDate and step forward
    const start = startOfDay(rule.startDate);
    let cursor = start;

    // Day of the month the rule is anchored on. Monthly and yearly steps re-derive the day
    // from this instead of from the cursor, so a month too short to hold it (February for a
    // day-31 rule) is clamped for that month only and the series returns to the anchor day.
    const anchorDay = start.getDate();

    for (let index = 0; index < MAX_ITERATIONS && keepGoing(cursor); index++) {
        if (!visit(index, cursor)) return;
        cursor = startOfDay(advanceDate(cursor, rule.frequency, rule.interval, anchorDay));
    }
}

/**
 * The number of the last occurrence whose day is on or before the day of lastGeneratedDate,
 * both read in the current zone; -1 when there is none.
 *
 * This is the interpretation the engine gave the watermark before the occurrence key existed
 * (register policy no. 10): an occurrence counted as generated when its local day was not
 * after the watermark's local day. Occurrence days strictly increase with their number, so
 * "number > this" and "day after the watermark's day" select the same occurrences, and a rule
 * given this number emits in an unchanged zone exactly what it emitted before. Verified by
 * migrationV7OccurrenceKey.test.ts - "migration v7: backfills each index so the first run
 * emits exactly what the unfixed engine would have".
 *
 * Used where a rule has no number yet: the v7 backfill and a restore from a file written
 * before it.
 */
export function deriveLastGeneratedIndex(rule: RecurringTransaction): number {
    return lastOccurrenceIndexOnOrBefore(rule, rule.lastGeneratedDate);
}

/** The number of the last occurrence whose local day is on or before the local day of `day`; -1 when none. */
export function lastOccurrenceIndexOnOrBefore(rule: RecurringTransaction, day: Date): number {
    const fence = startOfDay(day).getTime();
    return lastOccurrenceIndexWhile(rule, (date) => date.getTime() <= fence);
}

/** The number of the last occurrence whose local day is strictly before the local day of `day`; -1 when none. */
export function lastOccurrenceIndexBefore(rule: RecurringTransaction, day: Date): number {
    const fence = startOfDay(day).getTime();
    return lastOccurrenceIndexWhile(rule, (date) => date.getTime() < fence);
}

function lastOccurrenceIndexWhile(rule: RecurringTransaction, keepGoing: (date: Date) => boolean): number {
    let last = -1;
    walkOccurrences(rule, keepGoing, (index) => {
        last = index;
        return true;
    });
    return last;
}

/** The local day of occurrence `index`, or null when the walk does not reach it. */
export function occurrenceDate(rule: RecurringTransaction, index: number): Date | null {
    let found = null as Date | null;
    walkOccurrences(
        rule,
        () => true,
        (i, date) => {
            if (i !== index) return true;
            found = new Date(date);
            return false;
        },
    );
    return found;
}

/**
 * The last local day already settled for a rule, in the current zone: no occurrence of its
 * schedule on or before this day may be generated again (REGISTRE V-105). The later of:
 *
 *  - the day of occurrence lastGeneratedIndex. Read from the number, not from an instant, so a
 *    zone change cannot move it a day earlier: lastGeneratedDate is a local midnight of the zone
 *    that wrote it, and a zone further west reads it as the day before. Verified by
 *    recurringEditPauseForward.test.ts - "a1." to "a4.";
 *  - the local day of lastGeneratedDate, the last occurrence actually written. After a
 *    renumbering the number can name an earlier day of the new schedule than the last debit.
 *    Verified by recurringEditPauseForward.test.ts - "control: a paused rule edited twice on its
 *    due day (1 -> 2 -> 1) and resumed that day debits that day once".
 *
 * For a rule that has generated nothing, lastGeneratedDate is one interval before startDate, so
 * no occurrence falls on or before the day returned.
 */
export function lastSettledDay(rule: RecurringTransaction): Date {
    const index = rule.lastGeneratedIndex ?? deriveLastGeneratedIndex(rule);
    const watermark = startOfDay(rule.lastGeneratedDate);
    const byIndex = index >= 0 ? occurrenceDate(rule, index) : null;
    return byIndex !== null && byIndex.getTime() > watermark.getTime() ? byIndex : watermark;
}

/** One occurrence of a rule: its number from startDate, and its local day. */
export interface DueOccurrence {
    index: number;
    date: Date;
}

// --- The end of a rule ------------------------------------------------

/**
 * The number of a rule's last occurrence read from its end date in the current zone: the last
 * occurrence whose local day is on or before the local day of endDate, as the end was read
 * before the number existed. Only meaningful for a rule that has an endDate.
 *
 * Used where the end is chosen (create, an edit of the end or of the schedule) and where a
 * rule has no number yet: the v8 backfill and a restore from a file written before it.
 * Verified by migrationV8EndOccurrenceIndex.test.ts - "migration v8: each rule with an end gets
 * the number of its last occurrence...".
 */
export function deriveEndOccurrenceIndex(rule: RecurringTransaction & { endDate: Date }): number {
    return lastOccurrenceIndexOnOrBefore(rule, rule.endDate);
}

/**
 * The number of the last occurrence a rule may generate, or null when it has no end
 * (REGISTRE V-114, V-103, Owner decision 2 of 01/10).
 *
 * The end is the number fixed when the end date was chosen, not the end date read in the
 * current zone, so a zone change no longer adds or loses an occurrence. Verified by
 * recurringEndOccurrenceIndex.test.ts - "V-103 a." and "V-103 b.". endDate is what says
 * whether the rule has an end at all; the number is derived from it only for a rule that
 * does not carry one yet.
 */
export function endOccurrenceIndexOf(rule: RecurringTransaction): number | null {
    if (!rule.endDate) return null;
    return rule.endOccurrenceIndex ?? deriveEndOccurrenceIndex({ ...rule, endDate: rule.endDate });
}

/**
 * The end number for a rule as an edit saves it: kept when neither the end date nor the
 * schedule changes - the form sends the end date with every edit (RecurringRuleForm.tsx:164),
 * and an end that was not chosen again must not be read again in a zone the device may have
 * moved to - and derived from the end date in the current zone otherwise. A schedule change
 * renumbers every occurrence, so the end has to be read again in the new numbering.
 */
export function endOccurrenceIndexForEdit(
    existing: RecurringTransaction,
    updated: RecurringTransaction,
): number | undefined {
    if (!updated.endDate) return undefined;
    const sameEnd = existing.endDate !== undefined && existing.endDate.getTime() === updated.endDate.getTime();
    const sameSchedule =
        existing.frequency === updated.frequency &&
        existing.interval === updated.interval &&
        existing.startDate.getTime() === updated.startDate.getTime();
    if (sameEnd && sameSchedule && existing.endOccurrenceIndex !== undefined) {
        return existing.endOccurrenceIndex;
    }
    return deriveEndOccurrenceIndex({ ...updated, endDate: updated.endDate });
}

/**
 * Whether a rule still has an occurrence to generate: it has no end, or its last generated
 * occurrence is before its last one. A rule whose end day has passed with an occurrence still
 * due is not finished (REGISTRE V-114, Owner decision 1). Verified by
 * recurringEndOccurrenceIndex.test.ts - "V-114 a." and "control: a rule that generated
 * everything up to an end that has passed is Ended".
 */
export function hasOccurrencesLeft(rule: RecurringTransaction): boolean {
    const end = endOccurrenceIndexOf(rule);
    if (end === null) return true;
    return (rule.lastGeneratedIndex ?? deriveLastGeneratedIndex(rule)) < end;
}

/**
 * Every occurrence numbered after the rule's last generated one whose day is on or before
 * today (inclusive), in the current zone, up to the rule's last occurrence when it has an end.
 *
 * What was generated is read from lastGeneratedIndex, which no zone moves; lastGeneratedDate
 * is read only when a rule has no number yet. Verified by recurringOccurrenceKey.test.ts -
 * "zone shift: after a writer zone 6 h east, a second run writes no occurrence twice...".
 *
 * The end is a number too (endOccurrenceIndexOf), and today is no bound on it: an occurrence
 * due on or before the end is listed even after the end day (REGISTRE V-114, V-103).
 * Verified by recurringEndOccurrenceIndex.test.ts - "V-114 a." and "V-103 a.".
 */
export function computeDueOccurrences(
    rule: RecurringTransaction,
    today: Date,
): DueOccurrence[] {
    const occurrences: DueOccurrence[] = [];
    const lastIndex = rule.lastGeneratedIndex ?? deriveLastGeneratedIndex(rule);
    const end = endOccurrenceIndexOf(rule);
    const todayFence = startOfDay(today).getTime();

    walkOccurrences(
        rule,
        (date) => date.getTime() <= todayFence,
        (index, date) => {
            if (end !== null && index > end) {
                return false;
            }
            if (index > lastIndex) {
                occurrences.push({ index, date: new Date(date) });
            }
            return true;
        },
    );

    return occurrences;
}

/** The days of computeDueOccurrences, for callers that only price or count them. */
export function computeDueDates(
    rule: RecurringTransaction,
    today: Date,
): Date[] {
    return computeDueOccurrences(rule, today).map((occurrence) => occurrence.date);
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
