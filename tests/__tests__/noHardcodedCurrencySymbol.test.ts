/**
 * Guard: no component renders a currency symbol of its own.
 *
 * Every amount the app shows is formatted by useFormatting, which takes its
 * symbol from the user's settings currency. A symbol written directly into JSX
 * is not just untranslated - it contradicts every formatted amount beside it as
 * soon as the user is not on USD. TransferModal carried a literal `$` next to
 * its amount input while four other money strings on the same screen came from
 * formatAmount.
 *
 * Commented-out symbols are offences too, and they are the reason this guard
 * scans source instead of rendering. AddTransactionModal's `$` was commented out
 * rather than deleted, which left the fix looking done while the artefact - and
 * the invitation to uncomment it - stayed in the file. A renderer cannot see a
 * comment; only a source scan can.
 *
 * Live JSX is matched through the TypeScript AST, so a symbol inside a string
 * literal or an identifier is not caught. Comments are matched textually, since
 * by definition they do not parse.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as ts from 'typescript';

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const SOURCE_ROOT = 'src';

/** Build output, native projects and vendored code are not this repo's source. */
const SKIP_DIRS = new Set([
    'node_modules',
    '.git',
    '.expo',
    'android',
    'ios',
    'dist',
    'coverage',
]);

/**
 * The unambiguous currency symbols - the ones that mean nothing else in a UI
 * string. Deliberately not the app's whole currency table: symbols like `R`,
 * `L` and `Fr` are ordinary letters, and matching them in prose would produce
 * noise rather than findings. These four are the ones a developer actually
 * hardcodes beside an amount input.
 *
 * Written as escape sequences rather than glyphs, in order dollar, euro, pound,
 * yen. This guard exists to forbid these characters in source, so it is the one
 * file that must not contain them literally.
 */
const SYMBOLS = ['$', '\u20AC', '\u00A3', '\u00A5'];

/** `>$<` and friends: a currency symbol as the whole body of a JSX element. */
const COMMENTED_JSX_SYMBOL = new RegExp(`>\\s*[${SYMBOLS.map(s => `\\${s}`).join('')}]\\s*<`);

interface Offence {
    file: string;
    line: number;
    kind: 'rendered' | 'commented';
    text: string;
}

function isSourceFile(relativePath: string): boolean {
    return relativePath.endsWith('.tsx') && !relativePath.split(path.sep).includes('__tests__');
}

function collectSourceFiles(dir: string, found: string[] = []): string[] {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (entry.isDirectory()) {
            if (SKIP_DIRS.has(entry.name)) continue;
            collectSourceFiles(path.join(dir, entry.name), found);
            continue;
        }
        const relative = path.relative(REPO_ROOT, path.join(dir, entry.name));
        if (isSourceFile(relative)) found.push(relative);
    }
    return found;
}

/** True when a rendered string is a currency symbol and nothing else. */
function isBareSymbol(value: string): boolean {
    return SYMBOLS.includes(value.trim());
}

function scanSource(source: string, relativePath: string): Offence[] {
    const sourceFile = ts.createSourceFile(
        relativePath,
        source,
        ts.ScriptTarget.Latest,
        /* setParentNodes */ true,
        ts.ScriptKind.TSX,
    );

    const offences: Offence[] = [];
    const lineOf = (position: number): number =>
        sourceFile.getLineAndCharacterOfPosition(position).line + 1;

    // Live JSX: <Text>$</Text> and <Text>{'$'}</Text>.
    function visit(node: ts.Node): void {
        if (ts.isJsxText(node) && isBareSymbol(node.text)) {
            offences.push({
                file: relativePath,
                line: lineOf(node.getStart(sourceFile)),
                kind: 'rendered',
                text: node.text.trim(),
            });
        }
        if (ts.isJsxExpression(node) && node.expression && ts.isStringLiteral(node.expression)
            && isBareSymbol(node.expression.text)) {
            offences.push({
                file: relativePath,
                line: lineOf(node.getStart(sourceFile)),
                kind: 'rendered',
                text: node.expression.text.trim(),
            });
        }
        ts.forEachChild(node, visit);
    }
    visit(sourceFile);

    // Commented-out JSX. Scanned line by line: a comment does not parse, so the
    // AST cannot reach it.
    source.split('\n').forEach((line, index) => {
        const trimmed = line.trim();
        const isComment = trimmed.startsWith('//')
            || trimmed.startsWith('{/*')
            || trimmed.startsWith('/*')
            || trimmed.startsWith('*');
        if (isComment && COMMENTED_JSX_SYMBOL.test(line)) {
            offences.push({
                file: relativePath,
                line: index + 1,
                kind: 'commented',
                text: trimmed,
            });
        }
    });

    return offences.sort((a, b) => a.line - b.line);
}

function scan(relativePath: string): Offence[] {
    return scanSource(fs.readFileSync(path.join(REPO_ROOT, relativePath), 'utf8'), relativePath);
}

function describeOffence(offence: Offence): string {
    const advice = offence.kind === 'commented'
        ? 'delete it rather than commenting it out'
        : 'use the settings currency via useFormatting instead of a hardcoded symbol';
    return `${offence.file}:${offence.line} - ${offence.kind} currency symbol; ${advice}`;
}

/**
 * Every shape the guard must catch and the near misses it must leave alone, on
 * one numbered fixture. Line numbers below are 1-based into this array.
 */
const FIXTURE = [
    /*  1 */ "const a = <Text>$</Text>;",
    /*  2 */ "const b = <Text>{'\u20AC'}</Text>;",
    /*  3 */ "// <Text>$</Text>",
    /*  4 */ "{/* <Text style={{ fontSize: 12 }}>$</Text> */}",
    /*  5 */ "const c = <Text>{formatAmount(wallet.balance)}</Text>;",
    /*  6 */ "const d = <Text>{t('modals.transfer.amount')}</Text>;",
    /*  7 */ "const e = `total: $${value}`;",
    /*  8 */ "const f = 'costs $5';",
    /*  9 */ "const g = <Text>Available</Text>;",
    /* 10 */ "const h = currencySymbol;",
].join('\n');

describe('hardcoded currency symbol guard', () => {
    const sourceFiles = collectSourceFiles(path.join(REPO_ROOT, SOURCE_ROOT));

    it('scans the component tree, not a subset of it', () => {
        // The scanner walks the tree itself rather than asking the bundler, so
        // it has to prove it is looking at the real surface.
        expect(sourceFiles).toContain(
            path.join('src', 'components', 'modals', 'TransferModal.tsx'),
        );
        expect(sourceFiles).toContain(
            path.join('src', 'components', 'modals', 'AddTransactionModal.tsx'),
        );
        expect(sourceFiles.length).toBeGreaterThan(50);
    });

    it('finds no rendered or commented-out currency symbol in any component', () => {
        const offences = sourceFiles.flatMap(scan).map(describeOffence);
        expect(offences).toEqual([]);
    });

    // CONTROL, not a regression test. Once the repo is clean the test above
    // passes whether the detection works or not; this is what proves it does.
    it('detects every form of a hardcoded symbol, and nothing else', () => {
        const offences = scanSource(FIXTURE, 'fixture.tsx').map(describeOffence);
        const rendered = 'use the settings currency via useFormatting instead of a hardcoded symbol';
        const commented = 'delete it rather than commenting it out';

        expect(offences).toEqual([
            `fixture.tsx:1 - rendered currency symbol; ${rendered}`,
            `fixture.tsx:2 - rendered currency symbol; ${rendered}`,
            `fixture.tsx:3 - commented currency symbol; ${commented}`,
            `fixture.tsx:4 - commented currency symbol; ${commented}`,
        ]);

        // Lines 5-10 are the near misses: a formatted amount, a translated
        // string, a symbol inside a template literal, a symbol inside a plain
        // string, ordinary rendered prose, and a variable that holds a symbol.
    });
});
