/**
 * Guard: the per-test timeout is configured in exactly one place.
 *
 * jest.config.js sets testTimeout for the whole run. A timeout argument passed
 * to an individual it()/test() or to a lifecycle hook overrides it for that
 * call only, and jest.setTimeout(n) overrides it for a whole file - either way
 * a suite ends up carrying a private allowance that nobody else can see and
 * that no measurement covers. Four files used to carry a 30_000 for a cost that
 * was measured at 0.93-2.30s; this test exists so a fifth cannot appear
 * silently.
 *
 * The scan parses each test file with the TypeScript compiler rather than
 * matching text, so a timeout expressed as `30_000`, `30 * 1000` or a named
 * constant is caught the same way, and a number inside a string or a comment
 * is not.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as ts from 'typescript';

const REPO_ROOT = path.resolve(__dirname, '..', '..');

/** Build output, native projects and vendored code are not this repo's tests. */
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
 * Jest arity. Hooks take (fn, timeout), so index 1 is the timeout. Tests take
 * (name, fn, timeout), so index 2 is. Anything at or past that index is an
 * override of the global value.
 */
const TIMEOUT_INDEX = new Map<string, number>([
    ['beforeAll', 1],
    ['beforeEach', 1],
    ['afterAll', 1],
    ['afterEach', 1],
    ['it', 2],
    ['test', 2],
]);

interface Offence {
    file: string;
    line: number;
    callee: string;
    argument: string;
}

/** Mirrors testMatch in jest.config.js: **\/__tests__\/**\/*.test.ts(x) */
function isTestFile(relativePath: string): boolean {
    const segments = relativePath.split(path.sep);
    return (
        segments.includes('__tests__') &&
        (relativePath.endsWith('.test.ts') || relativePath.endsWith('.test.tsx'))
    );
}

function collectTestFiles(dir: string, found: string[] = []): string[] {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (entry.isDirectory()) {
            if (SKIP_DIRS.has(entry.name)) continue;
            collectTestFiles(path.join(dir, entry.name), found);
            continue;
        }
        const relative = path.relative(REPO_ROOT, path.join(dir, entry.name));
        if (isTestFile(relative)) found.push(relative);
    }
    return found;
}

/**
 * The leftmost identifier of a call target, so that `it`, `it.only`,
 * `test.skip` and `it.each(table)(...)` all resolve to the same head name.
 */
function headName(expression: ts.Expression): string | null {
    let node: ts.Node = expression;
    for (;;) {
        if (ts.isIdentifier(node)) return node.text;
        if (ts.isPropertyAccessExpression(node)) node = node.expression;
        else if (ts.isElementAccessExpression(node)) node = node.expression;
        else if (ts.isCallExpression(node)) node = node.expression;
        else if (ts.isTaggedTemplateExpression(node)) node = node.tag;
        else if (ts.isParenthesizedExpression(node)) node = node.expression;
        else return null;
    }
}

/**
 * jest.setTimeout(n) is the other way to give one file a private allowance: it
 * overrides the global value for every test in the file that calls it. The
 * timeout is its only argument, so index 0. Nothing in this repo uses it today -
 * the synthetic control below is what exercises this branch.
 */
function jestSetTimeoutIndex(expression: ts.Expression): number | undefined {
    if (!ts.isPropertyAccessExpression(expression)) return undefined;
    if (!ts.isIdentifier(expression.expression)) return undefined;
    if (expression.expression.text !== 'jest') return undefined;
    return expression.name.text === 'setTimeout' ? 0 : undefined;
}

/** Index of the timeout argument for this call, if the call takes one at all. */
function timeoutIndex(expression: ts.Expression): number | undefined {
    const head = headName(expression);
    const byName = head === null ? undefined : TIMEOUT_INDEX.get(head);
    return byName !== undefined ? byName : jestSetTimeoutIndex(expression);
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
        if (ts.isCallExpression(node)) {
            const index = timeoutIndex(node.expression);
            if (index !== undefined && node.arguments.length > index) {
                const argument = node.arguments[index];
                const { line } = sourceFile.getLineAndCharacterOfPosition(
                    argument.getStart(sourceFile),
                );
                offences.push({
                    file: relativePath,
                    line: line + 1,
                    callee: node.expression.getText(sourceFile),
                    argument: argument.getText(sourceFile),
                });
            }
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

function describeOffence(offence: Offence): string {
    return `${offence.file}:${offence.line} - ${offence.callee}(...) passes timeout ${offence.argument}; remove it and let jest.config.js testTimeout apply`;
}

/**
 * Every shape the guard is meant to catch, and the near misses it must leave
 * alone, on one numbered fixture. Line numbers below are 1-based into this
 * array.
 */
const FIXTURE = [
    /*  1 */ "jest.setTimeout(20000);",
    /*  2 */ "beforeAll(() => {}, 30_000);",
    /*  3 */ "beforeEach(async () => {}, 30 * 1000);",
    /*  4 */ "afterAll(() => {}, TIMEOUT);",
    /*  5 */ "afterEach(() => {});",
    /*  6 */ "it('a', () => {}, 10000);",
    /*  7 */ "it.only('b', () => {}, 10000);",
    /*  8 */ "test.skip('c', () => {}, 10000);",
    /*  9 */ "it.each([[1], [2]])('d %s', () => {}, 10000);",
    /* 10 */ "it('e', () => {});",
    /* 11 */ "describe.each(rows)('f', () => {});",
    /* 12 */ "describe('g', () => {}, 9999);",
    /* 13 */ "jest.mock('x', () => ({}));",
    /* 14 */ "helper('h', () => {}, 10000);",
    /* 15 */ "const s = 'beforeAll(fn, 30_000)';",
    /* 16 */ "// beforeAll(fn, 30_000)",
].join('\n');

describe('per-file timeout guard', () => {
    const testFiles = collectTestFiles(REPO_ROOT);

    it('scans the whole test suite, not a subset of it', () => {
        // The scanner walks the tree itself rather than asking jest, so it has
        // to prove it is looking at the same files. It must at least find
        // itself, and it must find the suite rather than a handful of files.
        expect(testFiles).toContain(path.join('tests', '__tests__', 'noPerFileTimeouts.test.ts'));
        expect(testFiles.length).toBeGreaterThan(50);
    });

    it('finds no timeout argument on any it/test or lifecycle hook', () => {
        const offences = testFiles.flatMap(scan).map(describeOffence);
        expect(offences).toEqual([]);
    });

    // CONTROL, not a regression test. No file in this repo carries any of these
    // forms, so the test above passes whether the detection works or not. This
    // is the only thing that proves it does - and the only thing exercising the
    // jest.setTimeout branch at all, since nothing in the repo uses it.
    it('detects every form of a per-file timeout, and nothing else', () => {
        const offences = scanSource(FIXTURE, 'fixture.test.ts').map(describeOffence);
        const tail = '; remove it and let jest.config.js testTimeout apply';

        expect(offences).toEqual([
            `fixture.test.ts:1 - jest.setTimeout(...) passes timeout 20000${tail}`,
            `fixture.test.ts:2 - beforeAll(...) passes timeout 30_000${tail}`,
            `fixture.test.ts:3 - beforeEach(...) passes timeout 30 * 1000${tail}`,
            `fixture.test.ts:4 - afterAll(...) passes timeout TIMEOUT${tail}`,
            `fixture.test.ts:6 - it(...) passes timeout 10000${tail}`,
            `fixture.test.ts:7 - it.only(...) passes timeout 10000${tail}`,
            `fixture.test.ts:8 - test.skip(...) passes timeout 10000${tail}`,
            `fixture.test.ts:9 - it.each([[1], [2]])(...) passes timeout 10000${tail}`,
        ]);

        // Lines 5, 10-16 are the near misses: a hook with no timeout, a test
        // with no timeout, describe.each, a third argument to describe (which
        // jest ignores), jest.mock, a helper of the project's own, the text
        // inside a string, and the text inside a comment.
    });
});
