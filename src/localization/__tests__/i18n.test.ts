/**
 * i18n Locale Tests
 *
 * en.json is the source of truth. These tests guard against two failure modes:
 *   1. A "complete" locale silently losing a key and falling back to English.
 *   2. Any locale carrying an orphan/typo key that exists in no other locale.
 *
 * COMPLETE_LOCALES are held to full parity with en.json (minus the faq.items
 * long-form help copy, which is authored natively rather than machine-translated
 * and is intentionally allowed to fall back to English in partial locales).
 *
 * The remaining locales (ar, hi, bn, ur, zh) are intentionally partial for now —
 * they render truthful English fallback until a native pass is done — so they are
 * only checked for "no extra keys" and "no empty values", not full coverage.
 */

import en from '../../localization/locales/en.json';
import fr from '../../localization/locales/fr.json';
import es from '../../localization/locales/es.json';
import pt from '../../localization/locales/pt.json';
import ar from '../../localization/locales/ar.json';
import hi from '../../localization/locales/hi.json';
import bn from '../../localization/locales/bn.json';
import ru from '../../localization/locales/ru.json';
import ur from '../../localization/locales/ur.json';
import zh from '../../localization/locales/zh.json';

type NestedRecord = { [key: string]: string | NestedRecord };

/**
 * Recursively extract all leaf keys from a nested JSON object.
 * Returns dot-separated paths like "common.ok", "a11y.backButton".
 * Arrays (e.g. faq.items) are traversed by index: "faq.items.0.question".
 */
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

function getNestedValue(obj: NestedRecord, path: string): string | NestedRecord | undefined {
    const parts = path.split('.');
    let current: string | NestedRecord | undefined = obj;
    for (const part of parts) {
        if (typeof current !== 'object' || current === null) return undefined;
        current = (current as NestedRecord)[part];
    }
    return current;
}

/** Long-form FAQ answers are authored natively, not held to parity. */
const isFaqItem = (key: string): boolean => key.startsWith('faq.items');

const ALL_LOCALES: Record<string, NestedRecord> = {
    fr: fr as unknown as NestedRecord,
    es: es as unknown as NestedRecord,
    pt: pt as unknown as NestedRecord,
    ar: ar as unknown as NestedRecord,
    hi: hi as unknown as NestedRecord,
    bn: bn as unknown as NestedRecord,
    ru: ru as unknown as NestedRecord,
    ur: ur as unknown as NestedRecord,
    zh: zh as unknown as NestedRecord,
};

// Locales held to FULL parity with en.json (excluding faq.items).
const COMPLETE_LOCALES = ['fr', 'es', 'pt', 'ru'] as const;

// Interpolation tokens like {{code}} must match en exactly per key.
const tokensOf = (value: string): string[] =>
    (value.match(/\{\{[^}]+\}\}/g) ?? []).sort();

describe('i18n Locale Coverage', () => {
    const en_ = en as unknown as NestedRecord;
    const enKeys = extractKeys(en_);
    const enParityKeys = enKeys.filter(k => !isFaqItem(k));

    it('en.json has translation keys', () => {
        expect(enKeys.length).toBeGreaterThan(0);
    });

    it('no empty translation values in en.json', () => {
        const emptyKeys = enKeys.filter(key => {
            const value = getNestedValue(en_, key);
            return typeof value === 'string' && value.trim() === '';
        });
        expect(emptyKeys).toEqual([]);
    });

    describe.each(COMPLETE_LOCALES)('complete locale: %s', locale => {
        const localeKeys = extractKeys(ALL_LOCALES[locale]);

        it(`${locale}.json has every en.json key (excluding faq.items)`, () => {
            const missing = enParityKeys.filter(k => !localeKeys.includes(k));
            if (missing.length > 0) {
                fail(`Missing ${missing.length} key(s) in ${locale}.json:\n  ${missing.join('\n  ')}`);
            }
        });

        it(`${locale}.json has no empty values`, () => {
            const empty = localeKeys.filter(key => {
                const value = getNestedValue(ALL_LOCALES[locale], key);
                return typeof value === 'string' && value.trim() === '';
            });
            if (empty.length > 0) {
                fail(`Empty values in ${locale}.json:\n  ${empty.join('\n  ')}`);
            }
        });
    });

    describe.each(Object.keys(ALL_LOCALES))('every locale: %s', locale => {
        const localeKeys = extractKeys(ALL_LOCALES[locale]);

        it(`${locale}.json has no keys absent from en.json (no orphan/stale keys)`, () => {
            const extra = localeKeys.filter(k => !enKeys.includes(k));
            if (extra.length > 0) {
                fail(`${locale}.json has ${extra.length} key(s) not in en.json:\n  ${extra.join('\n  ')}`);
            }
        });

        it(`${locale}.json has no empty string values`, () => {
            const empty = localeKeys.filter(key => {
                const value = getNestedValue(ALL_LOCALES[locale], key);
                return typeof value === 'string' && value.trim() === '';
            });
            if (empty.length > 0) {
                fail(`Empty values in ${locale}.json:\n  ${empty.join('\n  ')}`);
            }
        });

        it(`${locale}.json keeps en.json interpolation tokens for every shared key`, () => {
            const mismatches: string[] = [];
            for (const key of localeKeys) {
                const localeVal = getNestedValue(ALL_LOCALES[locale], key);
                const enVal = getNestedValue(en_, key);
                if (typeof localeVal !== 'string' || typeof enVal !== 'string') continue;
                const a = tokensOf(enVal).join(',');
                const b = tokensOf(localeVal).join(',');
                if (a !== b) mismatches.push(`${key}: en[${a}] vs ${locale}[${b}]`);
            }
            if (mismatches.length > 0) {
                fail(`Token mismatches in ${locale}.json:\n  ${mismatches.join('\n  ')}`);
            }
        });
    });
});
