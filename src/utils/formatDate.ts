/**
 * Date Formatting Utility
 *
 * Formats dates according to the user's dateFormat setting.
 * Supports: DD/MM/YYYY, MM/DD/YYYY, YYYY-MM-DD
 */

import type { DateFormatPreference } from '../data/services/settingsService';

/**
 * Format a Date object according to the given format preference.
 *
 * @example formatDate(new Date('2026-03-05'), 'DD/MM/YYYY') → "05/03/2026"
 * @example formatDate(new Date('2026-03-05'), 'MM/DD/YYYY') → "03/05/2026"
 * @example formatDate(new Date('2026-03-05'), 'YYYY-MM-DD') → "2026-03-05"
 */
export function formatDate(date: Date, format: DateFormatPreference = 'MM/DD/YYYY'): string {
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = String(date.getFullYear());

    switch (format) {
        case 'DD/MM/YYYY':
            return `${day}/${month}/${year}`;
        case 'YYYY-MM-DD':
            return `${year}-${month}-${day}`;
        case 'MM/DD/YYYY':
        default:
            return `${month}/${day}/${year}`;
    }
}

/**
 * Format a Date object to show month and year only.
 *
 * @example formatMonthYear(new Date('2026-03-05')) → "March 2026"
 */
export function formatMonthYear(date: Date): string {
    return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}
