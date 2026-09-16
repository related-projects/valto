/**
 * Guard: no screen, modal or feature view puts a raw error message on screen.
 *
 * Registry V-77. Thirteen render sites used to present whatever an error
 * carried. Twelve were shaped
 *
 *     error instanceof Error ? error.message : t('some.key')
 *
 * in which the TRANSLATED branch is the fallback, so the nominal path showed
 * developer English in every locale; the thirteenth rendered a string its hook
 * had already built out of `err.message`. What actually reached the user was
 * not only untranslated - 24 of the RepositoryError messages reachable from
 * those sites interpolate a row id, and three StorageError messages interpolate
 * a storage key, so a routine not-found showed a UUID.
 *
 * The fix was to choose the key at the render site and never read the message.
 * This guard is what stops the shape coming back, in these sites or in new ones.
 *
 * WHAT IS BANNED, and why it is a blanket ban rather than a shape match.
 *
 *   1. Reading `.message` off anything, anywhere in the four view trees.
 *   2. Writing `x instanceof Error` anywhere in the four view trees.
 *
 * Matching the exact ternary instead would pass the moment somebody writes the
 * same thing over two statements, and "is this receiver an error?" is not a
 * question a syntactic scan can answer. Both bans are cheap to hold because
 * both counts are ALREADY ZERO: a view has no legitimate reason to read a
 * `.message` field or to ask whether a value is an Error. Deciding which error
 * a refusal is belongs to a typed `instanceof` branch on a DOMAIN error class
 * (see EditWalletModal handleDelete, which branches on
 * WalletHasRecurringRulesError and LastWalletError) - not to `instanceof Error`,
 * which tells a caller nothing it can translate.
 *
 * Hooks are deliberately NOT scanned. useWallets, useTransactions,
 * useCategories and useBudgets each keep an `error` string in state for callers
 * that want one, and building it from `err.message` there is fine: that string
 * is not rendered by any of the thirteen sites. src/features IS scanned, and
 * that includes the onboarding hook, on purpose - useOnboarding's value IS
 * rendered, so it must hold a translation key and never a message.
 *
 * The scan parses with the TypeScript compiler rather than matching text, so
 * `.message` inside a string or a comment is not a hit and a property accessed
 * through a cast or a parenthesis still is. Same structure as
 * tests/__tests__/noPerFileTimeouts.test.ts and
 * tests/__tests__/sentryEmissionSurface.test.ts: an AST walk over the real
 * tree, an equality assertion against a declared list, a floor proving the walk
 * saw the whole tree, and a synthetic fixture as a positive control for the
 * detector.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as ts from 'typescript';

const REPO_ROOT = path.resolve(__dirname, '..', '..');

/**
 * The trees that render. `app` is the expo-router layer, `src/screens`,
 * `src/components` and `src/features` are the views themselves. `src/hooks` is
 * excluded - see the header.
 */
const SCANNED_ROOTS = ['app', 'src/screens', 'src/components', 'src/features'];

interface Violation {
    /** Repo-relative, POSIX separators, so the declaration is platform-stable. */
    file: string;
    /** 'message-read' or 'instanceof-Error'. */
    kind: string;
    /** The source text of the offending node, collapsed to one line. */
    text: string;
}

function describe_(v: Violation): string {
    return `${v.file} :: ${v.kind} :: ${v.text}`;
}

// --- THE DECLARATION -------------------------------------------------

/**
 * Empty, and meant to stay empty.
 *
 * If a view ever has a genuine reason to read a `.message` field - a domain
 * object that happens to carry one, say - the entry goes here and the reason
 * goes in the diff. An exception that nobody had to argue for is the thing this
 * file exists to prevent.
 */
const DECLARED_VIOLATIONS: Violation[] = [];

// --- Detector --------------------------------------------------------

/** Strips the wrappers a cast or a parenthesis puts in front of an expression. */
function unwrap(expression: ts.Expression): ts.Expression {
    let current = expression;
    for (;;) {
        if (ts.isParenthesizedExpression(current)) current = current.expression;
        else if (ts.isAsExpression(current)) current = current.expression;
        else if (ts.isTypeAssertionExpression(current)) current = current.expression;
        else if (ts.isNonNullExpression(current)) current = current.expression;
        else return current;
    }
}

/** One line, whitespace collapsed, so a wrapped expression reads as one row. */
function oneLine(node: ts.Node, source: ts.SourceFile): string {
    return node.getText(source).replace(/\s+/g, ' ').trim();
}

function scanSource(source: string, file: string): Violation[] {
    const sourceFile = ts.createSourceFile(
        file,
        source,
        ts.ScriptTarget.Latest,
        /* setParentNodes */ true,
        file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
    );

    const found: Violation[] = [];

    const visit = (node: ts.Node): void => {
        // `x.message`, including through a cast or a parenthesis. An element
        // access (`x['message']`) is caught too: the same read, spelled around
        // the property-access syntax.
        if (ts.isPropertyAccessExpression(node) && node.name.text === 'message') {
            found.push({ file, kind: 'message-read', text: oneLine(node, sourceFile) });
        }
        if (
            ts.isElementAccessExpression(node) &&
            ts.isStringLiteralLike(unwrap(node.argumentExpression)) &&
            (unwrap(node.argumentExpression) as ts.StringLiteralLike).text === 'message'
        ) {
            found.push({ file, kind: 'message-read', text: oneLine(node, sourceFile) });
        }

        // `x instanceof Error`. Narrower than it looks: only the built-in name
        // `Error` is banned, so `error instanceof LastWalletError` - the branch
        // the correction is built on - passes.
        if (
            ts.isBinaryExpression(node) &&
            node.operatorToken.kind === ts.SyntaxKind.InstanceOfKeyword
        ) {
            const right = unwrap(node.right);
            if (ts.isIdentifier(right) && right.text === 'Error') {
                found.push({ file, kind: 'instanceof-Error', text: oneLine(node, sourceFile) });
            }
        }

        ts.forEachChild(node, visit);
    };
    visit(sourceFile);

    return found;
}

// --- Walking the real tree -------------------------------------------

function isScannableFile(relativePath: string): boolean {
    if (relativePath.split(path.sep).includes('__tests__')) return false;
    if (relativePath.endsWith('.d.ts')) return false;
    if (relativePath.endsWith('.test.ts') || relativePath.endsWith('.test.tsx')) return false;
    return relativePath.endsWith('.ts') || relativePath.endsWith('.tsx');
}

function collectSourceFiles(dir: string, found: string[] = []): string[] {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const absolute = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            collectSourceFiles(absolute, found);
            continue;
        }
        const relative = path.relative(REPO_ROOT, absolute);
        if (isScannableFile(relative)) found.push(relative);
    }
    return found;
}

const toPosix = (relativePath: string): string => relativePath.split(path.sep).join('/');

/** a minus b, counting duplicates, so a removed twin is still a difference. */
function multisetDifference(a: string[], b: string[]): string[] {
    const remaining = new Map<string, number>();
    for (const item of b) remaining.set(item, (remaining.get(item) ?? 0) + 1);

    const difference: string[] = [];
    for (const item of a) {
        const count = remaining.get(item) ?? 0;
        if (count > 0) remaining.set(item, count - 1);
        else difference.push(item);
    }
    return difference;
}

// --- The guard -------------------------------------------------------

describe('No raw error message in the UI', () => {
    const sourceFiles = SCANNED_ROOTS.flatMap(root =>
        collectSourceFiles(path.join(REPO_ROOT, root)),
    );

    it('scans the whole view tree, not a subset of it', () => {
        // The scanner walks the tree itself rather than asking jest, so it has
        // to prove it is looking at the real thing. It must find every file
        // that held one of the thirteen sites, and it must find the tree rather
        // than a handful of files.
        //
        // The four roots hold 69 non-test modules today - app 13,
        // src/screens 11, src/components 43, src/features 2 - so the floor of
        // 60 below leaves room for nine deletions before it has to be re-argued.
        // That is a deliberately small margin: the number is here to catch a
        // scan that silently stopped finding the tree, not to sit unexamined
        // through a refactor. Recount with the roots and isScannableFile above,
        // and change both the count and the floor in the same diff.
        const scanned = sourceFiles.map(toPosix);

        expect(scanned).toContain('src/screens/ExportScreen.tsx');
        expect(scanned).toContain('src/screens/RecurringRulesScreen.tsx');
        expect(scanned).toContain('src/components/modals/TransferModal.tsx');
        expect(scanned).toContain('src/components/modals/AddTransactionModal.tsx');
        expect(scanned).toContain('src/components/modals/AddBudgetModal.tsx');
        expect(scanned).toContain('src/components/modals/AddWalletModal.tsx');
        expect(scanned).toContain('src/components/modals/EditWalletModal.tsx');
        expect(scanned).toContain('src/components/recurring/RecurringRuleForm.tsx');
        expect(scanned).toContain('src/features/onboarding/screens/OnboardingScreen.tsx');
        expect(scanned).toContain('src/features/onboarding/hooks/useOnboarding.ts');
        expect(scanned.length).toBeGreaterThan(60);
    });

    it('finds no view reading an error message, in either direction', () => {
        const observed = sourceFiles
            .flatMap(relative =>
                scanSource(fs.readFileSync(path.join(REPO_ROOT, relative), 'utf8'), toPosix(relative)),
            )
            .map(describe_)
            .sort();
        const declared = DECLARED_VIOLATIONS.map(describe_).sort();

        const added = multisetDifference(observed, declared);
        const removed = multisetDifference(declared, observed);

        if (added.length > 0) {
            throw new Error(
                [
                    'A view is reading an error message, or asking whether a value is an Error.',
                    '',
                    'Registry V-77: the translated key is chosen at the render site, and the',
                    "error's own message is never shown. To tell one refusal from another,",
                    'branch on the DOMAIN error class (see EditWalletModal handleDelete), not',
                    'on `instanceof Error`.',
                    '',
                    'Found in the tree, absent from the declaration:',
                    ...added.map(v => `  + ${v}`),
                ].join('\n'),
            );
        }

        // Both directions, so a declared exception that is no longer needed has
        // to be removed rather than left standing as permission nobody uses.
        expect(removed).toEqual([]);
        expect(observed).toEqual(declared);
    });

    /**
     * Every shape the detector is meant to catch, and the near misses it must
     * leave alone. None of these exists in the repository, so the assertion
     * above passes whether the detection works or not; this is the only thing
     * that proves it does.
     */
    const FIXTURE = [
        /*  1 */ "const a = error instanceof Error ? error.message : t('k');",
        /*  2 */ 'const b = err.message;',
        /*  3 */ "const c = (err as Error).message;",
        /*  4 */ "const d = err!['message'];",
        /*  5 */ 'const e = error instanceof LastWalletError;',
        /*  6 */ "const f = t('modals.addWallet.createFailed');",
        /*  7 */ 'const g = savingsHealth.messageKey;',
        /*  8 */ 'const h = "error instanceof Error ? error.message : x";',
        /*  9 */ '// error instanceof Error ? error.message : x',
    ].join('\n');

    it('detects every shape of a raw message read, and nothing else', () => {
        const detected = scanSource(FIXTURE, 'fixture.ts').map(describe_).sort();

        expect(detected).toEqual([
            // 3: read through a cast, which a `.message` text match on the
            // receiver name would miss
            'fixture.ts :: message-read :: (err as Error).message',
            // 2: the plain read
            'fixture.ts :: message-read :: err.message',
            // 4: the same read spelled as an element access
            "fixture.ts :: message-read :: err!['message']",
            // 1: the banned ternary contributes BOTH of its halves
            'fixture.ts :: message-read :: error.message',
            'fixture.ts :: instanceof-Error :: error instanceof Error',
        ].sort());

        // Lines 5 to 9 are the near misses: a typed domain-class branch, which
        // is the correction's own mechanism; a translated key; a `.messageKey`
        // field that merely starts the same way; and the text inside a string
        // and inside a comment.
    });
});
