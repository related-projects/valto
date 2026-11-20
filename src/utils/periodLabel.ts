/**
 * Period labels (REGISTRE C20 step 2, pass 98 item 6).
 *
 * With the default start day, 1, a period is a calendar month and keeps the
 * label it always had: the month name and the year, "November 2026", from the
 * same export.months keys the Export screen and the PDF use. With any other
 * start day a month name would be a claim the period does not match, so the
 * label is its first and last day: "20 Oct - 19 Nov 2026", and both years when
 * it crosses 1 January, "20 Dec 2025 - 19 Jan 2026".
 *
 * Every word comes from `t`, the caller's (fixed) translation function, never
 * from the device locale: short month names are bundle keys
 * (period.shortMonths), and the order of day, month and year is the bundle's
 * (period.dayMonth, period.range, period.rangeAcrossYears). Dates are read with
 * the local getters, like every Valto bucket (V-91).
 */

import type { TFunction } from 'i18next';
import { DEFAULT_PERIOD_START_DAY, parsePeriodKey, periodBounds, toPeriodKey } from '../domain/period';

/** Full month names, as the Reports navigator, the Export selector and the PDF title show them. */
const MONTH_KEYS = [
    'export.months.january', 'export.months.february', 'export.months.march',
    'export.months.april', 'export.months.may', 'export.months.june',
    'export.months.july', 'export.months.august', 'export.months.september',
    'export.months.october', 'export.months.november', 'export.months.december',
] as const;

const SHORT_MONTH_KEYS = [
    'period.shortMonths.jan', 'period.shortMonths.feb', 'period.shortMonths.mar',
    'period.shortMonths.apr', 'period.shortMonths.may', 'period.shortMonths.jun',
    'period.shortMonths.jul', 'period.shortMonths.aug', 'period.shortMonths.sep',
    'period.shortMonths.oct', 'period.shortMonths.nov', 'period.shortMonths.dec',
] as const;

/** "20 Oct", in the bundle's order. */
function dayAndMonth(date: Date, t: TFunction): string {
    return t('period.dayMonth', { day: date.getDate(), month: t(SHORT_MONTH_KEYS[date.getMonth()]) });
}

/** "20 Oct - 19 Nov 2026", or "20 Dec 2025 - 19 Jan 2026" when the two days are in different years. */
export function formatDateRange(start: Date, end: Date, t: TFunction): string {
    if (start.getFullYear() === end.getFullYear()) {
        return t('period.range', { start: dayAndMonth(start, t), end: dayAndMonth(end, t), year: end.getFullYear() });
    }
    return t('period.rangeAcrossYears', {
        start: dayAndMonth(start, t),
        startYear: start.getFullYear(),
        end: dayAndMonth(end, t),
        endYear: end.getFullYear(),
    });
}

/** The label of the period `key`: "November 2026" at start day 1, its dates otherwise. */
export function formatPeriodLabel(key: string, startDay: number, t: TFunction): string {
    if (startDay === DEFAULT_PERIOD_START_DAY) {
        const { year, month } = parsePeriodKey(key);
        return `${t(MONTH_KEYS[month - 1])} ${year}`;
    }
    const { start, end } = periodBounds(key, startDay);
    return formatDateRange(start, end, t);
}

/**
 * The span of a year's 12 periods, YYYY-01 to YYYY-12: null at start day 1,
 * where the year is the calendar year and its title says enough.
 */
export function formatYearPeriodsLabel(year: number, startDay: number, t: TFunction): string | null {
    if (startDay === DEFAULT_PERIOD_START_DAY) {
        return null;
    }
    const { start } = periodBounds(toPeriodKey({ year, month: 1 }), startDay);
    const { end } = periodBounds(toPeriodKey({ year, month: 12 }), startDay);
    return formatDateRange(start, end, t);
}
