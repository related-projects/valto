/**
 * Guard: no locale bundle asks for an interpolation format spec nobody implements.
 *
 * V-70 gave i18next a custom `interpolation.format` (src/localization/i18n.ts) so
 * that recurrence phrases could be inflected without Intl.PluralRules, which
 * Hermes does not provide. Supplying that function has a consequence worth a
 * guard: i18next then never builds its own formatter service
 * (node_modules/i18next/dist/cjs/i18next.js:1806-1809), so the built-in `number`,
 * `currency`, `datetime`, `relativetime` and `list` specs no longer exist.
 *
 * Nothing fails when one is used. recurrenceFormat is handed the spec, does not
 * recognise it, and returns the raw value - so `{{count, number}}` renders the
 * unformatted number, in every language, with no warning at any log level. A
 * translator or a future contributor reaching for the documented i18next syntax
 * gets silence, which is exactly the class of defect V-70 itself was.
 *
 * WHAT IS CHECKED. Every leaf string in all TEN bundles, partial ones included,
 * is parsed for `{{name, spec}}` tokens the way i18next parses them, and every
 * spec found must be one recurrenceFormat dispatches on.
 *
 * The handled list is not restated here. RECURRENCE_FORMAT_SPECS is the array
 * recurrenceFormat itself branches on, so this guard cannot drift from the
 * implementation - and two tests below stop the array lying in either direction:
 * one proves every spec it names really does transform a value, the other proves
 * an unnamed spec really is dropped.
 *
 * The token syntax is read off the running i18n config rather than assumed, and
 * the detector is proved on a synthetic fixture rather than by editing a bundle -
 * same structure as tests/__tests__/noRawErrorMessageInUi.test.ts: a real walk, an
 * equality assertion against a declared list, a floor proving the walk saw the
 * whole tree, and a positive control for the detector itself.
 */

import i18n from '../../src/localization/i18n';
import ar from '../../src/localization/locales/ar.json';
import bn from '../../src/localization/locales/bn.json';
import en from '../../src/localization/locales/en.json';
import es from '../../src/localization/locales/es.json';
import fr from '../../src/localization/locales/fr.json';
import hi from '../../src/localization/locales/hi.json';
import pt from '../../src/localization/locales/pt.json';
import ru from '../../src/localization/locales/ru.json';
import ur from '../../src/localization/locales/ur.json';
import zh from '../../src/localization/locales/zh.json';
import { RECURRENCE_FORMAT_SPECS, recurrenceFormat } from '../../src/localization/recurrenceForms';

type Json = string | number | boolean | null | Json[] | { [key: string]: Json };

const BUNDLES = { ar, bn, en, es, fr, hi, pt, ru, ur, zh } as unknown as Record<string, Json>;

/** The specs recurrenceFormat dispatches on - its own array, not a copy. */
const HANDLED: readonly string[] = RECURRENCE_FORMAT_SPECS;

/**
 * Leaf strings across all ten bundles at the time this guard was written. The
 * floor is here so that a walk which silently stopped traversing - a changed JSON
 * shape, a bad recursion - fails loudly instead of reporting a clean scan of
 * nothing.
 */
const LEAF_FLOOR = 3000;

function required(name: string, value: string | undefined): string {
    if (!value) {
        throw new Error(
            `i18n.options.interpolation.${name} is not set. This guard parses tokens ` +
            'the way the app does, so it cannot run without the app\'s own syntax.',
        );
    }
    return value;
}

// Read the syntax off the running config, not from memory: if the app ever moves
// to different delimiters, this guard moves with it instead of going blind.
const PREFIX = required('prefix', i18n.options.interpolation?.prefix);
const SUFFIX = required('suffix', i18n.options.interpolation?.suffix);
const SEPARATOR = required('formatSeparator', i18n.options.interpolation?.formatSeparator);

const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** i18next's own token pattern: Interpolator.resetRegExp builds `${prefix}(.+?)${suffix}`. */
const tokenPattern = (): RegExp =>
    new RegExp(`${escapeRegExp(PREFIX)}(.+?)${escapeRegExp(SUFFIX)}`, 'g');

interface Finding {
    bundle: string;
    path: string;
    token: string;
    spec: string;
}

interface ScanResult {
    findings: Finding[];
    /** Every spec seen, handled or not - used to prove the parser is live. */
    specs: string[];
    leaves: number;
}

/**
 * Split a token the way i18next's Interpolator.handleFormat does: everything
 * before the FIRST separator is the variable name, everything after it - joined
 * back together, so a chained `a, b` stays one string - is what reaches the
 * format function.
 */
function specOf(tokenContent: string): string | null {
    const at = tokenContent.indexOf(SEPARATOR);
    if (at < 0) return null;
    return tokenContent.slice(at + SEPARATOR.length).trim();
}

function scan(bundle: string, value: Json, path: string, out: ScanResult): void {
    if (typeof value === 'string') {
        out.leaves += 1;
        const pattern = tokenPattern();
        let match: RegExpExecArray | null = pattern.exec(value);
        while (match !== null) {
            const spec = specOf(match[1].trim());
            if (spec !== null) {
                out.specs.push(spec);
                if (!HANDLED.includes(spec)) {
                    out.findings.push({ bundle, path, token: match[0], spec });
                }
            }
            match = pattern.exec(value);
        }
        return;
    }

    if (Array.isArray(value)) {
        value.forEach((item, index) => scan(bundle, item, `${path}[${index}]`, out));
        return;
    }

    if (value !== null && typeof value === 'object') {
        for (const key of Object.keys(value)) {
            scan(bundle, value[key], path ? `${path}.${key}` : key, out);
        }
    }
}

function scanAll(bundles: Record<string, Json>): ScanResult {
    const out: ScanResult = { findings: [], specs: [], leaves: 0 };
    for (const [name, json] of Object.entries(bundles)) scan(name, json, '', out);
    return out;
}

const describeFinding = (f: Finding): string =>
    `${f.bundle}.json ${f.path}: ${f.token} asks for "${f.spec}"`;

describe('locale bundles only use format specs the app implements', () => {
    const result = scanAll(BUNDLES);

    it('names at least one handled spec, so the list is not empty', () => {
        expect(HANDLED.length).toBeGreaterThan(0);
    });

    it('has no bundle asking for an unimplemented spec', () => {
        expect(result.findings.map(describeFinding)).toEqual([]);
    });

    it('walked every bundle, so a clean result means something', () => {
        expect(result.leaves).toBeGreaterThanOrEqual(LEAF_FLOOR);
        for (const name of Object.keys(BUNDLES)) {
            const single = scanAll({ [name]: BUNDLES[name] });
            expect(single.leaves).toBeGreaterThan(0);
        }
    });

    it('found real format specs in the shipped bundles, not only in fixtures', () => {
        expect(result.specs.length).toBeGreaterThan(0);
    });
});

/**
 * The detector, proved on fixtures. No bundle is edited to do it: a bundle
 * carrying `{{count, number}}` even briefly is the defect this guard exists to
 * stop, and a test that has to commit one to prove itself is not a guard.
 */
describe('the detector itself', () => {
    it('flags an unimplemented spec - the i18next built-in "number"', () => {
        const fixture: Record<string, Json> = {
            fixture: {
                alerts: { generated: 'Nice, {{count, number}} transactions generated.' },
            },
        };

        const result = scanAll(fixture);

        expect(result.findings.map(describeFinding)).toEqual([
            'fixture.json alerts.generated: {{count, number}} asks for "number"',
        ]);
    });

    it('flags a chained spec, which reaches the format function whole', () => {
        const fixture: Record<string, Json> = {
            fixture: { price: '{{value, currency, EUR}}' },
        };

        expect(scanAll(fixture).findings.map(f => f.spec)).toEqual(['currency, EUR']);
    });

    it('passes a spec the app does implement', () => {
        const fixture: Record<string, Json> = {
            fixture: { phrase: `{{unit, ${HANDLED[0]}}} {{interval}} {{unit, ${HANDLED[1]}}}` },
        };

        const result = scanAll(fixture);

        expect(result.findings).toEqual([]);
        expect(result.specs).toEqual([HANDLED[0], HANDLED[1]]);
    });

    it('ignores a plain token with no spec', () => {
        const fixture: Record<string, Json> = { fixture: { plain: 'Every {{base}}' } };

        const result = scanAll(fixture);

        expect(result.findings).toEqual([]);
        expect(result.specs).toEqual([]);
    });

    /**
     * The control that matters most: the same scan, over a REAL bundle that has
     * been given the bad token in memory. It is the shipped en.json object with
     * one key added to a copy - the file on disk is never touched - so this
     * demonstrates the check firing on bundle-shaped data, not only on a
     * hand-made two-key fixture.
     */
    it('fails the real check when a real bundle is given an unimplemented spec', () => {
        const clean = scanAll({ en: BUNDLES.en });
        expect(clean.findings).toEqual([]);

        const poisoned = JSON.parse(JSON.stringify(BUNDLES.en)) as { [key: string]: Json };
        (poisoned.alerts as { [key: string]: Json }).injectedByTest = 'Restored {{count, number}} rows.';

        const result = scanAll({ en: poisoned });

        expect(result.findings.map(describeFinding)).toEqual([
            'en.json alerts.injectedByTest: {{count, number}} asks for "number"',
        ]);
        expect(result.leaves).toBeGreaterThanOrEqual(LEAF_FLOOR / Object.keys(BUNDLES).length);
    });

    it('reaches strings nested in arrays, which faq.items are', () => {
        const fixture: Record<string, Json> = {
            fixture: { items: [{ answer: 'See {{count, number}} entries.' }] },
        };

        expect(scanAll(fixture).findings.map(f => f.path)).toEqual(['items[0].answer']);
    });
});

/**
 * The two assertions that stop RECURRENCE_FORMAT_SPECS lying. Without them the
 * array could name a spec nothing implements (the guard would wave a dead token
 * through) or omit one that works (the guard would fail a healthy bundle).
 */
describe('the handled list agrees with what recurrenceFormat actually does', () => {
    it.each([...HANDLED])('%s transforms its value', spec => {
        expect(recurrenceFormat('day', spec, 'en', { interval: 2 })).not.toBe('day');
    });

    it('an unhandled spec is returned untouched - the silent drop this guards', () => {
        expect(recurrenceFormat('day', 'number', 'en', { interval: 2 })).toBe('day');
    });
});
