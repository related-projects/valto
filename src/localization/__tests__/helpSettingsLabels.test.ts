/**
 * Texts that name a Settings row name it as the screen does (pass 83 item 6;
 * pass 83b items 1 and 2)
 *
 * A text that says "Settings > Backup Data" sends the user looking for a row
 * with that title, under a tab with that title. Several did not match the
 * screen:
 *  - pt and ru Help answers cited row titles the Settings screen does not show
 *    (pt "Backup de Dados" for a row titled "Backup"; in ru the backup and
 *    restore rows, each cited by a longer or different title) - pass 83 item 6;
 *  - the pt and ru Reset confirmation (storeRecovery.confirmBody) cited the
 *    restore row the same way - pass 83b item 1;
 *  - every es citation named the menu "Ajustes", while the tab and the screen
 *    title read navigation.settings - pass 83b item 2.
 *
 * Which row each citation means is read from en.json: each "Settings > " in an
 * en string is resolved to the settings.* key whose en value follows it. The
 * same string in another locale - the Help answer with the same id, or the
 * string at the same key - must cite the same rows, in the same order, each
 * under that locale's navigation.settings and by the current value of that key
 * in its own bundle.
 *
 * A citation ends where the label ends: at the end of the text, at
 * punctuation, or at the locale's word for "and" ("Settings > Theme and
 * choose"). Any other continuation means the text cites a longer title than
 * the row has.
 */

import en from '../locales/en.json';
import es from '../locales/es.json';
import pt from '../locales/pt.json';
import ru from '../locales/ru.json';

interface Bundle {
    navigation: { settings: string };
    settings: Record<string, unknown>;
    faq: { items: { id: string; answer: string }[] };
}

type NestedRecord = { [key: string]: unknown };

/** The word for "and" after a cited label, per locale (ru: U+0438). */
const AND: Record<string, string> = { en: 'and', pt: 'e', ru: '\u0438', es: 'y' };

const endsCitation = (rest: string, locale: string): boolean =>
    rest === '' || /^[.,;:]/.test(rest) || rest.startsWith(` ${AND[locale]} `);

/** The text after each "<menu> > " in a string, in order. */
const citationsIn = (text: string, menu: string): string[] => text.split(`${menu} > `).slice(1);

/** Every string leaf of a bundle with its dot path; arrays by index. */
const stringLeaves = (obj: NestedRecord, prefix = ''): [string, string][] =>
    Object.entries(obj).flatMap(([key, value]): [string, string][] => {
        const path = prefix ? `${prefix}.${key}` : key;
        if (typeof value === 'string') return [[path, value]];
        if (typeof value === 'object' && value !== null) return stringLeaves(value as NestedRecord, path);
        return [];
    });

const valueAt = (obj: NestedRecord, path: string): unknown =>
    path.split('.').reduce<unknown>(
        (current, part) => (typeof current === 'object' && current !== null ? (current as NestedRecord)[part] : undefined),
        obj
    );

const EN = en as unknown as Bundle;

const enLabels = Object.entries(EN.settings).filter(
    (entry): entry is [string, string] => typeof entry[1] === 'string'
);

/** The settings.* key each Settings citation of an en string names. */
const citedKeys = (text: string): string[] =>
    citationsIn(text, EN.navigation.settings).map((rest) => {
        const matches = enLabels
            .filter(([, label]) => rest.startsWith(label) && endsCitation(rest.slice(label.length), 'en'))
            .sort((a, b) => b[1].length - a[1].length);
        if (matches.length === 0) {
            throw new Error(`en cites a Settings row no settings.* key holds: "${rest.slice(0, 40)}"`);
        }
        return matches[0][0];
    });

/** What is wrong with the Settings citations of `text`, against the rows `keys`. */
function citationProblems(text: string, keys: string[], locale: string, bundle: Bundle): string[] {
    const menu = bundle.navigation.settings;
    const cited = citationsIn(text, menu);

    const problems: string[] = [];
    if (cited.length !== keys.length) {
        problems.push(`cites ${cited.length} row(s) under "${menu}", en cites ${keys.length}`);
    }
    keys.forEach((key, index) => {
        const label = bundle.settings[key];
        const rest = cited[index] ?? '';
        if (typeof label !== 'string') {
            problems.push(`settings.${key} is not a string in ${locale}.json`);
        } else if (!rest.startsWith(label) || !endsCitation(rest.slice(label.length), locale)) {
            problems.push(
                `settings.${key}: text cites "${menu} > ${rest.slice(0, label.length + 12)}", ` +
                `row title is "${label}"`
            );
        }
    });
    return problems;
}

const CITATIONS = EN.faq.items
    .map((item) => ({ id: item.id, keys: citedKeys(item.answer) }))
    .filter((citation) => citation.keys.length > 0);

/** en strings outside the Help answers that cite a Settings row, by key path. */
const OTHER_CITATIONS = stringLeaves(en as unknown as NestedRecord)
    .filter(([path]) => !path.startsWith('faq.'))
    .map(([path, text]) => ({ path, keys: citedKeys(text) }))
    .filter((citation) => citation.keys.length > 0);

describe('pass 83 item 6. Settings rows cited by the Help answers', () => {
    it('precondition: en answers cite Settings rows', () => {
        expect(CITATIONS.length).toBeGreaterThan(0);
    });

    describe.each([
        ['pt', pt as unknown as Bundle, 'pass 83 item 6'],
        ['ru', ru as unknown as Bundle, 'pass 83 item 6'],
        ['es', es as unknown as Bundle, 'pass 83b item 2'],
    ])('%s', (locale, bundle, pass) => {
        it.each(CITATIONS)(`${pass} (${locale}, $id): cites each row by its current title`, ({ id, keys }) => {
            const item = bundle.faq.items.find((candidate) => candidate.id === id);
            if (!item) {
                throw new Error(`${locale}.json faq.items has no "${id}" entry`);
            }

            expect(citationProblems(item.answer, keys, locale, bundle)).toEqual([]);
        });
    });
});

describe('pass 83b items 1 and 2. Settings rows cited outside the Help answers', () => {
    it('precondition: en strings outside the Help answers cite Settings rows', () => {
        expect(OTHER_CITATIONS.length).toBeGreaterThan(0);
    });

    describe.each([
        ['pt', pt as unknown as Bundle, 'pass 83b item 1'],
        ['ru', ru as unknown as Bundle, 'pass 83b item 1'],
        ['es', es as unknown as Bundle, 'pass 83b item 2'],
    ])('%s', (locale, bundle, pass) => {
        it.each(OTHER_CITATIONS)(`${pass} (${locale}, $path): cites each row by its current title`, ({ path, keys }) => {
            const text = valueAt(bundle as unknown as NestedRecord, path);
            if (typeof text !== 'string') {
                throw new Error(`${locale}.json has no string at ${path}`);
            }

            expect(citationProblems(text, keys, locale, bundle)).toEqual([]);
        });
    });
});
