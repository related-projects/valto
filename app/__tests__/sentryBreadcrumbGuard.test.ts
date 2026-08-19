/**
 * Sentry Breadcrumb Guard Tests
 *
 * DoD:
 *  - A breadcrumb of category 'console' is dropped (the hook returns null), for
 *    every console level, including when the payload carries financial values.
 *  - Breadcrumbs of every other category pass through by reference, unchanged.
 *  - The guard is actually INSTALLED in the app's Sentry.init - asserted on the
 *    options object handed to Sentry.init, not by calling the guard in
 *    isolation. A filter that is never installed is the same as no filter.
 */

import type { Breadcrumb } from '@sentry/react-native';

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

// NOT mocked: the guard itself. Test 3 compares the installed hook against this
// exact reference, so it must be the real implementation.
import { dropConsoleBreadcrumbs } from '@/src/core/observability/sentryBreadcrumbGuard';
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
