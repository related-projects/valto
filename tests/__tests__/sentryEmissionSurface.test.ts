/**
 * Guard: the set of places this app can send something from is declared, not
 * discovered.
 *
 * The three scrubbing hooks are already held in place by
 * app/__tests__/sentryBreadcrumbGuard.test.ts, which asserts by identity that
 * each one is installed in the options actually handed to Sentry.init. That
 * covers what a report carries once it is built. It says nothing about how many
 * places can build one.
 *
 * That was the hole. Before this file, an unconditional Sentry.captureMessage
 * added at application startup passed lint, typecheck and the whole suite: no
 * rule in eslint.config.js mentions the SDK, app/ contributes to no coverage
 * threshold, and the two tests that import the root layout mock captureMessage
 * as a bare jest.fn() and never assert on it. The emission surface could grow
 * silently, and the published declaration of what this app sends would go stale
 * without anything noticing.
 *
 * So this file pins the inventory. It records, per call site, the file, the
 * enclosing function, the SDK API called, whether the site is reachable
 * unconditionally or only through a failure branch, and which builds it is
 * compiled into.
 *
 * THE BRANCH CLASS IS SYNTACTIC, NOT SEMANTIC. It reports the syntax around the
 * call - a catch clause, an if, a case, a ternary, a short-circuit - and says
 * nothing about whether the site can fire while the app is behaving normally.
 * `failure-branch` therefore does NOT exclude a site that fires in ordinary
 * use: any call under any `if` is labelled `failure-branch`, whether the
 * condition tests an error or tests that the user opened a screen. The fixture
 * at the bottom of this file has one of each, sitting under the same label.
 *
 * A reader who needs to know whether a site fires in normal use has to open the
 * enclosing code and read the condition. This label is not a substitute for
 * that, and no assertion here should be read as one. What the label is good for
 * is drift: a site that changes shape changes its row, and the row has to be
 * re-argued.
 *
 * NO LINE NUMBERS, deliberately. A guard keyed on line numbers is repaired by
 * editing the number, which is the cheapest possible response to it failing and
 * teaches the next person to reach for that response. Everything recorded here
 * is something a person had to decide, so every change to it is a change
 * somebody has to defend.
 *
 * WHAT THIS FILE DOES NOT DO. It does not mirror, parse or assert against the
 * privacy policy. The policy lives at github.com/related-projects/valto-legal,
 * it is the only opposable document, and a copy here would be a second version
 * of it that nobody publishes. This guard pins code and points a human at text;
 * see EMISSION_SURFACE_NOTICE, which is what it prints when it fails.
 *
 * The structure - a compiler AST walk over the real tree, an equality assertion
 * against a declared list, a floor proving the walk saw the whole tree, and a
 * synthetic fixture as a positive control for the detector - follows
 * tests/__tests__/noPerFileTimeouts.test.ts, which is the house pattern for
 * this. Text matching is not used anywhere: a regex over source would find
 * `Sentry.captureMessage` inside a string and inside a comment, and would miss
 * a named import called bare.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as ts from 'typescript';

import { EMISSION_SURFACE_NOTICE } from '../helpers/emissionSurfaceNotice';

const REPO_ROOT = path.resolve(__dirname, '..', '..');

/**
 * The two trees that ship. Tests are excluded because a test mocks the SDK
 * rather than sending anything, and native projects, build output and vendored
 * code are not this repo's source.
 */
const SCANNED_ROOTS = ['app', 'src'];

/**
 * Any @sentry/* package, not just the one currently installed. A future direct
 * dependency on @sentry/core or @sentry/browser reaches the same ingest.
 */
function isSentryModule(specifier: string): boolean {
    return specifier === '@sentry' || specifier.startsWith('@sentry/');
}

// --- The inventory shape ---------------------------------------------

/**
 * `unconditional` - nothing between the call and the top of its function or
 * module decides whether it runs.
 * `failure-branch` - the call sits under a catch clause, an if, a case, a
 * ternary or the right-hand side of a short-circuit.
 *
 * The classifier is syntactic, so it reports the SHAPE of the guard and not the
 * meaning of the condition. Today every guarded Sentry call in this tree is
 * genuinely a failure path. A new one that is guarded but fires in normal use
 * would still land in `failure-branch` here - what stops that going unnoticed
 * is that the site is new, so the inventory changes and this test fails.
 */
type BranchClass = 'unconditional' | 'failure-branch';

/**
 * Which builds the site is compiled into.
 *
 * `dev-only`      - lexically inside `if (__DEV__) { ... }`.
 * `release-gated` - lexically inside `if (!__DEV__) { ... }`.
 * `ungated`       - everything else, including anything this detector declines
 *                   to read.
 *
 * Only those two exact syntactic forms are matched, and only in the THEN
 * branch. No general condition analysis: `if (someFlag && __DEV__)`, a
 * `__DEV__` test hoisted into a variable, and the ELSE arm of `if (__DEV__)`
 * are all `ungated`. The else arm in particular is deliberately not read as
 * release-gated - guessing there would invert the label, and an under-claim
 * that reads `ungated` is the safe direction to be wrong in.
 *
 * Why this field exists at all: the inventory pins the SET of sites, so it
 * catches a site that appears or disappears. It would NOT catch an existing
 * site losing its build gate - deleting the `if (!__DEV__)` around a
 * captureException ships a new production emission while the set of call sites
 * is unchanged, and every other field in the row stays the same. That is the
 * one edit this entry exists to fail on.
 */
type BuildGate = 'dev-only' | 'release-gated' | 'ungated';

interface Site {
    /** Repo-relative, POSIX separators, so the declaration is platform-stable. */
    file: string;
    /** Enclosing function name, or 'module scope'. */
    enclosing: string;
    /** The SDK export that is called, or `re-export <name>` for a re-export. */
    api: string;
    branch: BranchClass;
    gate: BuildGate;
}

function describeSite(site: Site): string {
    return `${site.file} :: ${site.enclosing} :: ${site.api} :: ${site.branch} :: ${site.gate}`;
}

// --- THE DECLARATION -------------------------------------------------

/**
 * Every point at which this app reaches the Sentry SDK.
 *
 * breadcrumbsIntegration is in here and is not an emission API - it is the
 * configuration constructor the XHR-breadcrumb guard is built from. It is
 * recorded anyway, because the alternative is an allowlist of "APIs that count",
 * and an allowlist is exactly what fails to notice the API it has not heard of.
 * Every reach into the SDK is declared; whether a given one can send is then a
 * question a person answers, in the diff, once.
 *
 * If this list needs changing, read EMISSION_SURFACE_NOTICE first.
 */
const DECLARED_SITES: Site[] = [
    // The single init. Module top level, so it runs on every launch.
    {
        file: 'app/_layout.tsx',
        enclosing: 'module scope',
        api: 'init',
        branch: 'unconditional',
        gate: 'ungated',
    },
    // Recurring rules that failed to generate: counts and rule ids only.
    {
        file: 'app/_layout.tsx',
        enclosing: 'bootstrap',
        api: 'captureMessage',
        branch: 'failure-branch',
        gate: 'release-gated',
    },
    // The daily reminder failed to schedule.
    {
        file: 'app/_layout.tsx',
        enclosing: 'bootstrap',
        api: 'captureException',
        branch: 'failure-branch',
        gate: 'release-gated',
    },
    // Balance-drift assertion. Static message, no interpolation, and it never
    // reaches a store build.
    {
        file: 'app/_layout.tsx',
        enclosing: 'bootstrap',
        api: 'captureMessage',
        branch: 'failure-branch',
        gate: 'dev-only',
    },
    // Boot failed; the app is about to render the store recovery screen.
    {
        file: 'app/_layout.tsx',
        enclosing: 'bootstrap',
        api: 'captureException',
        branch: 'failure-branch',
        gate: 'release-gated',
    },
    // The user-triggered store reset failed.
    {
        file: 'app/_layout.tsx',
        enclosing: 'handleReset',
        api: 'captureException',
        branch: 'failure-branch',
        gate: 'release-gated',
    },
    // Touch instrumentation and the error wrapper around the root component.
    {
        file: 'app/_layout.tsx',
        enclosing: 'module scope',
        api: 'wrap',
        branch: 'unconditional',
        gate: 'ungated',
    },
    // Configuration constructor, not an emission: builds the breadcrumbs
    // integration with xhr off.
    {
        file: 'src/core/observability/sentryBreadcrumbGuard.ts',
        enclosing: 'withoutXhrBreadcrumbs',
        api: 'breadcrumbsIntegration',
        branch: 'unconditional',
        gate: 'ungated',
    },
];

// --- Detector --------------------------------------------------------

/** Local names in one file that are bound to the Sentry SDK. */
interface SentryBindings {
    /** `import * as Sentry from ...` */
    namespaces: Set<string>;
    /** `import { captureMessage as send }` -> send -> captureMessage */
    named: Map<string, string>;
    /** `import Sentry from ...` */
    defaults: Set<string>;
}

function emptyBindings(): SentryBindings {
    return { namespaces: new Set(), named: new Map(), defaults: new Set() };
}

function moduleSpecifierOf(node: ts.ImportDeclaration | ts.ExportDeclaration): string | null {
    const specifier = node.moduleSpecifier;
    if (specifier === undefined || !ts.isStringLiteral(specifier)) return null;
    return specifier.text;
}

/**
 * Type-only imports bind no value and can call nothing, so they are skipped -
 * `import type { Event } from '@sentry/react-native'` is not a surface.
 */
function collectBindings(sourceFile: ts.SourceFile): SentryBindings {
    const bindings = emptyBindings();

    for (const statement of sourceFile.statements) {
        if (!ts.isImportDeclaration(statement)) continue;

        const specifier = moduleSpecifierOf(statement);
        if (specifier === null || !isSentryModule(specifier)) continue;

        const clause = statement.importClause;
        if (clause === undefined || clause.isTypeOnly) continue;

        if (clause.name) {
            bindings.defaults.add(clause.name.text);
        }

        const named = clause.namedBindings;
        if (named === undefined) continue;

        if (ts.isNamespaceImport(named)) {
            bindings.namespaces.add(named.name.text);
            continue;
        }

        for (const element of named.elements) {
            if (element.isTypeOnly) continue;
            bindings.named.set(element.name.text, (element.propertyName ?? element.name).text);
        }
    }

    return bindings;
}

/**
 * A re-export hands the SDK to another module under a local path, which would
 * put a call site outside the reach of the import scan above. Recording the
 * re-export itself keeps that from being invisible: the declaration changes the
 * moment one appears.
 */
function collectReExports(sourceFile: ts.SourceFile, file: string): Site[] {
    const sites: Site[] = [];

    for (const statement of sourceFile.statements) {
        if (!ts.isExportDeclaration(statement) || statement.isTypeOnly) continue;

        const specifier = moduleSpecifierOf(statement);
        if (specifier === null || !isSentryModule(specifier)) continue;

        const clause = statement.exportClause;

        // A re-export is a top-level declaration: it has no enclosing branch and
        // no build gate, so those two fields are constant here by construction.
        if (clause === undefined) {
            sites.push({
                file,
                enclosing: 'module scope',
                api: 're-export *',
                branch: 'unconditional',
                gate: 'ungated',
            });
            continue;
        }

        if (ts.isNamespaceExport(clause)) {
            sites.push({
                file,
                enclosing: 'module scope',
                api: `re-export * as ${clause.name.text}`,
                branch: 'unconditional',
                gate: 'ungated',
            });
            continue;
        }

        for (const element of clause.elements) {
            if (element.isTypeOnly) continue;
            const exported = (element.propertyName ?? element.name).text;
            sites.push({
                file,
                enclosing: 'module scope',
                api: `re-export ${exported}`,
                branch: 'unconditional',
                gate: 'ungated',
            });
        }
    }

    return sites;
}

/** Strips the wrappers a cast or a parenthesis puts in front of a callee. */
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

/** The SDK export this call targets, or null when the call is not the SDK's. */
function calledApi(expression: ts.Expression, bindings: SentryBindings): string | null {
    const callee = unwrap(expression);

    if (ts.isPropertyAccessExpression(callee)) {
        const target = unwrap(callee.expression);
        if (ts.isIdentifier(target) && bindings.namespaces.has(target.text)) {
            return callee.name.text;
        }
        return null;
    }

    if (ts.isIdentifier(callee)) {
        const imported = bindings.named.get(callee.text);
        if (imported !== undefined) return imported;
        if (bindings.defaults.has(callee.text)) return 'default';
    }

    return null;
}

/** The name a declaration gives to the thing being declared, if it is a plain one. */
function declaredName(node: ts.Node): string | null {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name)) return node.name.text;
    if (ts.isPropertyDeclaration(node) && ts.isIdentifier(node.name)) return node.name.text;
    if (ts.isPropertyAssignment(node) && ts.isIdentifier(node.name)) return node.name.text;
    return null;
}

/**
 * The name of a function-like node. An arrow gets its name from whatever it is
 * assigned to, looked up THROUGH the wrappers that sit between the two: this
 * repo writes `const bootstrap = useCallback(async () => { ... }, [])`, so the
 * arrow's parent is the useCallback call, not the declaration.
 */
function functionName(node: ts.Node): string | null {
    if ((ts.isFunctionDeclaration(node) || ts.isFunctionExpression(node)) && node.name) {
        return node.name.text;
    }
    if (ts.isMethodDeclaration(node) && ts.isIdentifier(node.name)) {
        return node.name.text;
    }

    let current: ts.Node = node;
    let parent = current.parent;
    while (
        parent !== undefined &&
        (ts.isCallExpression(parent) || ts.isParenthesizedExpression(parent) || ts.isAsExpression(parent))
    ) {
        current = parent;
        parent = parent.parent;
    }

    return parent === undefined ? null : declaredName(parent);
}

/**
 * The nearest NAMED function around a node. An anonymous callback reports the
 * named function it sits in rather than 'module scope', so wrapping a call in a
 * setTimeout does not quietly rewrite its entry.
 */
function enclosingName(node: ts.Node): string {
    let current: ts.Node | undefined = node.parent;

    while (current !== undefined && !ts.isSourceFile(current)) {
        if (
            ts.isFunctionDeclaration(current) ||
            ts.isFunctionExpression(current) ||
            ts.isArrowFunction(current) ||
            ts.isMethodDeclaration(current)
        ) {
            const name = functionName(current);
            if (name !== null) return name;
        }
        current = current.parent;
    }

    return 'module scope';
}

const SHORT_CIRCUIT = new Set<ts.SyntaxKind>([
    ts.SyntaxKind.AmpersandAmpersandToken,
    ts.SyntaxKind.BarBarToken,
    ts.SyntaxKind.QuestionQuestionToken,
]);

function branchClass(node: ts.Node): BranchClass {
    let current: ts.Node = node;
    let parent = current.parent;

    while (parent !== undefined && !ts.isSourceFile(parent)) {
        if (ts.isCatchClause(parent)) return 'failure-branch';
        if (ts.isCaseClause(parent) || ts.isDefaultClause(parent)) return 'failure-branch';
        // The condition of an if or a ternary is evaluated either way; only the
        // taken branch is guarded.
        if (ts.isIfStatement(parent) && parent.expression !== current) return 'failure-branch';
        if (ts.isConditionalExpression(parent) && parent.condition !== current) return 'failure-branch';
        if (
            ts.isBinaryExpression(parent) &&
            SHORT_CIRCUIT.has(parent.operatorToken.kind) &&
            parent.right === current
        ) {
            return 'failure-branch';
        }

        current = parent;
        parent = parent.parent;
    }

    return 'unconditional';
}

/** `__DEV__` written bare. */
function isDevIdentifier(expression: ts.Expression): boolean {
    return ts.isIdentifier(expression) && expression.text === '__DEV__';
}

/** `!__DEV__`, and nothing else that happens to be falsy in a release build. */
function isNegatedDevIdentifier(expression: ts.Expression): boolean {
    return (
        ts.isPrefixUnaryExpression(expression) &&
        expression.operator === ts.SyntaxKind.ExclamationToken &&
        isDevIdentifier(expression.operand)
    );
}

/**
 * The two literal forms, matched on the THEN branch only. Anything else - a
 * compound condition, a hoisted flag, the ELSE arm - falls through to
 * 'ungated'. The first match walking outward wins; nesting both gates would be
 * dead code, and reporting the innermost is the honest reading of it.
 */
function buildGate(node: ts.Node): BuildGate {
    let current: ts.Node = node;
    let parent = current.parent;

    while (parent !== undefined && !ts.isSourceFile(parent)) {
        if (ts.isIfStatement(parent) && parent.thenStatement === current) {
            if (isDevIdentifier(parent.expression)) return 'dev-only';
            if (isNegatedDevIdentifier(parent.expression)) return 'release-gated';
        }

        current = parent;
        parent = parent.parent;
    }

    return 'ungated';
}

function scanSource(source: string, file: string): Site[] {
    const sourceFile = ts.createSourceFile(
        file,
        source,
        ts.ScriptTarget.Latest,
        /* setParentNodes */ true,
        file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
    );

    const bindings = collectBindings(sourceFile);
    const sites: Site[] = collectReExports(sourceFile, file);

    // No import of the SDK means no call of it can resolve here.
    const hasBindings =
        bindings.namespaces.size > 0 || bindings.named.size > 0 || bindings.defaults.size > 0;

    if (hasBindings) {
        const visit = (node: ts.Node): void => {
            if (ts.isCallExpression(node)) {
                const api = calledApi(node.expression, bindings);
                if (api !== null) {
                    sites.push({
                        file,
                        enclosing: enclosingName(node),
                        api,
                        branch: branchClass(node),
                        gate: buildGate(node),
                    });
                }
            }
            ts.forEachChild(node, visit);
        };
        visit(sourceFile);
    }

    return sites;
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

function scanRepository(files: string[]): Site[] {
    return files.flatMap(relative =>
        scanSource(fs.readFileSync(path.join(REPO_ROOT, relative), 'utf8'), toPosix(relative)),
    );
}

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

function describeDrift(added: string[], removed: string[]): string {
    const lines = [EMISSION_SURFACE_NOTICE, ''];

    if (added.length > 0) {
        lines.push('Found in the tree, absent from the declaration below:');
        for (const site of added) lines.push(`  + ${site}`);
        lines.push('');
    }
    if (removed.length > 0) {
        lines.push('Declared below, absent from the tree:');
        for (const site of removed) lines.push(`  - ${site}`);
        lines.push('');
    }

    lines.push(
        'Sites are recorded as: file :: enclosing function :: SDK API :: branch class :: build gate.',
    );
    return lines.join('\n');
}

// --- The guard -------------------------------------------------------

describe('Sentry emission surface', () => {
    const sourceFiles = SCANNED_ROOTS.flatMap(root => collectSourceFiles(path.join(REPO_ROOT, root)));

    it('scans the whole shipped tree, not a subset of it', () => {
        // The scanner walks the tree itself rather than asking jest, so it has
        // to prove it is looking at the real thing. It must find both files
        // that touch the SDK, and it must find the tree rather than a handful
        // of files: app/ and src/ hold 192 non-test modules today, so a floor
        // of 120 has room for deletion without being satisfiable by accident.
        const scanned = sourceFiles.map(toPosix);

        expect(scanned).toContain('app/_layout.tsx');
        expect(scanned).toContain('src/core/observability/sentryBreadcrumbGuard.ts');
        expect(scanned.length).toBeGreaterThan(120);
    });

    it('matches the declared inventory exactly, in both directions', () => {
        const observed = scanRepository(sourceFiles).map(describeSite).sort();
        const declared = DECLARED_SITES.map(describeSite).sort();

        const added = multisetDifference(observed, declared);
        const removed = multisetDifference(declared, observed);

        if (added.length > 0 || removed.length > 0) {
            throw new Error(describeDrift(added, removed));
        }

        // Both directions, so a site that disappears fails here too: a guard
        // that only notices growth stops describing the app the moment code is
        // deleted, and the published declaration goes stale in the other
        // direction without anybody being told.
        expect(observed).toEqual(declared);
    });

    /**
     * Every shape the detector is meant to catch, and the near misses it must
     * leave alone. None of these call sites exists in the repository, so the
     * assertion above passes whether the detection works or not; this is the
     * only thing that proves it does.
     */
    const FIXTURE = [
        /*  1 */ "import * as Sentry from '@sentry/react-native';",
        /*  2 */ "import { captureEvent, breadcrumbsIntegration } from '@sentry/react-native';",
        /*  3 */ "import type { Event } from '@sentry/react-native';",
        /*  4 */ "export { addBreadcrumb } from '@sentry/react-native';",
        /*  5 */ "export * from '@sentry/react-native';",
        /*  6 */ "Sentry.setTag('release-channel', 'preview');",
        /*  7 */ 'function report(e: Event) { Sentry.captureEvent(e); }',
        /*  8 */ 'const send = () => { if (broken) { captureEvent({}); } };',
        /*  9 */ 'export function guarded() { try { risky(); } catch (e) { Sentry.captureException(e); } }',
        /* 10 */ 'const integration = breadcrumbsIntegration({ xhr: false });',
        /* 11 */ 'if (__DEV__) { Sentry.captureMessage("dev only"); }',
        /* 12 */ 'if (!__DEV__) { Sentry.captureException(new Error("release only")); }',
        /* 13 */ 'if (__DEV__ && verbose) { Sentry.setUser(null); }',
        /* 14 */ "notSentry.captureMessage('not ours');",
        /* 15 */ 'const quoted = "Sentry.captureMessage(x)";',
        /* 16 */ '// Sentry.captureMessage(x)',
    ].join('\n');

    it('detects every shape of a call into the SDK, and nothing else', () => {
        const detected = scanSource(FIXTURE, 'fixture.ts').map(describeSite).sort();

        expect(detected).toEqual([
            // try/catch, named function declaration
            'fixture.ts :: guarded :: captureException :: failure-branch :: ungated',
            // named import called bare, which no regex over `Sentry.` would find
            'fixture.ts :: module scope :: breadcrumbsIntegration :: unconditional :: ungated',
            // if (!__DEV__): compiled into a store build, not a dev one
            'fixture.ts :: module scope :: captureException :: failure-branch :: release-gated',
            // if (__DEV__): never reaches a store build
            'fixture.ts :: module scope :: captureMessage :: failure-branch :: dev-only',
            // re-exports, which move the surface out of this scan's reach
            'fixture.ts :: module scope :: re-export * :: unconditional :: ungated',
            'fixture.ts :: module scope :: re-export addBreadcrumb :: unconditional :: ungated',
            // an unconditional site at module top level: the case nothing caught
            'fixture.ts :: module scope :: setTag :: unconditional :: ungated',
            // if (__DEV__ && verbose): a compound condition is NOT read as a
            // build gate. The detector under-claims here on purpose - see the
            // BuildGate doc - and 'ungated' is the safe direction to be wrong.
            'fixture.ts :: module scope :: setUser :: failure-branch :: ungated',
            'fixture.ts :: report :: captureEvent :: unconditional :: ungated',
            // arrow named by its const, guarded by an if
            'fixture.ts :: send :: captureEvent :: failure-branch :: ungated',
        ]);

        // Lines 3, 14, 15 and 16 are the near misses: a type-only import that
        // binds no value, a same-named method on something that is not the SDK,
        // the text inside a string, and the text inside a comment.
    });
});
