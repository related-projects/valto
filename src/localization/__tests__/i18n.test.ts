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
 * The remaining locales (ar, hi, bn, ur, zh) are intentionally partial for now -
 * they render truthful English fallback until a native pass is done - so they are
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
import { COMPLETE_LANGUAGE_CODES } from '../../domain/constants/languages';

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

// en.json included: the derivation below asks which bundles are complete, and
// en is trivially complete against itself. COMPLETE_LANGUAGE_CODES carries it
// for the same reason - it is a valid automatic choice on an English device.
const ALL_BUNDLES: Record<string, NestedRecord> = {
    en: en as unknown as NestedRecord,
    ...ALL_LOCALES,
};

// Interpolation tokens like {{code}} must match en exactly per key.
const tokensOf = (value: string): string[] =>
    (value.match(/\{\{[^}]+\}\}/g) ?? []).sort();

/**
 * COMPLETE_LANGUAGE_CODES is what getDeviceLanguage is allowed to pick FOR a
 * user on a first launch. It is a hand-written constant, so it can go stale in
 * two directions, and both are silent in production: a bundle finished but not
 * listed means francophone-grade coverage nobody gets, and a code listed whose
 * bundle regressed means an automatic UI that falls back to English mid-flow.
 *
 * This derives the answer from the bundles instead of restating it. A locale is
 * complete when its key set equals en.json's in BOTH directions - no missing
 * keys, no extra ones. Note this is stricter than the parity describe above,
 * which exempts faq.items; the five complete bundles carry those too, so the
 * strict rule is the honest one here and needs no exemption.
 */
describe('COMPLETE_LANGUAGE_CODES matches the bundles', () => {
    const enKeySet = new Set(extractKeys(en as unknown as NestedRecord));

    const isCompleteBundle = (bundle: NestedRecord): boolean => {
        const keys = extractKeys(bundle);
        if (keys.length !== enKeySet.size) return false;
        return keys.every(k => enKeySet.has(k));
    };

    const derived = Object.keys(ALL_BUNDLES)
        .filter(code => isCompleteBundle(ALL_BUNDLES[code]))
        .sort();

    it('lists exactly the locales at full key parity with en.json', () => {
        const declared: string[] = [...COMPLETE_LANGUAGE_CODES].sort();

        const reachedParity = derived.filter(c => !declared.includes(c));
        const noLongerComplete = declared.filter(c => !derived.includes(c));

        const problems: string[] = [];
        if (reachedParity.length > 0) {
            problems.push(
                `${reachedParity.join(', ')} reached full key parity with en.json but ` +
                'is not in COMPLETE_LANGUAGE_CODES. Add it in ' +
                'src/domain/constants/languages.ts so a device set to that language ' +
                'gets it automatically on first launch.'
            );
        }
        if (noLongerComplete.length > 0) {
            problems.push(
                `${noLongerComplete.join(', ')} is in COMPLETE_LANGUAGE_CODES but its ` +
                'bundle is no longer at full key parity with en.json. Either restore ' +
                'the missing keys or remove the code from ' +
                'src/domain/constants/languages.ts - as listed, a device set to that ' +
                'language gets a UI that falls back to English part-way through.'
            );
        }

        // `throw`, not the jasmine `fail()` the describes below still use: jest
        // runs on jest-circus, where `fail` is not defined, so a fail() call
        // reports "ReferenceError: fail is not defined" and swallows the message
        // it was given. The whole point of this test is the message.
        if (problems.length > 0) {
            throw new Error(
                `COMPLETE_LANGUAGE_CODES is stale.\n  ${problems.join('\n  ')}\n` +
                `  declared: [${declared.join(', ')}]\n` +
                `  derived:  [${derived.join(', ')}]`
            );
        }
    });

    it('agrees with the parity list this file already enforces', () => {
        // Two lists of complete locales in one repo is one too many. COMPLETE_LOCALES
        // drives the parity describes above and excludes en (en cannot miss its own
        // keys); COMPLETE_LANGUAGE_CODES includes it because en is a valid automatic
        // choice. Beyond that they must not drift.
        expect([...COMPLETE_LOCALES].sort()).toEqual(
            [...COMPLETE_LANGUAGE_CODES].filter(c => c !== 'en').sort()
        );
    });
});

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
