/**
 * Date Format Derivation (REGISTRE V-101)
 *
 * Pure: takes a locale tag, returns a DateFormatPreference. Same contract as
 * numberFormatForLocale in ./numberFormats - the impure device read lives in
 * ./languages (getDeviceLocale), and settingsService.getInitialSettings is the
 * one place the two are joined, on first launch only.
 */

import type { DateFormatPreference } from '../entities/Settings';

/**
 * Map a BCP 47 or POSIX locale tag ("en_US", "fr-CI", "zh-Hans-CN") to the date
 * format a user of that locale expects.
 *
 * The rule:
 *  - English with region US, or English with no region at all -> MM/DD/YYYY.
 *    US English is the month-first convention among the languages the app
 *    ships, and an English tag that names no region is CLDR's base `en`,
 *    which is the US convention.
 *  - No locale at all (null, empty, no language subtag) -> MM/DD/YYYY, the
 *    static default. Nothing is known, so nothing changes from what every
 *    install had before; getDeviceLanguage resolves to `en` on that path too.
 *  - Every other locale -> DD/MM/YYYY (V-101, Owner decision 1, pass 78).
 *
 * YYYY-MM-DD is never derived. It stays a choice made in Settings.
 */
export function dateFormatForLocale(locale: string | null | undefined): DateFormatPreference {
    if (!locale) return 'MM/DD/YYYY';

    const subtags = locale.replace(/_/g, '-').split('-');
    const language = (subtags[0] ?? '').toLowerCase();
    if (!language) return 'MM/DD/YYYY';

    // A region subtag is two letters or three digits; looking for that shape
    // skips a script subtag, as numberFormatForLocale does.
    const region = subtags.slice(1).find(part => /^[A-Za-z]{2}$/.test(part) || /^\d{3}$/.test(part));

    if (language === 'en' && (!region || region.toUpperCase() === 'US')) {
        return 'MM/DD/YYYY';
    }
    return 'DD/MM/YYYY';
}
