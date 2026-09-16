/**
 * Sentry Privacy Guard Tests
 *
 * DoD - breadcrumb guard (V-34):
 *  - A breadcrumb of category 'console' is dropped (the hook returns null), for
 *    every console level, including when the payload carries financial values.
 *  - Breadcrumbs of every other category pass through by reference, unchanged.
 *
 * DoD - identifier guard (V-33):
 *  - An event carrying user, contexts.app.device_app_hash and contexts.os.rooted
 *    comes back with all three gone.
 *  - An event missing every one of them passes through without throwing.
 *  - Culture context and touch breadcrumbs survive, asserted BY REFERENCE, so a
 *    later "strip more" edit fails here instead of silently shipping.
 *  - XHR breadcrumbs are off while the rest of the default integration set is
 *    still there, asserted on the RESOLVED list, not on the option shape.
 *  - Auto session tracking is explicitly false.
 *
 * DoD - both:
 *  - The guards are actually INSTALLED in the app's Sentry.init - asserted on
 *    the options object handed to Sentry.init, not by calling them in
 *    isolation. A guard that is never installed is the same as no guard.
 *
 * DoD - the option key set:
 *  - The EXACT set of keys passed to Sentry.init is pinned. The assertions
 *    above hold each hook that IS configured; nothing held the set itself, so
 *    an added option - tracesSampleRate, sendDefaultPii, attachStacktrace -
 *    changed what the app sends and failed nothing. See the notice it prints.
 */

import type { Breadcrumb, Event } from '@sentry/react-native';

// Shared with tests/__tests__/sentryEmissionSurface.test.ts: both guards send
// the reader to the same three artefacts, so they read from one copy.
import { EMISSION_SURFACE_NOTICE } from '@/tests/helpers/emissionSurfaceNotice';

// jest hoists jest.mock above imports; only vars prefixed `mock` may be
// referenced inside the factories.
const mockRunMigrations = jest.fn();
const mockInitializeSeedData = jest.fn();
const mockAssertStoreReadable = jest.fn();
const mockProcessRecurringRules = jest.fn();
const mockResetCorruptedStore = jest.fn();
const mockLoadSettings = jest.fn();

// Sentry itself is mocked so that `init` records the options it was called
// with. Everything else below only exists so that importing ../_layout - which
// is what makes Sentry.init run - does not drag in the real boot graph.
jest.mock('@sentry/react-native', () => ({
    init: jest.fn(),
    wrap: (c: unknown) => c,
    captureMessage: jest.fn(),
    captureException: jest.fn(),
    // Stand-in for the real factory. It only has to report the integration's
    // name and echo back the options it was constructed with - that is all the
    // resolver reads, and all the integrations test asserts on.
    breadcrumbsIntegration: jest.fn((options?: unknown) => ({
        name: 'Breadcrumbs',
        options,
    })),
}));

jest.mock('expo-router', () => {
    const Stack: any = () => null;
    // eslint-disable-next-line react/display-name -- inert stand-in, never rendered
    Stack.Screen = () => null;
    return { Stack, router: { back: jest.fn() }, unstable_settings: {} };
});

jest.mock('react-native-safe-area-context', () => ({
    useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.mock('@/src/components/security/SecurityGate', () => ({ SecurityGate: () => null }));
jest.mock('@/src/core/security/SecurityContext', () => ({ SecurityProvider: () => null }));
jest.mock('@/src/features/onboarding/screens/OnboardingScreen', () => ({
    OnboardingScreen: () => null,
}));

jest.mock('@/src/data/migrations', () => ({ runMigrations: () => mockRunMigrations() }));
jest.mock('@/src/data/seed', () => ({ initializeSeedData: () => mockInitializeSeedData() }));
jest.mock('@/src/data/storage/sql/database', () => ({
    assertStoreReadable: () => mockAssertStoreReadable(),
}));
jest.mock('@/src/data/services/RecurringTransactionEngine', () => ({
    processRecurringRules: () => mockProcessRecurringRules(),
}));
jest.mock('@/src/data/services/storeRecoveryService', () => ({
    resetCorruptedStore: () => mockResetCorruptedStore(),
}));
jest.mock('@/src/data/services/settingsService', () => ({
    loadSettings: () => mockLoadSettings(),
}));

jest.mock('@/src/domain/useCases', () => ({
    verifyFinancialIntegrity: jest.fn().mockResolvedValue(true),
}));

jest.mock('@/src/core/di/container', () => ({
    container: {
        recurringTransactionRepository: {},
        transactionRepository: {},
        walletRepository: {},
    },
    getUseCaseDeps: () => ({ runInTransaction: (fn: () => unknown) => fn() }),
}));

jest.mock('@/src/core/events/dataEvents', () => ({
    dataEvents: { emit: jest.fn(), emitMultiple: jest.fn() },
}));

// NOT mocked: the guards themselves. The wiring tests compare the installed
// hooks against these exact references, so they must be the real
// implementations.
import {
    dropConsoleBreadcrumbs,
    stripPersistentIdentifiers,
    withoutXhrBreadcrumbs,
} from '@/src/core/observability/sentryBreadcrumbGuard';
import * as Sentry from '@sentry/react-native';

// Importing the root layout is what runs Sentry.init, at module scope.
import '../_layout';

// Captured at module scope on purpose: Sentry.init fires exactly once, during
// the import above, so a jest.clearAllMocks() in a beforeEach would erase the
// evidence before any test could read it.
const initOptions = (Sentry.init as jest.Mock).mock.calls[0][0];

describe('dropConsoleBreadcrumbs', () => {
    it("drops a 'console' breadcrumb carrying financial values", () => {
        const breadcrumb: Breadcrumb = {
            category: 'console',
            level: 'error',
            message: '[WalletRepository] Validation failed: balance 1234567 out of range',
            data: {
                logger: 'console',
                arguments: ['[WalletRepository] Validation failed: balance 1234567 out of range'],
            },
        };

        expect(dropConsoleBreadcrumbs(breadcrumb)).toBeNull();
    });

    it("drops 'console' breadcrumbs at every level - the category is what matters", () => {
        // Sentry tags console breadcrumbs by category, not by level, so log,
        // warn and error all arrive as category 'console'.
        for (const level of ['log', 'debug', 'info', 'warning', 'error'] as const) {
            expect(dropConsoleBreadcrumbs({ category: 'console', level })).toBeNull();
        }
    });

    it('drops the balance-drift log from the v5 import verbatim', () => {
        const message =
            '[import] Balance drift after v5 import - opening_balance derivation is suspect: ' +
            'w-1 (stored 500000, ledger 499750, drift 250)';

        expect(
            dropConsoleBreadcrumbs({
                category: 'console',
                level: 'warning',
                message,
                data: { logger: 'console', arguments: [message] },
            }),
        ).toBeNull();
    });

    it('passes navigation breadcrumbs through unchanged, by reference', () => {
        const breadcrumb: Breadcrumb = {
            category: 'navigation',
            data: { from: '/(tabs)', to: '/transaction/42' },
        };

        expect(dropConsoleBreadcrumbs(breadcrumb)).toBe(breadcrumb);
    });

    it('passes the other useful categories through unchanged, by reference', () => {
        // These are what made the earlier crash-report probe readable; the guard
        // must not touch them.
        const categories = ['ui.click', 'http', 'device.event', 'sentry.event', 'sentry.transaction'];

        for (const category of categories) {
            const breadcrumb: Breadcrumb = { category, message: 'kept' };
            expect(dropConsoleBreadcrumbs(breadcrumb)).toBe(breadcrumb);
        }
    });

    it('passes an unknown category through - the default is allow, not deny', () => {
        // Proves the guard is a single deny rule rather than an allowlist, so a
        // category introduced by a future SDK version is not silently lost.
        const breadcrumb: Breadcrumb = { category: 'some.future.category' };
        expect(dropConsoleBreadcrumbs(breadcrumb)).toBe(breadcrumb);

        const uncategorised: Breadcrumb = { message: 'no category at all' };
        expect(dropConsoleBreadcrumbs(uncategorised)).toBe(uncategorised);
    });
});

describe('the guard is installed in the app Sentry.init', () => {
    it('calls Sentry.init exactly once, at module scope', () => {
        expect(Sentry.init as jest.Mock).toHaveBeenCalledTimes(1);
    });

    it('passes dropConsoleBreadcrumbs as beforeBreadcrumb', () => {
        // Identity, not shape: proves the hook that actually runs is the one
        // the tests above exercise, and not a lookalike defined elsewhere.
        expect(initOptions.beforeBreadcrumb).toBe(dropConsoleBreadcrumbs);
    });

    it('the installed hook drops console and keeps navigation', () => {
        // Behaviour of the wired hook, independent of the identity assertion:
        // if the guard is ever re-wrapped, this still holds it to its contract.
        expect(initOptions.beforeBreadcrumb({ category: 'console', message: 'balance 999' })).toBeNull();

        const nav: Breadcrumb = { category: 'navigation' };
        expect(initOptions.beforeBreadcrumb(nav)).toBe(nav);
    });

    it('leaves the rest of the init options intact', () => {
        expect(typeof initOptions.dsn).toBe('string');
        expect(initOptions.dsn.length).toBeGreaterThan(0);
        expect(initOptions.debug).toBe(false);
    });
});

describe('stripPersistentIdentifiers', () => {
    /** An event shaped like one the native layers actually produce on iOS. */
    function eventWithIdentifiers(): Event {
        return {
            event_id: 'abc123',
            user: { id: '982C1F97-0000-4000-8000-000000000000' },
            contexts: {
                app: {
                    app_version: '1.0.0',
                    app_identifier: 'com.renkakpo.valto.app',
                    device_app_hash: '5f2b0c1d9e8a7c6b5a4938271605f4e3d2c1b0a9',
                },
                os: { name: 'iOS', version: '18.2', rooted: false },
                device: { model: 'iPhone15,2', memory_size: 6000000000 },
                culture: { locale: 'fr-FR', timezone: 'Africa/Lome' },
            },
        };
    }

    it('removes the user, device_app_hash and rooted in one pass', () => {
        const stripped = stripPersistentIdentifiers(eventWithIdentifiers());

        expect(stripped.user).toBeUndefined();
        expect('user' in stripped).toBe(false);
        expect(stripped.contexts?.app).not.toHaveProperty('device_app_hash');
        expect(stripped.contexts?.os).not.toHaveProperty('rooted');
    });

    it('returns the same event object - it never drops the report', () => {
        // beforeSend returning null would discard the crash entirely. Stripping
        // identifiers must never cost us the report they were attached to.
        const event = eventWithIdentifiers();
        expect(stripPersistentIdentifiers(event)).toBe(event);
    });

    it('keeps the diagnostic remainder of the contexts it edits', () => {
        // Proves the strip is surgical: it removes two named fields, not the
        // app and os contexts that carry them.
        const stripped = stripPersistentIdentifiers(eventWithIdentifiers());

        expect(stripped.contexts?.app?.app_version).toBe('1.0.0');
        expect(stripped.contexts?.app?.app_identifier).toBe('com.renkakpo.valto.app');
        expect(stripped.contexts?.os?.name).toBe('iOS');
        expect(stripped.contexts?.os?.version).toBe('18.2');
        expect(stripped.contexts?.device?.model).toBe('iPhone15,2');
    });

    it('KEEPS the culture context, asserted by reference', () => {
        // Deliberate: five locales, plus currency- and recurring-date defects
        // where the reporter's timezone was the deciding fact. If somebody
        // "finishes the job" by stripping culture too, this fails.
        const culture = { locale: 'fr-FR', timezone: 'Africa/Lome' };
        const event: Event = { contexts: { culture } };

        expect(stripPersistentIdentifiers(event).contexts?.culture).toBe(culture);
    });

    it('KEEPS touch breadcrumbs, asserted by reference', () => {
        // Touch breadcrumbs carry React component display names only - no
        // sentry-label prop and no component-annotate babel plugin in this repo.
        // They ride along with a crash and are diagnostic context, not analytics.
        const breadcrumbs: Breadcrumb[] = [
            { category: 'touch', type: 'user', message: 'Touch event within element: AddButton' },
        ];
        const event: Event = { breadcrumbs };

        const stripped = stripPersistentIdentifiers(event);
        expect(stripped.breadcrumbs).toBe(breadcrumbs);
        expect(stripped.breadcrumbs?.[0]).toBe(breadcrumbs[0]);

        // And the breadcrumb hook lets them through in the first place.
        expect(dropConsoleBreadcrumbs(breadcrumbs[0])).toBe(breadcrumbs[0]);
    });

    it('is a no-op on an event with no contexts at all', () => {
        // The defensive path. device_app_hash is iOS only, and a JS event
        // captured before the native scope is read has no app context. A throw
        // here happens inside Sentry's pipeline, which swallows it and sends
        // the event UNSTRIPPED - the exact failure this guard exists to avoid.
        const event: Event = { event_id: 'no-contexts' };

        expect(() => stripPersistentIdentifiers(event)).not.toThrow();
        expect(stripPersistentIdentifiers(event)).toBe(event);
    });

    it('is a no-op on an Android-shaped event with contexts but no app or os', () => {
        const event: Event = { contexts: { device: { model: 'Pixel 7' } } };

        expect(() => stripPersistentIdentifiers(event)).not.toThrow();
        expect(stripPersistentIdentifiers(event).contexts?.device?.model).toBe('Pixel 7');
    });

    it('is a no-op when app and os exist but carry none of the stripped fields', () => {
        const event: Event = {
            contexts: { app: { app_version: '1.0.0' }, os: { name: 'Android' } },
        };

        expect(() => stripPersistentIdentifiers(event)).not.toThrow();
        expect(stripPersistentIdentifiers(event).contexts?.app?.app_version).toBe('1.0.0');
        expect(stripPersistentIdentifiers(event).contexts?.os?.name).toBe('Android');
    });
});

describe('withoutXhrBreadcrumbs', () => {
    // A stand-in for the SDK default list. Only the names matter: the resolver
    // matches on name and passes everything else through untouched.
    function defaultIntegrations() {
        return [
            { name: 'ReactNativeErrorHandlers' },
            { name: 'InboundFilters' },
            { name: 'Breadcrumbs' },
            { name: 'Dedupe' },
            { name: 'DeviceContext' },
            { name: 'ExpoContext' },
        ] as unknown as Parameters<typeof withoutXhrBreadcrumbs>[0];
    }

    it('replaces the breadcrumbs integration with one that has xhr off', () => {
        const defaults = defaultIntegrations();
        const resolved = withoutXhrBreadcrumbs(defaults);

        const breadcrumbs = resolved.filter((i) => i.name === 'Breadcrumbs');
        expect(breadcrumbs).toHaveLength(1);
        // The original default instance is gone, not merely shadowed.
        expect(resolved).not.toContain(defaults[2]);
        expect((breadcrumbs[0] as unknown as { options: unknown }).options).toEqual({ xhr: false });
    });

    it('keeps every other default integration, by reference', () => {
        // The point of deriving from the defaults instead of hand-writing the
        // list: nothing can be lost here without this failing.
        const defaults = defaultIntegrations();
        const resolved = withoutXhrBreadcrumbs(defaults);

        for (const integration of defaults) {
            if (integration.name === 'Breadcrumbs') {
                continue;
            }
            expect(resolved).toContain(integration);
        }

        expect(resolved).toHaveLength(defaults.length);
        expect(resolved.map((i) => i.name).sort()).toEqual(defaults.map((i) => i.name).sort());
    });

    it('still swaps when the list has no breadcrumbs integration to replace', () => {
        const resolved = withoutXhrBreadcrumbs([
            { name: 'Dedupe' },
        ] as unknown as Parameters<typeof withoutXhrBreadcrumbs>[0]);

        expect(resolved.map((i) => i.name)).toEqual(['Dedupe', 'Breadcrumbs']);
    });
});

describe('the identifier guards are installed in the app Sentry.init', () => {
    it('passes stripPersistentIdentifiers as beforeSend', () => {
        // Identity, not shape. This is the assertion that matters: a guard
        // that is defined but never installed is the same as no guard.
        expect(initOptions.beforeSend).toBe(stripPersistentIdentifiers);
    });

    it('passes withoutXhrBreadcrumbs as the integrations resolver', () => {
        expect(initOptions.integrations).toBe(withoutXhrBreadcrumbs);
    });

    it('the installed integrations resolver disables xhr and keeps the rest', () => {
        // Asserted on the RESOLVED list produced by the wired resolver, not on
        // the option shape, so a resolver that is wired but inert still fails.
        const defaults = [
            { name: 'ReactNativeErrorHandlers' },
            { name: 'Breadcrumbs' },
            { name: 'DeviceContext' },
        ];
        const resolved = initOptions.integrations(defaults);

        expect(resolved).toContain(defaults[0]);
        expect(resolved).toContain(defaults[2]);
        expect(resolved).not.toContain(defaults[1]);

        const breadcrumbs = resolved.filter((i: { name: string }) => i.name === 'Breadcrumbs');
        expect(breadcrumbs).toHaveLength(1);
        expect(breadcrumbs[0].options).toEqual({ xhr: false });
    });

    it('the installed beforeSend strips all three fields', () => {
        const stripped = initOptions.beforeSend({
            user: { id: 'installation-uuid' },
            contexts: {
                app: { app_version: '1.0.0', device_app_hash: 'deadbeef' },
                os: { name: 'iOS', rooted: false },
            },
        });

        expect(stripped.user).toBeUndefined();
        expect(stripped.contexts.app).not.toHaveProperty('device_app_hash');
        expect(stripped.contexts.os).not.toHaveProperty('rooted');
        expect(stripped.contexts.app.app_version).toBe('1.0.0');
    });

    it('turns auto session tracking off explicitly', () => {
        // Explicit false, not absent: both native layers default this to ON, so
        // an unset option silently re-enables sessions keyed on the identifier
        // beforeSend now strips.
        expect(initOptions.enableAutoSessionTracking).toBe(false);
    });
});

describe('the init option key set is pinned', () => {
    /**
     * The exact keys, sorted. Not a subset check and not a shape check: the
     * assertions above each hold one option that IS configured, which is why an
     * option nobody configured could be added without failing anything.
     *
     * Every key here changes what leaves the device. tracesSampleRate would
     * start sending performance transactions; sendDefaultPii would put back the
     * identifiers beforeSend exists to remove; enableAutoSessionTracking is
     * present precisely because its default is ON. So the set is the thing to
     * pin, and a key arriving OR leaving has to be argued for in the diff.
     */
    const DECLARED_INIT_OPTION_KEYS = [
        'beforeBreadcrumb',
        'beforeSend',
        'debug',
        'dsn',
        'enableAutoSessionTracking',
        'integrations',
    ];

    it('passes exactly the declared option keys, no more and no fewer', () => {
        const actual = Object.keys(initOptions).sort();

        if (actual.join(',') !== DECLARED_INIT_OPTION_KEYS.join(',')) {
            const added = actual.filter(key => !DECLARED_INIT_OPTION_KEYS.includes(key));
            const removed = DECLARED_INIT_OPTION_KEYS.filter(key => !actual.includes(key));

            throw new Error(
                [
                    EMISSION_SURFACE_NOTICE,
                    '',
                    ...(added.length > 0 ? [`Passed to Sentry.init, not declared here: ${added.join(', ')}`] : []),
                    ...(removed.length > 0 ? [`Declared here, no longer passed to Sentry.init: ${removed.join(', ')}`] : []),
                ].join('\n'),
            );
        }

        expect(actual).toEqual(DECLARED_INIT_OPTION_KEYS);
    });
});
