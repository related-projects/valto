/**
 * Guard: no shipped file reads the window size once, at load.
 *
 * Nine files used to compute a size from Dimensions.get('window') at module
 * scope - seven sheet heights, the onboarding button width and the wallet card
 * width. That value is taken when the file is first imported and never again,
 * so a rotation, a fold or a split-screen resize leaves the layout sized for a
 * window that no longer exists (pass 81, Owner decision 3). The fix reads the
 * size inside the component with useWindowDimensions; this test keeps a tenth
 * file from going back to the old shape.
 *
 * A call inside any function body is left alone: it runs when the function
 * does, not at import. The scan parses with the TypeScript compiler, after
 * tests/__tests__/noPerFileTimeouts.test.ts, so a call inside a string or a
 * comment is not mistaken for one.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as ts from 'typescript';

const REPO_ROOT = path.resolve(__dirname, '..', '..');

/** The two trees that ship. */
const SCANNED_ROOTS = ['app', 'src'];

interface Offence {
    file: string;
    line: number;
    call: string;
}

function isShippedSource(relativePath: string): boolean {
    if (relativePath.split(path.sep).includes('__tests__')) return false;
    return relativePath.endsWith('.ts') || relativePath.endsWith('.tsx');
}

function collectSources(dir: string, found: string[] = []): string[] {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const absolute = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            collectSources(absolute, found);
            continue;
        }
        const relative = path.relative(REPO_ROOT, absolute);
        if (isShippedSource(relative)) found.push(relative);
    }
    return found;
}

/** `Dimensions.get(...)`, bare or qualified (`ReactNative.Dimensions.get(...)`). */
function isDimensionsGet(node: ts.CallExpression): boolean {
    const callee = node.expression;
    if (!ts.isPropertyAccessExpression(callee) || callee.name.text !== 'get') return false;
    const owner = callee.expression;
    if (ts.isIdentifier(owner)) return owner.text === 'Dimensions';
    return ts.isPropertyAccessExpression(owner) && owner.name.text === 'Dimensions';
}

/** True when some enclosing node is a function body, so the call runs late. */
function insideFunction(node: ts.Node): boolean {
    for (let current = node.parent; current; current = current.parent) {
        if (ts.isFunctionLike(current)) return true;
    }
    return false;
}

function scanSource(source: string, relativePath: string): Offence[] {
    const sourceFile = ts.createSourceFile(
        relativePath,
        source,
        ts.ScriptTarget.Latest,
        /* setParentNodes */ true,
        relativePath.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
    );

    const offences: Offence[] = [];

    function visit(node: ts.Node): void {
        if (ts.isCallExpression(node) && isDimensionsGet(node) && !insideFunction(node)) {
            const { line } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
            offences.push({ file: relativePath, line: line + 1, call: node.getText(sourceFile) });
        }
        ts.forEachChild(node, visit);
    }

    visit(sourceFile);
    return offences;
}

function scan(relativePath: string): Offence[] {
    const source = fs.readFileSync(path.join(REPO_ROOT, relativePath), 'utf8');
    return scanSource(source, relativePath);
}

const toPosix = (relativePath: string): string => relativePath.split(path.sep).join('/');

function describeOffence(offence: Offence): string {
    return `${toPosix(offence.file)}:${offence.line} - ${offence.call} runs once at load; read the size in the component with useWindowDimensions`;
}

/**
 * Every shape the guard is meant to catch, and the near misses it must leave
 * alone. Line numbers below are 1-based into this array.
 */
const FIXTURE = [
    /*  1 */ "const { height } = Dimensions.get('window');",
    /*  2 */ "const W = Dimensions.get('screen').width * 0.5;",
    /*  3 */ "const s = StyleSheet.create({ a: { minWidth: Dimensions.get('window').width } });",
    /*  4 */ "const q = ReactNative.Dimensions.get('window');",
    /*  5 */ "function f() { return Dimensions.get('window'); }",
    /*  6 */ "const g = () => Dimensions.get('window').height;",
    /*  7 */ "class C { m() { return Dimensions.get('window'); } }",
    /*  8 */ "Dimensions.addEventListener('change', handler);",
    /*  9 */ "const t = \"Dimensions.get('window')\";",
    /* 10 */ "// Dimensions.get('window')",
    /* 11 */ "const m = new Map(); m.get('window');",
].join('\n');

describe('load-time window size guard', () => {
    const sources = SCANNED_ROOTS.flatMap((root) => collectSources(path.join(REPO_ROOT, root)));

    it('scans the whole shipped tree, not a subset of it', () => {
        // Both trees, and enough of them that a broken walk cannot pass.
        expect(sources).toContain(path.join('src', 'screens', 'WalletsScreen.tsx'));
        expect(sources).toContain(path.join('app', '_layout.tsx'));
        expect(sources.length).toBeGreaterThan(150);
    });

    it('finds no Dimensions.get call outside a function body', () => {
        const offences = sources.flatMap(scan).map(describeOffence);
        expect(offences).toEqual([]);
    });

    // CONTROL, not a regression test: it proves the detector catches each shape
    // and nothing else, independently of what the tree contains today.
    it('detects every load-time read, and nothing else', () => {
        const offences = scanSource(FIXTURE, 'fixture.tsx').map(
            (offence) => `${offence.line}: ${offence.call}`,
        );

        expect(offences).toEqual([
            "1: Dimensions.get('window')",
            "2: Dimensions.get('screen')",
            "3: Dimensions.get('window')",
            "4: ReactNative.Dimensions.get('window')",
        ]);

        // Lines 5-11 are the near misses: inside a function, an arrow and a
        // method, a different Dimensions call, the text inside a string and a
        // comment, and a get() on something that is not Dimensions.
    });
});
