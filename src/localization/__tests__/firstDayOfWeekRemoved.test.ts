/**
 * The "First day of week" strings are gone (REGISTRE C20 step 2, pass 98
 * item 3)
 *
 * The Settings screen no longer shows the row or its picker, so the row title
 * and the two choices it offered are read by nothing and leave every bundle,
 * complete or partial. The firstDayOfWeek setting itself stays: entity,
 * validation and load/merge, so old blobs and backups restore unchanged
 * (settingsFeatures.test.ts, validators.test.ts).
 */

import * as fs from 'fs';
import * as path from 'path';

const LOCALES_DIR = path.resolve(__dirname, '..', 'locales');

const REMOVED = ['settings.firstDayOfWeek', 'settings.monday', 'settings.sunday'];

const valueAt = (obj: unknown, keyPath: string): unknown =>
    keyPath.split('.').reduce<unknown>(
        (current, part) => (typeof current === 'object' && current !== null ? (current as Record<string, unknown>)[part] : undefined),
        obj,
    );

const BUNDLES = fs.readdirSync(LOCALES_DIR).filter((name) => name.endsWith('.json')).sort();

describe('pass 98 item 3. first day of week strings', () => {
    it('pass 98 item 3. no bundle carries the removed keys', () => {
        expect(BUNDLES).toHaveLength(10);
        const carried = BUNDLES.flatMap((name) => {
            const bundle = JSON.parse(fs.readFileSync(path.join(LOCALES_DIR, name), 'utf8')) as unknown;
            return REMOVED.filter((key) => valueAt(bundle, key) !== undefined).map((key) => `${name}: ${key}`);
        });

        expect(carried).toEqual([]);
    });
});
