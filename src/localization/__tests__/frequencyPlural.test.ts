/**
 * V-70 - the recurrence phrase agrees with its number and its unit.
 *
 * `recurring.frequencyEveryN` used to read "Every {{interval}} {{base}}s", with
 * the same trailing Latin `s` copied into fr, es and pt. That produced "Tous les
 * 2 moiss" and "Cada 2 mess" (and the same in pt), and in Russian it froze the noun
 * in the nominative singular at every interval ("Kazhdye 2 den'"), where the
 * language needs three forms and the singular again at 21.
 *
 * i18next cannot decide this on its own here. Without Intl.PluralRules - which
 * Hermes does not provide (V-43) - its plural resolver silently degrades every
 * language to English's one/other and logs nothing, so a Russian rule that looks
 * right in jest would be wrong on the device. The first import of this file takes
 * the constructor away, so every assertion below is made under that condition.
 *
 * Expected strings come from tests/helpers/d6FrequencyPhrases, which transcribes
 * the brief's D6 table. They are deliberately NOT derived from the form tables in
 * src/localization/recurrenceForms: a test that read the implementation's own
 * words would pass whatever they were.
 */

import '../../../tests/helpers/withoutIntlPluralRules';

import {
    D6_INTERVALS,
    D6_LANGUAGES,
    D6_PHRASES,
    D6_UNITS,
    EDGE_PHRASES,
    type D6Interval,
    type D6Language,
    type D6Unit,
} from '../../../tests/helpers/d6FrequencyPhrases';
import i18n from '../i18n';

const KEY = 'recurring.frequencyEveryN';

/** Render the key the way both call sites do, in one fixed language. */
const render = (lng: string, unit: string, interval: number): string =>
    i18n.getFixedT(lng)(KEY, { interval, unit }) as unknown as string;

/** Every (language, unit, interval) cell of the D6 table, flattened for it.each. */
const D6_CASES: [D6Language, D6Unit, D6Interval, string][] = D6_LANGUAGES.flatMap(lng =>
    D6_UNITS.flatMap(unit =>
        D6_INTERVALS.map(
            interval => [lng, unit, interval, D6_PHRASES[lng][unit][interval]] as [D6Language, D6Unit, D6Interval, string],
        ),
    ),
);

describe('frequencyEveryN under the device condition', () => {
    it('runs with no Intl.PluralRules, as Hermes does', () => {
        expect((Intl as { PluralRules?: unknown }).PluralRules).toBeUndefined();
    });

    it.each(D6_CASES)('%s %s x%i renders the D6 phrase', (lng, unit, interval, expected) => {
        expect(render(lng, unit, interval)).toBe(expected);
    });
});

/**
 * ar carries no `recurring` section, so i18next resolves the English string and
 * then calls the formatter with lng "ar". The English forms must come with the
 * English category rule: 21 is "other" in English, and would be "one" in a
 * language whose rule leaked into this path.
 */
describe('a bundle with no forms of its own falls back to English', () => {
    it.each(D6_UNITS)('ar renders the English phrase for %s', unit => {
        expect(render('ar', unit, 2)).toBe(D6_PHRASES.en[unit][2]);
    });

    it('ar uses the English category rule at 21, not a borrowed one', () => {
        expect(render('ar', 'day', 21)).toBe(D6_PHRASES.en.day[21]);
    });
});

/**
 * D7. The form's label is computed from an unvalidated text input, before the
 * validator ever sees it, so a negative interval does reach this key. Nothing
 * here changes that - it pins that the phrase stays a phrase.
 */
describe('a non-positive or non-numeric interval', () => {
    const EDGE_CASES: [string, number, 'zero' | 'negative' | 'nan'][] = [
        ['zero', 0, 'zero'],
        ['negative', -3, 'negative'],
        ['NaN', NaN, 'nan'],
    ];

    describe.each(['en', 'ru'] as const)('%s', lng => {
        it.each(EDGE_CASES)('renders a phrase for %s without throwing', (_label, interval, key) => {
            let out = '';
            expect(() => {
                out = render(lng, 'day', interval);
            }).not.toThrow();
            expect(out).toBe(EDGE_PHRASES[lng][key]);
        });
    });
});
