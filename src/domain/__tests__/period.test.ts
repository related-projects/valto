import { dateInZone, installZoneClock, restoreZoneClock } from '../../../tests/helpers/zoneClock';
import {
    DEFAULT_PERIOD_START_DAY,
    currentPeriodKey,
    daysElapsedInPeriod,
    daysInCalendarMonth,
    daysInPeriod,
    isValidPeriodStartDay,
    parsePeriodKey,
    periodBounds,
    periodKeyOf,
    periodOf,
    periodStartDayIn,
    shiftPeriodKey,
    toPeriodKey,
} from '../period';

/**
 * The period module (REGISTRE C20, step 1).
 *
 * Step 1 moves every "which month is this" computation into src/domain/period
 * and calls it with a start day of 1. The first block proves that, with a
 * start day of 1, the module returns what the inline code it replaces returned
 * at 4443dce, for every day of 2024-2027: the oracles below are copies of that
 * inline code, not a second implementation of the module.
 *
 * Zones. The process zone cannot be set from a test (jest copies process.env),
 * so the blocks marked "process zone" are run under TZ=UTC, Africa/Lagos and
 * America/New_York; New York carries the DST changes. The blocks marked
 * "zone-explicit" use tests/helpers/zoneClock and assert the same thing under
 * any process zone.
 */

const LAGOS = 'Africa/Lagos';
const NEW_YORK = 'America/New_York';

const YEARS = [2024, 2025, 2026, 2027];

/** Local times tried on every day: midnight, inside the NY DST gap/overlap, noon, last millisecond. */
const TIMES: [number, number, number, number][] = [
    [0, 0, 0, 0],
    [1, 30, 0, 0],
    [2, 30, 0, 0],
    [12, 0, 0, 0],
    [23, 59, 59, 999],
];

const pad2 = (n: number): string => String(n).padStart(2, '0');

/** Local calendar day of `d`, 'YYYY-MM-DD', read through the local getters. */
const dayOf = (d: Date): string => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

/** Local noon of a calendar day; month is 1-12. */
const noon = (year: number, month: number, day: number): Date => new Date(year, month - 1, day, 12, 0, 0, 0);

// --- Oracles: the inline code each site ran at 4443dce -------------------

/** useBudgets.ts:120, useDashboard.ts:107, useReports.ts:188 and Budget.ts:112-117. */
function oldKeyOf(d: Date): string {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/** useReports.ts:97-104 shiftMonth. */
function oldShiftMonth(monthStr: string, delta: number): string {
    const [year, month] = monthStr.split('-').map(Number);
    let newMonth = month + delta;
    let newYear = year;
    while (newMonth > 12) { newMonth -= 12; newYear += 1; }
    while (newMonth < 1) { newMonth += 12; newYear -= 1; }
    return `${newYear}-${String(newMonth).padStart(2, '0')}`;
}

/** useDashboard.ts:49-58 getPreviousMonth. */
function oldPreviousMonth(currentMonthStr: string): string {
    const [year, month] = currentMonthStr.split('-').map(Number);
    let prevMonth = month - 1;
    let prevYear = year;
    if (prevMonth === 0) {
        prevMonth = 12;
        prevYear -= 1;
    }
    return `${prevYear}-${String(prevMonth).padStart(2, '0')}`;
}

/** ExportScreen.tsx:62-69 adjustMonth, as a pure function. */
function oldAdjustMonth(selectedYear: number, selectedMonth: number, delta: number): { year: number; month: number } {
    let m = selectedMonth + delta;
    let y = selectedYear;
    if (m > 12) { m = 1; y++; }
    if (m < 1) { m = 12; y--; }
    return { year: y, month: m };
}

/** useExport.ts:41-42. */
function oldPdfBounds(year: number, month: number): { start: Date; end: Date } {
    return {
        start: new Date(year, month - 1, 1),
        end: new Date(year, month, 0, 23, 59, 59, 999),
    };
}

/** TransactionExportService.ts:364-365 reportFileName, the 'YYYY-MM' part. */
function oldReportMonth(year: number, month: number): string {
    return `${year}-${String(month).padStart(2, '0')}`;
}

/** useFinancialInsights.ts:86-93 budgetPace day counts. */
function oldPaceDays(currentMonth: string, now: Date): { totalDays: number; daysElapsed: number } {
    const [year, month] = currentMonth.split('-').map(Number);
    const totalDays = new Date(year, month, 0).getDate();
    const inMonth = now.getFullYear() === year && now.getMonth() + 1 === month;
    const daysElapsed = inMonth ? now.getDate() : totalDays;
    return { totalDays, daysElapsed };
}

afterEach(() => {
    restoreZoneClock();
});

// --- 1. startDay 1 is the calendar month ---------------------------------

describe('startDay 1 returns what the replaced inline code returned, every day of 2024-2027 (process zone; run under TZ=UTC, Africa/Lagos, America/New_York)', () => {
    it('uses 1 as the default start day', () => {
        expect(DEFAULT_PERIOD_START_DAY).toBe(1);
    });

    it.each(YEARS)('every day and month of %i', (year) => {
        const mismatches: string[] = [];
        const check = (label: string, actual: unknown, expected: unknown): void => {
            if (actual !== expected) {
                mismatches.push(`${label}: got ${String(actual)}, expected ${String(expected)}`);
            }
        };

        for (let month = 1; month <= 12; month++) {
            const key = `${year}-${pad2(month)}`;

            // Key format, parse and the PDF file name part.
            check(`toPeriodKey ${key}`, toPeriodKey({ year, month }), oldReportMonth(year, month));
            check(`parsePeriodKey ${key} year`, parsePeriodKey(key).year, year);
            check(`parsePeriodKey ${key} month`, parsePeriodKey(key).month, month);

            // Shift: Reports navigation, the Dashboard's previous month, Export +-1.
            for (const delta of [-25, -13, -12, -1, 0, 1, 12, 13, 25]) {
                check(`shift ${key} ${delta}`, shiftPeriodKey(key, delta), oldShiftMonth(key, delta));
            }
            check(`previous ${key}`, shiftPeriodKey(key, -1), oldPreviousMonth(key));
            for (const delta of [-1, 1]) {
                const old = oldAdjustMonth(year, month, delta);
                const now = parsePeriodKey(shiftPeriodKey(toPeriodKey({ year, month }), delta));
                check(`export adjust ${key} ${delta}`, `${now.year}-${now.month}`, `${old.year}-${old.month}`);
            }

            // Bounds: the PDF query range, same instants.
            const bounds = periodBounds(key, 1);
            const oldBounds = oldPdfBounds(year, month);
            check(`start ${key}`, bounds.start.getTime(), oldBounds.start.getTime());
            check(`end ${key}`, bounds.end.getTime(), oldBounds.end.getTime());

            // Days: the budgetPace denominator.
            const totalDays = new Date(year, month, 0).getDate();
            check(`daysInPeriod ${key}`, daysInPeriod(key, 1), totalDays);
            check(`daysInCalendarMonth ${key}`, daysInCalendarMonth(year, month), totalDays);

            for (let day = 1; day <= totalDays; day++) {
                for (const [h, mi, s, ms] of TIMES) {
                    const date = new Date(year, month - 1, day, h, mi, s, ms);
                    const at = `${key}-${pad2(day)} ${h}:${mi}:${s}.${ms}`;

                    // The fixture really is on that calendar day (DST gap moves only the hour).
                    check(`fixture ${at}`, oldKeyOf(date), key);

                    check(`periodKeyOf ${at}`, periodKeyOf(date, 1), oldKeyOf(date));
                    check(`currentPeriodKey ${at}`, currentPeriodKey(1, date), oldKeyOf(date));
                    check(`periodOf year ${at}`, periodOf(date, 1).year, date.getFullYear());
                    check(`periodOf month ${at}`, periodOf(date, 1).month, date.getMonth() + 1);
                    check(`inside bounds ${at}`,
                        bounds.start.getTime() <= date.getTime() && date.getTime() <= bounds.end.getTime(), true);

                    // budgetPace, for the month of the clock and for the month before it.
                    check(`daysElapsed ${at}`,
                        daysElapsedInPeriod(key, 1, date), oldPaceDays(key, date).daysElapsed);
                    const previous = oldPreviousMonth(key);
                    check(`daysElapsed previous ${at}`,
                        daysElapsedInPeriod(previous, 1, date), oldPaceDays(previous, date).daysElapsed);
                }
            }
        }

        expect(mismatches).toEqual([]);
    });
});

// --- 2. Zone-explicit boundaries -----------------------------------------

describe('startDay 1 at month boundaries in a named zone (zone-explicit; holds under any process zone)', () => {
    it('files local 00:30 on 1 March in Lagos under March, and 23:59 on 28 February under February', () => {
        // 2026-02-28T23:30Z is 2026-03-01 00:30 in Lagos (UTC+1).
        expect(periodKeyOf(dateInZone(Date.UTC(2026, 1, 28, 23, 30), LAGOS), 1)).toBe('2026-03');
        // 2026-02-28T22:59Z is 2026-02-28 23:59 in Lagos.
        expect(periodKeyOf(dateInZone(Date.UTC(2026, 1, 28, 22, 59), LAGOS), 1)).toBe('2026-02');
    });

    it('files local 20:30 on 31 March in New York under March, and local midnight on 1 April under April', () => {
        // 2026-04-01T00:30Z is 2026-03-31 20:30 in New York (UTC-4).
        expect(periodKeyOf(dateInZone(Date.UTC(2026, 3, 1, 0, 30), NEW_YORK), 1)).toBe('2026-03');
        // 2026-04-01T04:00Z is 2026-04-01 00:00 in New York.
        expect(periodKeyOf(dateInZone(Date.UTC(2026, 3, 1, 4, 0), NEW_YORK), 1)).toBe('2026-04');
    });

    it('files both 01:30 of the repeated hour on 1 November 2026 in New York under November', () => {
        // DST ends at 02:00 EDT on 2026-11-01, the first day of the month.
        expect(periodKeyOf(dateInZone(Date.UTC(2026, 10, 1, 3, 59), NEW_YORK), 1)).toBe('2026-10'); // 23:59 EDT
        expect(periodKeyOf(dateInZone(Date.UTC(2026, 10, 1, 4, 0), NEW_YORK), 1)).toBe('2026-11'); // 00:00 EDT
        expect(periodKeyOf(dateInZone(Date.UTC(2026, 10, 1, 5, 30), NEW_YORK), 1)).toBe('2026-11'); // 01:30 EDT
        expect(periodKeyOf(dateInZone(Date.UTC(2026, 10, 1, 6, 30), NEW_YORK), 1)).toBe('2026-11'); // 01:30 EST
    });

    it.each([
        // [UTC instant of local 03:30 after the spring change, expected key]
        [Date.UTC(2024, 2, 10, 7, 30), '2024-03'],
        [Date.UTC(2025, 2, 9, 7, 30), '2025-03'],
        [Date.UTC(2026, 2, 8, 7, 30), '2026-03'],
        [Date.UTC(2027, 2, 14, 7, 30), '2027-03'],
        // [UTC instant of local 01:30 EST after the autumn change, expected key]
        [Date.UTC(2024, 10, 3, 6, 30), '2024-11'],
        [Date.UTC(2025, 10, 2, 6, 30), '2025-11'],
        [Date.UTC(2027, 10, 7, 6, 30), '2027-11'],
    ])('keeps New York DST change days in their month (%i)', (utcMs, expected) => {
        expect(periodKeyOf(dateInZone(utcMs, NEW_YORK), 1)).toBe(expected);
    });

    it('reads the current period off the device clock east of UTC', () => {
        installZoneClock(LAGOS, Date.UTC(2026, 1, 28, 23, 30));

        expect(currentPeriodKey(1)).toBe('2026-03');
        expect(daysElapsedInPeriod('2026-03', 1)).toBe(1);
    });

    it('reads the current period off the device clock west of UTC', () => {
        installZoneClock(NEW_YORK, Date.UTC(2026, 3, 1, 0, 30));

        expect(currentPeriodKey(1)).toBe('2026-03');
        expect(daysElapsedInPeriod('2026-03', 1)).toBe(31);
        expect(daysInPeriod('2026-03', 1)).toBe(31);
    });

    it('moves a start-day boundary with the zone, as a month boundary moves today', () => {
        // 2026-10-27T23:30Z is 28 October 00:30 in Lagos but still 27 October in UTC.
        expect(periodKeyOf(dateInZone(Date.UTC(2026, 9, 27, 23, 30), LAGOS), 28)).toBe('2026-10');
        expect(periodKeyOf(dateInZone(Date.UTC(2026, 9, 27, 23, 30), 'UTC'), 28)).toBe('2026-09');
    });
});

// --- 3. 29 February and month lengths ------------------------------------

describe('month lengths and 29 February', () => {
    it('knows the length of every month of a common year', () => {
        expect([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(m => daysInCalendarMonth(2025, m)))
            .toEqual([31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]);
    });

    it('applies the Gregorian leap rule', () => {
        expect(daysInCalendarMonth(2024, 2)).toBe(29);
        expect(daysInCalendarMonth(2025, 2)).toBe(28);
        expect(daysInCalendarMonth(1900, 2)).toBe(28);
        expect(daysInCalendarMonth(2000, 2)).toBe(29);
        expect(daysInCalendarMonth(2100, 2)).toBe(28);
    });

    it('gives February 2024 29 days with startDay 1, and files 29 February under it (process zone)', () => {
        expect(daysInPeriod('2024-02', 1)).toBe(29);
        expect(daysInPeriod('2025-02', 1)).toBe(28);
        expect(periodKeyOf(noon(2024, 2, 29), 1)).toBe('2024-02');
        expect(daysElapsedInPeriod('2024-02', 1, noon(2024, 2, 29))).toBe(29);
        expect(periodBounds('2024-02', 1).end.getTime()).toBe(new Date(2024, 1, 29, 23, 59, 59, 999).getTime());
        expect(periodKeyOf(new Date(2024, 2, 1, 0, 0, 0, 0), 1)).toBe('2024-03');
    });
});

// --- 4. The 29-31 clamp and other start days -----------------------------

describe('start days 29-31 clamp to the last day of a shorter month (process zone)', () => {
    it.each([
        // [startDay, year, month, effective start day]
        [31, 2025, 1, 31],
        [31, 2025, 2, 28],
        [31, 2024, 2, 29],
        [31, 2025, 4, 30],
        [30, 2025, 2, 28],
        [30, 2024, 2, 29],
        [29, 2025, 2, 28],
        [29, 2024, 2, 29],
        [28, 2025, 2, 28],
        [1, 2025, 2, 1],
    ])('startDay %i starts %i-%i on day %i', (startDay, year, month, expected) => {
        expect(periodStartDayIn(year, month, startDay)).toBe(expected);
    });

    it.each([
        // [startDay, key, first day, last day, days]
        [31, '2024-01', '2024-01-31', '2024-02-28', 29],
        [31, '2024-02', '2024-02-29', '2024-03-30', 31],
        [31, '2025-01', '2025-01-31', '2025-02-27', 28],
        [31, '2025-02', '2025-02-28', '2025-03-30', 31],
        [31, '2025-03', '2025-03-31', '2025-04-29', 30],
        [31, '2025-04', '2025-04-30', '2025-05-30', 31],
        [31, '2025-12', '2025-12-31', '2026-01-30', 31],
        [30, '2024-01', '2024-01-30', '2024-02-28', 30],
        [30, '2024-02', '2024-02-29', '2024-03-29', 30],
        [30, '2025-01', '2025-01-30', '2025-02-27', 29],
        [30, '2025-02', '2025-02-28', '2025-03-29', 30],
        [30, '2025-04', '2025-04-30', '2025-05-29', 30],
        [29, '2024-01', '2024-01-29', '2024-02-28', 31],
        [29, '2024-02', '2024-02-29', '2024-03-28', 29],
        [29, '2025-01', '2025-01-29', '2025-02-27', 30],
        [29, '2025-02', '2025-02-28', '2025-03-28', 29],
        [25, '2025-12', '2025-12-25', '2026-01-24', 31],
        [28, '2026-10', '2026-10-28', '2026-11-27', 31],
    ])('startDay %i: period %s runs %s to %s (%i days)', (startDay, key, first, last, days) => {
        const { start, end } = periodBounds(key, startDay);

        expect(dayOf(start)).toBe(first);
        expect([start.getHours(), start.getMinutes(), start.getSeconds(), start.getMilliseconds()]).toEqual([0, 0, 0, 0]);
        expect(dayOf(end)).toBe(last);
        expect([end.getHours(), end.getMinutes(), end.getSeconds(), end.getMilliseconds()]).toEqual([23, 59, 59, 999]);
        expect(daysInPeriod(key, startDay)).toBe(days);
    });

    it.each([
        // [startDay, year, month, day, key]
        [31, 2024, 2, 28, '2024-01'],
        [31, 2024, 2, 29, '2024-02'],
        [31, 2025, 2, 27, '2025-01'],
        [31, 2025, 2, 28, '2025-02'],
        [31, 2025, 3, 30, '2025-02'],
        [31, 2025, 3, 31, '2025-03'],
        [31, 2026, 1, 1, '2025-12'],
        [31, 2026, 1, 30, '2025-12'],
        [31, 2026, 1, 31, '2026-01'],
        [30, 2024, 2, 28, '2024-01'],
        [30, 2024, 2, 29, '2024-02'],
        [30, 2025, 2, 27, '2025-01'],
        [30, 2025, 2, 28, '2025-02'],
        [30, 2025, 3, 29, '2025-02'],
        [30, 2025, 3, 30, '2025-03'],
        [29, 2025, 2, 27, '2025-01'],
        [29, 2025, 2, 28, '2025-02'],
        [29, 2025, 3, 28, '2025-02'],
        [29, 2025, 3, 29, '2025-03'],
        [25, 2025, 12, 24, '2025-11'],
        [25, 2025, 12, 25, '2025-12'],
        [25, 2026, 1, 10, '2025-12'],
        [25, 2026, 1, 25, '2026-01'],
    ])('startDay %i files %i-%i-%i under %s', (startDay, year, month, day, key) => {
        expect(periodKeyOf(noon(year, month, day), startDay)).toBe(key);
        expect(periodKeyOf(new Date(year, month - 1, day, 0, 0, 0, 0), startDay)).toBe(key);
        expect(periodKeyOf(new Date(year, month - 1, day, 23, 59, 59, 999), startDay)).toBe(key);
    });

    it('names a period by the month it starts in, so a period crossing 1 January keeps the old year', () => {
        expect(periodOf(noon(2026, 1, 10), 25)).toEqual({ year: 2025, month: 12 });
    });

    it('places the Owner example (start day 28) as the brief describes', () => {
        // 19 November 2026 sits in the period that began on 28 October.
        expect(periodKeyOf(noon(2026, 11, 19), 28)).toBe('2026-10');
        expect(daysElapsedInPeriod('2026-10', 28, noon(2026, 11, 19))).toBe(23);
        // A salary paid early, on 25 November, falls in the period before the
        // official payday; one paid late, on 8 December, in the period after it.
        expect(periodKeyOf(noon(2026, 11, 25), 28)).toBe('2026-10');
        expect(periodKeyOf(noon(2026, 12, 8), 28)).toBe('2026-11');
    });

    it('counts the whole period as elapsed when the clock is outside it, as budgetPace does today', () => {
        expect(daysElapsedInPeriod('2026-10', 28, noon(2026, 12, 1))).toBe(31);
        expect(daysElapsedInPeriod('2026-12', 28, noon(2026, 11, 19))).toBe(daysInPeriod('2026-12', 28));
    });
});

describe('every start day 1-31 tiles 2024-2027 with contiguous periods (process zone)', () => {
    const START_DAYS = Array.from({ length: 31 }, (_, i) => i + 1);

    it.each(START_DAYS)('startDay %i', (startDay) => {
        const mismatches: string[] = [];
        const check = (label: string, ok: boolean): void => {
            if (!ok) mismatches.push(label);
        };

        // Every key whose period touches 2024-2027.
        for (let key = '2023-12'; key <= '2027-12'; key = shiftPeriodKey(key, 1)) {
            const { start, end } = periodBounds(key, startDay);
            const days = daysInPeriod(key, startDay);
            const { year, month } = parsePeriodKey(key);

            check(`${key} starts in its own month`, start.getFullYear() === year && start.getMonth() + 1 === month);
            check(`${key} starts on the effective day`, start.getDate() === periodStartDayIn(year, month, startDay));
            check(`${key} start is in ${key}`, periodKeyOf(start, startDay) === key);
            check(`${key} end is in ${key}`, periodKeyOf(end, startDay) === key);
            check(`${key} is followed by the next key`,
                periodKeyOf(new Date(end.getTime() + 1), startDay) === shiftPeriodKey(key, 1));
            check(`${key} has 28-31 days (${days})`, days >= 28 && days <= 31);
            check(`${key} elapsed on its last day`, daysElapsedInPeriod(key, startDay, end) === days);
            check(`${key} elapsed on its first day`, daysElapsedInPeriod(key, startDay, start) === 1);
            for (const n of [-25, -1, 1, 13]) {
                check(`${key} shift ${n} inverts`, shiftPeriodKey(shiftPeriodKey(key, n), -n) === key);
            }
        }

        // Every day of 2024-2027 sits inside the bounds of its own key.
        for (const year of YEARS) {
            for (let month = 1; month <= 12; month++) {
                for (let day = 1; day <= daysInCalendarMonth(year, month); day++) {
                    const date = noon(year, month, day);
                    const key = periodKeyOf(date, startDay);
                    const { start, end } = periodBounds(key, startDay);
                    const elapsed = daysElapsedInPeriod(key, startDay, date);

                    check(`${dayOf(date)} inside ${key}`, start.getTime() <= date.getTime() && date.getTime() <= end.getTime());
                    check(`${dayOf(date)} same key all day`,
                        periodKeyOf(new Date(year, month - 1, day, 0, 0, 0, 0), startDay) === key &&
                        periodKeyOf(new Date(year, month - 1, day, 23, 59, 59, 999), startDay) === key);
                    check(`${dayOf(date)} elapsed ${elapsed} in range`, elapsed >= 1 && elapsed <= daysInPeriod(key, startDay));
                }
            }
        }

        expect(mismatches).toEqual([]);
    });
});

// --- 5. Input checks ----------------------------------------------------

describe('input checks', () => {
    it('accepts integer start days 1 to 31 only', () => {
        expect(isValidPeriodStartDay(1)).toBe(true);
        expect(isValidPeriodStartDay(31)).toBe(true);
        for (const bad of [0, 32, -1, 1.5, Number.NaN]) {
            expect(isValidPeriodStartDay(bad)).toBe(false);
        }
    });

    it('refuses an invalid start day', () => {
        expect(() => periodKeyOf(noon(2026, 1, 1), 0)).toThrow(RangeError);
        expect(() => periodBounds('2026-01', 32)).toThrow(RangeError);
        expect(() => currentPeriodKey(1.5)).toThrow(RangeError);
        expect(() => daysInPeriod('2026-01', Number.NaN)).toThrow(RangeError);
        expect(() => periodStartDayIn(2026, 1, 0)).toThrow(RangeError);
    });

    it('refuses a malformed key or month', () => {
        for (const bad of ['2026-13', '2026-00', '2026-1', 'x', '', '2026-01-01']) {
            expect(() => parsePeriodKey(bad)).toThrow(RangeError);
        }
        expect(() => shiftPeriodKey('2026-01', 0.5)).toThrow(RangeError);
        expect(() => daysInCalendarMonth(2026, 13)).toThrow(RangeError);
    });

    it('gives an invalid Date a key no period has, as the replaced code did', () => {
        const invalid = new Date(Number.NaN);

        expect(periodKeyOf(invalid, 1)).toBe(oldKeyOf(invalid));
        expect(Number.isNaN(periodOf(invalid, 1).year)).toBe(true);
        expect(periodKeyOf(invalid, 28)).toBe('NaN-NaN');
    });
});
