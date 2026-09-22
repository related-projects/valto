/**
 * V-70 expected phrases - a literal transcription of the fix brief's D6 table.
 *
 * These are the strings the recurrence label must render, hand-written from the
 * brief rather than derived from the implementation. That is the whole point: the
 * word forms now live in src/localization/recurrenceForms.ts, so a test that read
 * them from there would assert the table against itself and pass whatever it said.
 *
 * This is the one file in the change written with real accents and Cyrillic, so
 * that a reviewer can compare it to the brief line by line. Every other new file
 * stays ASCII, and the Step 4 non-ASCII check excludes this path by name.
 *
 * Intervals: 2, 5, 21 and 22 are the brief's own columns. 11 is added because the
 * brief states it must behave like 5 - in Russian it is the teens exception that a
 * naive n % 10 rule gets wrong.
 */

export type D6Language = 'en' | 'fr' | 'es' | 'pt' | 'ru';
export type D6Unit = 'day' | 'week' | 'month' | 'year';

export const D6_LANGUAGES: readonly D6Language[] = ['en', 'fr', 'es', 'pt', 'ru'];
export const D6_UNITS: readonly D6Unit[] = ['day', 'week', 'month', 'year'];
export const D6_INTERVALS = [2, 5, 11, 21, 22] as const;

export type D6Interval = (typeof D6_INTERVALS)[number];

export const D6_PHRASES: Record<D6Language, Record<D6Unit, Record<D6Interval, string>>> = {
    // English, and the fallback every partial bundle renders (D5).
    en: {
        day: { 2: 'Every 2 days', 5: 'Every 5 days', 11: 'Every 11 days', 21: 'Every 21 days', 22: 'Every 22 days' },
        week: { 2: 'Every 2 weeks', 5: 'Every 5 weeks', 11: 'Every 11 weeks', 21: 'Every 21 weeks', 22: 'Every 22 weeks' },
        month: { 2: 'Every 2 months', 5: 'Every 5 months', 11: 'Every 11 months', 21: 'Every 21 months', 22: 'Every 22 months' },
        year: { 2: 'Every 2 years', 5: 'Every 5 years', 11: 'Every 11 years', 21: 'Every 21 years', 22: 'Every 22 years' },
    },
    // French: the leading word agrees in gender, and "mois" is invariable.
    fr: {
        day: { 2: 'Tous les 2 jours', 5: 'Tous les 5 jours', 11: 'Tous les 11 jours', 21: 'Tous les 21 jours', 22: 'Tous les 22 jours' },
        week: { 2: 'Toutes les 2 semaines', 5: 'Toutes les 5 semaines', 11: 'Toutes les 11 semaines', 21: 'Toutes les 21 semaines', 22: 'Toutes les 22 semaines' },
        month: { 2: 'Tous les 2 mois', 5: 'Tous les 5 mois', 11: 'Tous les 11 mois', 21: 'Tous les 21 mois', 22: 'Tous les 22 mois' },
        year: { 2: 'Tous les 2 ans', 5: 'Tous les 5 ans', 11: 'Tous les 11 ans', 21: 'Tous les 21 ans', 22: 'Tous les 22 ans' },
    },
    // Spanish: "mes" pluralises to "meses", not "mess".
    es: {
        day: { 2: 'Cada 2 días', 5: 'Cada 5 días', 11: 'Cada 11 días', 21: 'Cada 21 días', 22: 'Cada 22 días' },
        week: { 2: 'Cada 2 semanas', 5: 'Cada 5 semanas', 11: 'Cada 11 semanas', 21: 'Cada 21 semanas', 22: 'Cada 22 semanas' },
        month: { 2: 'Cada 2 meses', 5: 'Cada 5 meses', 11: 'Cada 11 meses', 21: 'Cada 21 meses', 22: 'Cada 22 meses' },
        year: { 2: 'Cada 2 años', 5: 'Cada 5 años', 11: 'Cada 11 años', 21: 'Cada 21 años', 22: 'Cada 22 años' },
    },
    // Portuguese: same, "mês" pluralises to "meses".
    pt: {
        day: { 2: 'A cada 2 dias', 5: 'A cada 5 dias', 11: 'A cada 11 dias', 21: 'A cada 21 dias', 22: 'A cada 22 dias' },
        week: { 2: 'A cada 2 semanas', 5: 'A cada 5 semanas', 11: 'A cada 11 semanas', 21: 'A cada 21 semanas', 22: 'A cada 22 semanas' },
        month: { 2: 'A cada 2 meses', 5: 'A cada 5 meses', 11: 'A cada 11 meses', 21: 'A cada 21 meses', 22: 'A cada 22 meses' },
        year: { 2: 'A cada 2 anos', 5: 'A cada 5 anos', 11: 'A cada 11 anos', 21: 'A cada 21 anos', 22: 'A cada 22 anos' },
    },
    // Russian: three categories. 21 takes the singular, and the leading word goes
    // with it - masculine for day/month/year, feminine accusative for week.
    ru: {
        day: { 2: 'Каждые 2 дня', 5: 'Каждые 5 дней', 11: 'Каждые 11 дней', 21: 'Каждый 21 день', 22: 'Каждые 22 дня' },
        week: { 2: 'Каждые 2 недели', 5: 'Каждые 5 недель', 11: 'Каждые 11 недель', 21: 'Каждую 21 неделю', 22: 'Каждые 22 недели' },
        month: { 2: 'Каждые 2 месяца', 5: 'Каждые 5 месяцев', 11: 'Каждые 11 месяцев', 21: 'Каждый 21 месяц', 22: 'Каждые 22 месяца' },
        year: { 2: 'Каждые 2 года', 5: 'Каждые 5 лет', 11: 'Каждые 11 лет', 21: 'Каждый 21 год', 22: 'Каждые 22 года' },
    },
};

/**
 * D7 edge cases, for the day unit. These are NOT in the brief's D6 table: they
 * follow from D2's category rule applied to 0, -3 and NaN, and they are pinned
 * only so that "does not throw" cannot be satisfied by rendering nothing.
 *
 * Both languages put these in their "everything else" category: English by
 * `n !== 1`, Russian by the integer rule falling through to `many` (-3 % 10 is
 * -3, and every comparison against NaN is false).
 */
export const EDGE_PHRASES: Record<'en' | 'ru', Record<'zero' | 'negative' | 'nan', string>> = {
    en: { zero: 'Every 0 days', negative: 'Every -3 days', nan: 'Every NaN days' },
    ru: { zero: 'Каждые 0 дней', negative: 'Каждые -3 дней', nan: 'Каждые NaN дней' },
};
