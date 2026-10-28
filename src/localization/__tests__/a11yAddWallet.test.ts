/**
 * No bundle carries an a11y.addWallet label that nothing renders (pass 84,
 * item 4)
 *
 * a11y.addWallet was translated in every complete locale and read by no
 * component: every control that adds a wallet shows its own text
 * (WalletsScreen, the header button wallets.add and the empty state
 * wallets.createFirst; the dashboard WalletList, components.walletList.createFirst),
 * so a screen reader already announces it. A key nothing reads is copy nobody
 * maintains, so it is removed rather than kept for later.
 *
 * Should a control without visible text ever need it, the key comes back with
 * that control: this test only fails while the key is in a bundle AND no source
 * file references it.
 */

import * as fs from 'fs';
import * as path from 'path';

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
const LOCALES_DIR = path.join(REPO_ROOT, 'src', 'localization', 'locales');
const KEY = 'a11y.addWallet';

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

const valueAt = (obj: unknown, keyPath: string): unknown =>
    keyPath.split('.').reduce<unknown>(
        (current, part) => (typeof current === 'object' && current !== null ? (current as Record<string, unknown>)[part] : undefined),
        obj,
    );

describe('pass 84 item 4. a11y.addWallet', () => {
    it('precondition: the scan sees the source trees', () => {
        expect(sourceFiles(path.join(REPO_ROOT, 'src')).length).toBeGreaterThan(100);
        expect(sourceFiles(path.join(REPO_ROOT, 'app')).length).toBeGreaterThan(5);
    });

    it('pass 84 item 4. is in no bundle while no source file references it', () => {
        const references = ['src', 'app']
            .flatMap((root) => sourceFiles(path.join(REPO_ROOT, root)))
            .filter((file) => fs.readFileSync(file, 'utf8').includes(KEY))
            .map((file) => path.relative(REPO_ROOT, file));

        const bundlesWithKey = fs.readdirSync(LOCALES_DIR)
            .filter((name) => name.endsWith('.json'))
            .filter((name) => {
                const bundle = JSON.parse(fs.readFileSync(path.join(LOCALES_DIR, name), 'utf8'));
                return valueAt(bundle, KEY) !== undefined;
            });

        // A reference brings the key back legitimately; only an unread key is refused.
        const unreadIn = references.length === 0 ? bundlesWithKey : [];

        expect(unreadIn).toEqual([]);
    });
});
