/**
 * Period - the user's month (REGISTRE C20).
 *
 * Every "which month is this" question in Valto is answered here: the key a
 * transaction is filed under, the current key, a key's first and last moment,
 * the key before or after it, its number of days and how many of them have
 * passed. A period starts on a start day (1-31) of a calendar month and runs to
 * the day before the next period starts.
 *
 * C20 step 1: every caller passes DEFAULT_PERIOD_START_DAY (1), and with 1 a
 * period is exactly the calendar month the inline code computed before
 * (verified by src/domain/__tests__/period.test.ts, every day of 2024-2027).
 * The user setting is step 2.
 *
 * Rules:
 *  - Local time, like every Valto bucket (V-91). A Date is read only through
 *    getFullYear, getMonth and getDate - the getters tests/helpers/zoneClock
 *    moves into another zone - so a transaction is filed by the calendar of the
 *    device zone at the time it is read, as before.
 *  - The key is 'YYYY-MM': the calendar month the period STARTS in. With start
 *    day 1 that is the calendar month itself, so stored budgets.month values,
 *    the PDF file name and the closed-month gate keep their meaning.
 *  - Start days 29-31 clamp: in a month shorter than the start day, the period
 *    starts on that month's last day. Periods stay contiguous, 28 to 31 days
 *    long, and start day 31 means "the last day of the month". Example, start
 *    day 31: 2025-01 runs 31 Jan to 27 Feb, 2025-02 runs 28 Feb to 30 Mar.
 *  - Bounds are local Dates built with the local constructor, the end being
 *    23:59:59.999 of the last day (inclusive), as useExport built them. Like
 *    that constructor, years 0-99 are not supported.
 *  - Day counts are calendar arithmetic, never a difference of instants, so a
 *    DST change cannot move them.
 */

/** The start day every caller passes until the setting exists (C20 step 2), and the default after. */
export const DEFAULT_PERIOD_START_DAY = 1;

/** A period, named by the calendar month it starts in. */
export interface PeriodRef {
    readonly year: number;
    /** 1-12. */
    readonly month: number;
}

/** First and last moment of a period, local time, both inclusive. */
export interface PeriodBounds {
    readonly start: Date;
    readonly end: Date;
}

const MS_PER_DAY = 86_400_000;

const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

/** 'YYYY-MM'. The year is not padded, as the inline code did not pad it. */
const PERIOD_KEY = /^(\d+)-(\d{2})$/;

/** Whether `startDay` is a start day a period can have: an integer from 1 to 31. */
export function isValidPeriodStartDay(startDay: number): boolean {
    return Number.isInteger(startDay) && startDay >= 1 && startDay <= 31;
}

function assertStartDay(startDay: number): void {
    if (!isValidPeriodStartDay(startDay)) {
        throw new RangeError(`Invalid period start day: ${startDay}. Expected an integer from 1 to 31.`);
    }
}

function assertMonth(month: number): void {
    if (!Number.isInteger(month) || month < 1 || month > 12) {
        throw new RangeError(`Invalid month: ${month}. Expected an integer from 1 to 12.`);
    }
}

function isLeapYear(year: number): boolean {
    return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

/** Number of days in calendar month `month` (1-12) of `year`, Gregorian rule. */
export function daysInCalendarMonth(year: number, month: number): number {
    assertMonth(month);
    return month === 2 && isLeapYear(year) ? 29 : DAYS_IN_MONTH[month - 1];
}

/** The day of month (1-31) the period starting in `year`-`month` starts on: the start day, clamped. */
export function periodStartDayIn(year: number, month: number, startDay: number): number {
    assertStartDay(startDay);
    return Math.min(startDay, daysInCalendarMonth(year, month));
}

/** The 'YYYY-MM' key of a period. */
export function toPeriodKey(ref: PeriodRef): string {
    return `${ref.year}-${String(ref.month).padStart(2, '0')}`;
}

/** The period a 'YYYY-MM' key names. Throws a RangeError on anything else. */
export function parsePeriodKey(key: string): PeriodRef {
    const match = PERIOD_KEY.exec(key);
    const year = match ? Number(match[1]) : Number.NaN;
    const month = match ? Number(match[2]) : Number.NaN;
    if (!match || month < 1 || month > 12) {
        throw new RangeError(`Invalid period key: ${key}. Expected YYYY-MM.`);
    }
    return { year, month };
}

/** The key `n` periods after `key` (before it when `n` is negative). */
export function shiftPeriodKey(key: string, n: number): string {
    if (!Number.isInteger(n)) {
        throw new RangeError(`Invalid period shift: ${n}. Expected an integer.`);
    }
    const { year, month } = parsePeriodKey(key);
    const index = year * 12 + (month - 1) + n;
    const shiftedYear = Math.floor(index / 12);
    return toPeriodKey({ year: shiftedYear, month: index - shiftedYear * 12 + 1 });
}

/**
 * The period `date` falls in, read off its local calendar day.
 *
 * An invalid Date gives NaN fields, so its key ('NaN-NaN') matches no period,
 * as the inline key did.
 */
export function periodOf(date: Date, startDay: number): PeriodRef {
    assertStartDay(startDay);
    const year = date.getFullYear();
    const month = date.getMonth() + 1;

    // Start day 1: every day of a calendar month is in that month's period, and
    // the day is not read at all.
    if (startDay === 1 || Number.isNaN(month)) {
        return { year, month };
    }
    if (date.getDate() >= periodStartDayIn(year, month, startDay)) {
        return { year, month };
    }
    return month === 1 ? { year: year - 1, month: 12 } : { year, month: month - 1 };
}

/** The 'YYYY-MM' key of the period `date` falls in. */
export function periodKeyOf(date: Date, startDay: number): string {
    return toPeriodKey(periodOf(date, startDay));
}

/** The key of the period the device clock is in. */
export function currentPeriodKey(startDay: number, now: Date = new Date()): string {
    return periodKeyOf(now, startDay);
}

/** First moment (00:00:00.000 of its first day) and last moment (23:59:59.999 of its last day) of a period, local time. */
export function periodBounds(key: string, startDay: number): PeriodBounds {
    const { year, month } = parsePeriodKey(key);
    const next = parsePeriodKey(shiftPeriodKey(key, 1));
    const firstDay = periodStartDayIn(year, month, startDay);
    const nextFirstDay = periodStartDayIn(next.year, next.month, startDay);

    return {
        start: new Date(year, month - 1, firstDay),
        // Day `nextFirstDay - 1` of the next month; day 0 is the last day of
        // the month before, which the constructor normalizes on its own.
        end: new Date(next.year, next.month - 1, nextFirstDay - 1, 23, 59, 59, 999),
    };
}

/** A count of days for a calendar day, for differences between days (UTC arithmetic: no zone, no DST). */
function dayNumber(year: number, month: number, day: number): number {
    return Date.UTC(year, month - 1, day) / MS_PER_DAY;
}

/** Number of days in a period. */
export function daysInPeriod(key: string, startDay: number): number {
    const { year, month } = parsePeriodKey(key);
    const next = parsePeriodKey(shiftPeriodKey(key, 1));
    return dayNumber(next.year, next.month, periodStartDayIn(next.year, next.month, startDay))
        - dayNumber(year, month, periodStartDayIn(year, month, startDay));
}

/**
 * Days of the period that have begun by `now`, today included: 1 on its first
 * day. When `now` is outside the period, the whole period - the rule budgetPace
 * applied to the calendar month.
 */
export function daysElapsedInPeriod(key: string, startDay: number, now: Date = new Date()): number {
    const total = daysInPeriod(key, startDay);
    if (periodKeyOf(now, startDay) !== key) {
        return total;
    }
    const { year, month } = parsePeriodKey(key);
    const today = dayNumber(now.getFullYear(), now.getMonth() + 1, now.getDate());
    return today - dayNumber(year, month, periodStartDayIn(year, month, startDay)) + 1;
}
