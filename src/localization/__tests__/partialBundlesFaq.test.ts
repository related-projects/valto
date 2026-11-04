/**
 * Partial bundles carry no FAQ (pass 83, item 7)
 *
 * HelpFAQScreen reads the whole list at once, t('faq.items', { returnObjects:
 * true }), so i18next hands back the array of the first language that has the
 * key, as it stands. An item missing a field in a partial bundle is not filled
 * from en.json: it is shown with that field empty. The only fallback the screen
 * gets is for the whole list, and only when the bundle has no `faq` at all.
 *
 * The partial bundles' answers did not say what en.json's say - their backup
 * answer had no warning that the file is not encrypted - so a partial bundle
 * carries no `faq` and its users read en.json's, which
 * src/data/__tests__/helpAbout.test.ts checks through the screen's own call.
 *
 * Partial is derived from the bundles i18n registers, by the rule
 * src/localization/__tests__/i18n.test.ts uses for COMPLETE_LANGUAGE_CODES: a
 * bundle whose key set differs from en.json's.
 */

import i18n from '../i18n';
import { SUPPORTED_LANGUAGES } from '../../domain/constants/languages';

type NestedRecord = { [key: string]: string | NestedRecord };

/** Leaf keys, arrays by index - the count i18n.test.ts makes. */
function extractKeys(obj: NestedRecord, prefix = ''): string[] {
    const keys: string[] = [];
    for (const key in obj) {
        const fullKey = prefix ? `${prefix}.${key}` : key;
        if (typeof obj[key] === 'object' && obj[key] !== null) {
            keys.push(...extractKeys(obj[key] as NestedRecord, fullKey));
        } else {
            keys.push(fullKey);
        }
    }
    return keys;
}

const bundleOf = (code: string): NestedRecord =>
    i18n.getResourceBundle(code, 'translation') as NestedRecord;

const enKeys = new Set(extractKeys(bundleOf('en')));

const isPartial = (code: string): boolean => {
    const keys = extractKeys(bundleOf(code));
    return keys.length !== enKeys.size || !keys.every((key) => enKeys.has(key));
};

const PARTIAL_CODES = SUPPORTED_LANGUAGES.map((language) => language.code).filter(isPartial);

describe('pass 83 item 7. partial bundles and the FAQ', () => {
    it('precondition: there are partial bundles to check', () => {
        expect(PARTIAL_CODES.length).toBeGreaterThan(0);
    });

    it.each(PARTIAL_CODES)('pass 83 item 7 (%s): the bundle has no faq key', (code) => {
        expect(Object.keys(bundleOf(code))).not.toContain('faq');
    });
});
