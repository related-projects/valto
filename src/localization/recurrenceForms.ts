/**
 * Recurrence phrase forms - "Every 2 months", "Toutes les 2 semaines".
 *
 * WHY THIS IS NOT i18next PLURALISATION.
 *
 * i18next resolves plurals through Intl.PluralRules, and Hermes does not provide
 * that constructor (V-43). Its resolver does not fail loudly in that state: the
 * throw is caught, the "No Intl support" log is skipped because `typeof Intl` is
 * still "object", and every language silently falls back to a two-category rule
 * split at `count === 1` (audit V-70, Q2.3). Russian needs three categories and
 * takes the singular again at 21, so on a device that fallback is not a
 * degradation, it is a wrong answer with no warning attached.
 *
 * So the categories are decided here, by hand, and fed to i18next as a plain
 * interpolation formatter. Nothing on this path reads Intl.
 *
 * WHAT LIVES HERE, AND WHAT STAYS IN THE BUNDLES.
 *
 * The inflected words do, because a bundle can only hold one form per key and
 * these languages need up to three. The leading word comes with them: French and
 * Russian agree it with the unit's gender ("Tous les jours" but "Toutes les
 * semaines"), so it cannot be a fixed prefix in the bundle either. That is the
 * cost of this approach - a translator editing fr.json will not find these words
 * there. `recurring.frequencyEvery` and `recurring.freqDay`..`freqYear`, used
 * when the interval is 1, are untouched and still live in the bundles.
 *
 * Word forms below are written as plain characters, deliberately: they are
 * translations, and \u escapes would make them unreviewable.
 */

import { RecurrenceFrequency } from '../domain/entities/RecurringTransaction';

/** The unit a recurrence phrase is built around. */
export type RecurrenceUnitId = 'day' | 'week' | 'month' | 'year';

/**
 * Both call sites map their frequency through this rather than through a
 * translated word: the formatter needs to know WHICH unit it is inflecting, and
 * a translated noun cannot tell it.
 */
export const RECURRENCE_UNITS: Record<RecurrenceFrequency, RecurrenceUnitId> = {
    [RecurrenceFrequency.DAILY]: 'day',
    [RecurrenceFrequency.WEEKLY]: 'week',
    [RecurrenceFrequency.MONTHLY]: 'month',
    [RecurrenceFrequency.YEARLY]: 'year',
};

type PluralCategory = 'one' | 'few' | 'many' | 'other';

/** The two halves of the phrase that have to agree with the number. */
interface Cell {
    /** The leading word: "Every", "Toutes les", "Kazhduyu". */
    lead: string;
    /** The unit noun in the form that number requires. */
    word: string;
}

/**
 * `one` is required so that resolution can always terminate: a language declares
 * only the categories its rule can produce, and anything else falls back through
 * `other` to `one` rather than to undefined.
 */
interface UnitForms {
    one: Cell;
    few?: Cell;
    many?: Cell;
    other?: Cell;
}

interface LanguageForms {
    category: (n: number) => PluralCategory;
    units: Record<RecurrenceUnitId, UnitForms>;
}

/** English, French, Spanish and Portuguese: one form for 1, one for the rest. */
const oneOrOther = (n: number): PluralCategory => (n === 1 ? 'one' : 'other');

/**
 * The Russian integer rule. The teens are the exception that a bare `n % 10`
 * test gets wrong: 11 and 12 are `many`, not `one` and `few`.
 *
 * A negative or non-numeric interval falls through to `many` by arithmetic -
 * -3 % 10 is -3, and every comparison against NaN is false - so no guard is
 * needed for the form's unvalidated input (D7).
 */
const russianCategory = (n: number): PluralCategory => {
    const mod10 = n % 10;
    const mod100 = n % 100;
    if (mod10 === 1 && mod100 !== 11) return 'one';
    if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return 'few';
    return 'many';
};

const FORMS: Record<string, LanguageForms> = {
    en: {
        category: oneOrOther,
        units: {
            day: { one: { lead: 'Every', word: 'day' }, other: { lead: 'Every', word: 'days' } },
            week: { one: { lead: 'Every', word: 'week' }, other: { lead: 'Every', word: 'weeks' } },
            month: { one: { lead: 'Every', word: 'month' }, other: { lead: 'Every', word: 'months' } },
            year: { one: { lead: 'Every', word: 'year' }, other: { lead: 'Every', word: 'years' } },
        },
    },
    // "mois" is invariable, and "semaine" is feminine - the leading word follows it.
    fr: {
        category: oneOrOther,
        units: {
            day: { one: { lead: 'Chaque', word: 'jour' }, other: { lead: 'Tous les', word: 'jours' } },
            week: { one: { lead: 'Chaque', word: 'semaine' }, other: { lead: 'Toutes les', word: 'semaines' } },
            month: { one: { lead: 'Chaque', word: 'mois' }, other: { lead: 'Tous les', word: 'mois' } },
            year: { one: { lead: 'Chaque', word: 'an' }, other: { lead: 'Tous les', word: 'ans' } },
        },
    },
    // "mes" pluralises to "meses". Gluing an s on gave "mess".
    es: {
        category: oneOrOther,
        units: {
            day: { one: { lead: 'Cada', word: 'día' }, other: { lead: 'Cada', word: 'días' } },
            week: { one: { lead: 'Cada', word: 'semana' }, other: { lead: 'Cada', word: 'semanas' } },
            month: { one: { lead: 'Cada', word: 'mes' }, other: { lead: 'Cada', word: 'meses' } },
            year: { one: { lead: 'Cada', word: 'año' }, other: { lead: 'Cada', word: 'años' } },
        },
    },
    // Same for "mês" -> "meses".
    pt: {
        category: oneOrOther,
        units: {
            day: { one: { lead: 'A cada', word: 'dia' }, other: { lead: 'A cada', word: 'dias' } },
            week: { one: { lead: 'A cada', word: 'semana' }, other: { lead: 'A cada', word: 'semanas' } },
            month: { one: { lead: 'A cada', word: 'mês' }, other: { lead: 'A cada', word: 'meses' } },
            year: { one: { lead: 'A cada', word: 'ano' }, other: { lead: 'A cada', word: 'anos' } },
        },
    },
    // Three categories, and the leading word agrees with the noun at `one`:
    // masculine for day, month and year, feminine accusative for week.
    ru: {
        category: russianCategory,
        units: {
            day: {
                one: { lead: 'Каждый', word: 'день' },
                few: { lead: 'Каждые', word: 'дня' },
                many: { lead: 'Каждые', word: 'дней' },
            },
            week: {
                one: { lead: 'Каждую', word: 'неделю' },
                few: { lead: 'Каждые', word: 'недели' },
                many: { lead: 'Каждые', word: 'недель' },
            },
            month: {
                one: { lead: 'Каждый', word: 'месяц' },
                few: { lead: 'Каждые', word: 'месяца' },
                many: { lead: 'Каждые', word: 'месяцев' },
            },
            year: {
                one: { lead: 'Каждый', word: 'год' },
                few: { lead: 'Каждые', word: 'года' },
                many: { lead: 'Каждые', word: 'лет' },
            },
        },
    },
};

const isUnitId = (value: string): value is RecurrenceUnitId =>
    value === 'day' || value === 'week' || value === 'month' || value === 'year';

/**
 * ar, bn, hi, ur and zh carry no `recurring` section, so i18next hands them the
 * English string and calls this formatter with their own language code. They get
 * the English forms - and the English category rule with them, which is the only
 * pairing that can be right for an English sentence.
 *
 * The region subtag is dropped so that "ru-RU" resolves like "ru".
 */
const formsFor = (lng: string | undefined): LanguageForms =>
    FORMS[String(lng ?? 'en').split('-')[0].toLowerCase()] ?? FORMS.en;

const cellFor = (lng: string | undefined, unit: RecurrenceUnitId, interval: number): Cell => {
    const language = formsFor(lng);
    const forms = language.units[unit];
    return forms[language.category(interval)] ?? forms.other ?? forms.one;
};

/**
 * Every interpolation format spec this module implements.
 *
 * This array IS the dispatch list in recurrenceFormat below, and it is exported
 * so that tests/__tests__/noUnhandledFormatSpec.test.ts can hold the bundles to
 * it rather than to a second copy that could drift. The guard matters because
 * supplying `interpolation.format` means i18next never builds its own formatter
 * service: a bundle that asks for a spec nobody implements - `{{count, number}}`,
 * say - is not an error, it renders the raw value and says nothing.
 */
export const RECURRENCE_FORMAT_SPECS = ['recurrenceEvery', 'recurrenceUnit'] as const;

type RecurrenceFormatSpec = (typeof RECURRENCE_FORMAT_SPECS)[number];

const isRecurrenceFormatSpec = (format: string | undefined): format is RecurrenceFormatSpec =>
    (RECURRENCE_FORMAT_SPECS as readonly string[]).includes(format ?? '');

/**
 * i18next `interpolation.format` entry point. Two specs are understood:
 *
 *   {{unit, recurrenceEvery}}  the leading word
 *   {{unit, recurrenceUnit}}   the unit noun
 *
 * Both are passed the unit id as their value and read the interval off the
 * interpolation payload, which i18next spreads into the options argument.
 * Anything else is returned untouched.
 */
export const recurrenceFormat = (
    value: unknown,
    format?: string,
    lng?: string,
    options?: unknown,
): string => {
    const raw = typeof value === 'string' ? value : String(value);

    if (!isRecurrenceFormatSpec(format)) return raw;
    if (!isUnitId(raw)) return raw;

    const interval = Number((options as { interval?: unknown } | undefined)?.interval);
    const cell = cellFor(lng, raw, interval);

    return format === 'recurrenceEvery' ? cell.lead : cell.word;
};
