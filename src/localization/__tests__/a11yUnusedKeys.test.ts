/**
 * No bundle carries the a11y labels nothing renders (pass 84b, item 5)
 *
 * a11y.addBudget, a11y.editWallet and a11y.walletCard were translated in every
 * complete locale and read by no component. A key nothing reads is copy nobody
 * maintains, so they are removed. a11y.addCategory, in the same state until
 * pass 84b, now labels the Categories add button (item 3) and stays.
 *
 * Should a control ever need one of the removed labels, the key comes back with
 * that control: each check only fails while the key is in a bundle AND no
 * source file references it. pass 84 item 4 covers a11y.addWallet the same way
 * (a11yAddWallet.test.ts).
 */

import * as fs from 'fs';
import * as path from 'path';

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
const LOCALES_DIR = path.join(REPO_ROOT, 'src', 'localization', 'locales');

const REMOVED = ['a11y.addBudget', 'a11y.editWallet', 'a11y.walletCard'];

/** Every .ts/.tsx file under `dir`, tests excluded. */
function sourceFiles(dir: string): string[] {
    return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            return entry.name === '__tests__' || entry.name === 'node_modules' ? [] : sourceFiles(full);
        }
        return /\.tsx?$/.test(entry.name) ? [full] : [];
    });
}

const SOURCES = ['src', 'app'].flatMap((root) => sourceFiles(path.join(REPO_ROOT, root)));

const referencesTo = (key: string): string[] =>
    SOURCES
        .filter((file) => fs.readFileSync(file, 'utf8').includes(key))
        .map((file) => path.relative(REPO_ROOT, file));

const valueAt = (obj: unknown, keyPath: string): unknown =>
    keyPath.split('.').reduce<unknown>(
        (current, part) => (typeof current === 'object' && current !== null ? (current as Record<string, unknown>)[part] : undefined),
        obj,
    );

const bundlesWith = (key: string): string[] =>
    fs.readdirSync(LOCALES_DIR)
        .filter((name) => name.endsWith('.json'))
        .filter((name) => valueAt(JSON.parse(fs.readFileSync(path.join(LOCALES_DIR, name), 'utf8')), key) !== undefined);

describe('pass 84b item 5. unused a11y keys', () => {
    it('precondition: the scan sees the source trees', () => {
        expect(SOURCES.length).toBeGreaterThan(100);
    });

    it.each(REMOVED)('pass 84b item 5. %s is in no bundle while no source file references it', (key) => {
        // A reference brings the key back legitimately; only an unread key is refused.
        const unreadIn = referencesTo(key).length === 0 ? bundlesWith(key) : [];

        expect(unreadIn).toEqual([]);
    });

    it('pass 84b item 3. a11y.addCategory is read by a source file', () => {
        expect(referencesTo('a11y.addCategory')).toEqual(['src/screens/CategoriesScreen.tsx']);
    });
});
