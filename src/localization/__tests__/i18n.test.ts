/**
 * i18n Locale Tests
 *
 * Validates that all translation keys in en.json exist in fr.json
 * and vice versa. This prevents missing translations from being deployed.
 */

import en from '../../localization/locales/en.json';
import fr from '../../localization/locales/fr.json';

type NestedRecord = { [key: string]: string | NestedRecord };

/**
 * Recursively extract all leaf keys from a nested JSON object.
 * Returns dot-separated paths like "common.ok", "a11y.backButton".
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

describe('i18n Locale Coverage', () => {
    const enKeys = extractKeys(en as NestedRecord);
    const frKeys = extractKeys(fr as NestedRecord);

    it('en.json has translation keys', () => {
        expect(enKeys.length).toBeGreaterThan(0);
    });

    it('fr.json has translation keys', () => {
        expect(frKeys.length).toBeGreaterThan(0);
    });

    it('all en.json keys exist in fr.json', () => {
        const missingInFr = enKeys.filter(key => !frKeys.includes(key));
        if (missingInFr.length > 0) {
            fail(`Missing ${missingInFr.length} key(s) in fr.json:\n  ${missingInFr.join('\n  ')}`);
        }
    });

    it('all fr.json keys exist in en.json', () => {
        const missingInEn = frKeys.filter(key => !enKeys.includes(key));
        if (missingInEn.length > 0) {
            fail(`Missing ${missingInEn.length} key(s) in en.json:\n  ${missingInEn.join('\n  ')}`);
        }
    });

    it('en.json and fr.json have the same number of keys', () => {
        expect(enKeys.length).toBe(frKeys.length);
    });

    it('no empty translation values in en.json', () => {
        const emptyKeys = enKeys.filter(key => {
            const value = getNestedValue(en as NestedRecord, key);
            return typeof value === 'string' && value.trim() === '';
        });
        if (emptyKeys.length > 0) {
            fail(`Empty values in en.json:\n  ${emptyKeys.join('\n  ')}`);
        }
    });

    it('no empty translation values in fr.json', () => {
        const emptyKeys = frKeys.filter(key => {
            const value = getNestedValue(fr as NestedRecord, key);
            return typeof value === 'string' && value.trim() === '';
        });
        if (emptyKeys.length > 0) {
            fail(`Empty values in fr.json:\n  ${emptyKeys.join('\n  ')}`);
        }
    });
});

function getNestedValue(obj: NestedRecord, path: string): string | NestedRecord | undefined {
    const parts = path.split('.');
    let current: string | NestedRecord | undefined = obj;
    for (const part of parts) {
        if (typeof current !== 'object' || current === null) return undefined;
        current = (current as NestedRecord)[part];
    }
    return current;
}
