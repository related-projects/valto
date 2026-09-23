import * as fs from 'fs';
import * as path from 'path';

/**
 * Guard: no English literal stands behind a translated string.
 *
 * Registry F-06, findings 25 and 26. Two English strings survived translation
 * by hiding in a position that looks defensive:
 *
 *   TransactionDetailsModal  t('modals.addTransaction.type') || "Type"
 *   PinPad                   title = 'Enter PIN'
 *
 * Neither can ever be reached. i18next's TFunction returns the key itself when
 * a key is missing, and a key string is truthy, so the `||` is unreachable by
 * construction; PinPad's three call sites all pass a title. What they do is
 * leave an English sentence in the file, ready for the day someone deletes the
 * key or adds a fourth call site - and they make the file read as though the
 * untranslated case were handled.
 *
 * D10 deletes the fallback, D11 makes `title` required so the default cannot
 * come back. Both are deletions: there is no rendered output to assert, so this
 * scans the source, the same way the currency-symbol guard does and for the same
 * reason - a defensive literal is an artefact in the text, not a behaviour.
 */

const REPO_ROOT = path.resolve(__dirname, '..', '..');

const read = (relative: string): string =>
    fs.readFileSync(path.join(REPO_ROOT, relative), 'utf8');

describe('TransactionDetailsModal', () => {
    const SOURCE = 'src/components/modals/TransactionDetailsModal.tsx';

    it('does not hold an English fallback behind the type label', () => {
        expect(read(SOURCE)).not.toMatch(/\|\|\s*["']Type["']/);
    });
});

describe('PinPad', () => {
    const SOURCE = 'src/components/security/PinPad.tsx';

    it('carries no English default title', () => {
        expect(read(SOURCE)).not.toContain('Enter PIN');
    });

    it('requires a title, so a call site cannot silently fall back to one', () => {
        expect(read(SOURCE)).toMatch(/^\s*title:\s*string;\s*$/m);
        expect(read(SOURCE)).not.toMatch(/^\s*title\?:\s*string;\s*$/m);
    });
});
