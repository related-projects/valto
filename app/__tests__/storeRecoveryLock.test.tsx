/* eslint-disable react/display-name */
/**
 * Recovery Screen Lock Tests (REGISTRE V-109, W12)
 *
 * "Try again" re-runs the boot sequence, migrations included, and "Reset
 * data" deletes the store and then runs it again. The migrations write outside
 * the runner queue, so each action must run alone: once one has started, every
 * press on either button is ignored until it settles (Owner decision of 01/10,
 * pass 69).
 *
 * The presses go through tests/helpers/pressInOneBatch.ts, so a second press
 * reaches its button before React has committed the state the first one set,
 * as on a device (REGISTRE V-112). runMigrations is mocked. In the regression
 * tests the first action is held open - a retry on a deferred promise, a
 * reset at its confirmation - so the assertions are made while it is still
 * running.
 */

import { act, render, waitFor } from '@testing-library/react-native';
import React from 'react';
import { Alert } from 'react-native';

import {
    pressEachInOneBatch,
    pressOnce,
    pressTwiceInOneBatch,
    settle,
} from '../../tests/helpers/pressInOneBatch';
import { RootLayout } from '../_layout';

// jest hoists jest.mock above imports, so the mocks below are in place when
// _layout loads; only vars prefixed `mock` may be referenced inside the
// factories.
const mockRunMigrations = jest.fn();
const mockInitializeSeedData = jest.fn();
const mockAssertStoreReadable = jest.fn();
const mockProcessRecurringRules = jest.fn();
const mockResetCorruptedStore = jest.fn();
const mockLoadSettings = jest.fn();

// --- Mocks for the boot dependency graph (as in storeRecoveryBoot.test.tsx) --

jest.mock('@sentry/react-native', () => ({
    init: jest.fn(),
    wrap: (c: unknown) => c,
    captureMessage: jest.fn(),
    captureException: jest.fn(),
    breadcrumbsIntegration: jest.fn(() => ({ name: 'Breadcrumbs' })),
}));

jest.mock('expo-router', () => {
    const Stack: any = () => null;
    Stack.Screen = () => null;
    return { Stack, router: { back: jest.fn() }, unstable_settings: {} };
});

jest.mock('react-native-safe-area-context', () => ({
    useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

// SecurityGate stands in for the authenticated subtree marker.
jest.mock('@/src/components/security/SecurityGate', () => ({
    SecurityGate: ({ children }: { children: React.ReactNode }) => {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const { View: V } = require('react-native');
        return <V testID="authed-tree">{children}</V>;
    },
}));

jest.mock('@/src/core/security/SecurityContext', () => ({
    SecurityProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

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

jest.mock('@/src/data/services/usableStateService', () => ({
    ensureUsableState: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('@/src/core/events/dataEvents', () => ({
    dataEvents: { emit: jest.fn(), emitMultiple: jest.fn() },
}));

// --- Helpers ------------------------------------------------------------

interface Deferred {
    promise: Promise<void>;
    resolve: () => void;
}

function deferred(): Deferred {
    let resolve!: () => void;
    const promise = new Promise<void>((res) => {
        resolve = res;
    });
    return { promise, resolve };
}

/** Answer every reset confirmation: confirm it, cancel it, or close it without a choice. */
function answerConfirmation(choice: 'confirm' | 'cancel' | 'dismiss') {
    return jest.spyOn(Alert, 'alert').mockImplementation((_title, _message, buttons, options) => {
        if (choice === 'dismiss') {
            options?.onDismiss?.();
            return;
        }
        const style = choice === 'confirm' ? 'destructive' : 'cancel';
        buttons?.find((b) => b.style === style)?.onPress?.();
    });
}

/** Mount RootLayout with a boot that fails, so the recovery screen shows. */
async function renderRecoveryScreen() {
    mockRunMigrations.mockRejectedValueOnce(new Error('corrupt store'));
    const screen = render(<RootLayout />);
    await waitFor(() => expect(screen.getByTestId('store-recovery-screen')).toBeTruthy());
    // Count only what the presses below start.
    mockRunMigrations.mockClear();
    return screen;
}

beforeEach(() => {
    jest.clearAllMocks();
    mockRunMigrations.mockReset();
    mockRunMigrations.mockResolvedValue(undefined);
    mockResetCorruptedStore.mockReset();
    mockResetCorruptedStore.mockResolvedValue(undefined);
    mockInitializeSeedData.mockResolvedValue(undefined);
    mockAssertStoreReadable.mockResolvedValue(undefined);
    mockProcessRecurringRules.mockResolvedValue(undefined);
    mockLoadSettings.mockResolvedValue({ onboardingCompleted: true, language: 'en' });
});

afterEach(() => {
    jest.restoreAllMocks();
});

// --- Tests --------------------------------------------------------------

describe('RootLayout recovery screen lock (V-109 W12)', () => {
    it('V-109 W12 a: two presses on "Try again" in one batch run the migrations once', async () => {
        const screen = await renderRecoveryScreen();
        const retry = deferred();
        mockRunMigrations.mockReturnValue(retry.promise);

        pressTwiceInOneBatch(screen.getByTestId('store-recovery-retry'));
        await settle();

        // The retry is still running: its migrations have not settled.
        expect(mockRunMigrations).toHaveBeenCalledTimes(1);

        retry.resolve();
        await settle();
        expect(mockRunMigrations).toHaveBeenCalledTimes(1);
        expect(screen.getByTestId('authed-tree')).toBeTruthy();
    });

    it('V-109 W12 b: "Try again" then "Reset" in one batch: the reset does not start while the retry runs', async () => {
        const screen = await renderRecoveryScreen();
        const retry = deferred();
        mockRunMigrations.mockReturnValue(retry.promise);
        answerConfirmation('confirm');

        pressEachInOneBatch(
            screen.getByTestId('store-recovery-retry'),
            screen.getByTestId('store-recovery-reset'),
        );
        await settle();

        // The retry is still running: its migrations have not settled.
        expect(mockResetCorruptedStore).not.toHaveBeenCalled();
        expect(mockRunMigrations).toHaveBeenCalledTimes(1);

        // The ignored press is not replayed once the retry has settled.
        retry.resolve();
        await settle();
        expect(mockResetCorruptedStore).not.toHaveBeenCalled();
        expect(screen.getByTestId('authed-tree')).toBeTruthy();
    });

    it('V-109 W12 c: "Reset" then "Try again" in one batch: the retry does not start while the reset runs', async () => {
        const screen = await renderRecoveryScreen();
        // Hold the confirmation open until the test answers it.
        let confirm: (() => void) | undefined;
        jest.spyOn(Alert, 'alert').mockImplementation((_title, _message, buttons) => {
            confirm = buttons?.find((b) => b.style === 'destructive')?.onPress;
        });

        pressEachInOneBatch(
            screen.getByTestId('store-recovery-reset'),
            screen.getByTestId('store-recovery-retry'),
        );
        await settle();

        // The reset has started: its confirmation is open.
        expect(confirm).toBeDefined();
        expect(mockRunMigrations).not.toHaveBeenCalled();

        // Confirmed: only the reset's own boot sequence runs.
        await act(async () => {
            confirm?.();
        });
        await settle();
        expect(mockResetCorruptedStore).toHaveBeenCalledTimes(1);
        expect(mockRunMigrations).toHaveBeenCalledTimes(1);
        expect(screen.getByTestId('authed-tree')).toBeTruthy();
    });

    it('control: a single press on "Try again" runs the boot sequence once', async () => {
        const screen = await renderRecoveryScreen();

        pressOnce(screen.getByTestId('store-recovery-retry'));
        await settle();

        expect(mockRunMigrations).toHaveBeenCalledTimes(1);
        expect(screen.getByTestId('authed-tree')).toBeTruthy();
    });

    it('control: a "Try again" that fails again shows the recovery screen, and a new "Try again" then works', async () => {
        const screen = await renderRecoveryScreen();
        mockRunMigrations.mockRejectedValueOnce(new Error('still corrupt'));

        pressOnce(screen.getByTestId('store-recovery-retry'));
        await settle();
        expect(screen.getByTestId('store-recovery-screen')).toBeTruthy();

        pressOnce(screen.getByTestId('store-recovery-retry'));
        await settle();

        expect(mockRunMigrations).toHaveBeenCalledTimes(2);
        expect(screen.getByTestId('authed-tree')).toBeTruthy();
    });

    it('control: after a "Try again" that fails again, a confirmed "Reset" then runs', async () => {
        const screen = await renderRecoveryScreen();
        mockRunMigrations.mockRejectedValueOnce(new Error('still corrupt'));

        pressOnce(screen.getByTestId('store-recovery-retry'));
        await settle();
        expect(screen.getByTestId('store-recovery-screen')).toBeTruthy();

        answerConfirmation('confirm');
        pressOnce(screen.getByTestId('store-recovery-reset'));
        await settle();

        expect(mockResetCorruptedStore).toHaveBeenCalledTimes(1);
        expect(mockRunMigrations).toHaveBeenCalledTimes(2);
        expect(screen.getByTestId('authed-tree')).toBeTruthy();
    });

    it('control: a single confirmed "Reset" runs the reset once', async () => {
        const screen = await renderRecoveryScreen();
        answerConfirmation('confirm');

        pressOnce(screen.getByTestId('store-recovery-reset'));
        await settle();

        expect(mockResetCorruptedStore).toHaveBeenCalledTimes(1);
        expect(mockRunMigrations).toHaveBeenCalledTimes(1);
        expect(screen.getByTestId('authed-tree')).toBeTruthy();
    });

    async function expectBothButtonsUsableAfterClosing(choice: 'cancel' | 'dismiss') {
        const screen = await renderRecoveryScreen();
        const alert = answerConfirmation(choice);

        pressOnce(screen.getByTestId('store-recovery-reset'));
        await settle();
        expect(alert).toHaveBeenCalledTimes(1);
        expect(mockResetCorruptedStore).not.toHaveBeenCalled();

        // "Reset" again: the confirmation opens again.
        pressOnce(screen.getByTestId('store-recovery-reset'));
        await settle();
        expect(alert).toHaveBeenCalledTimes(2);
        expect(mockResetCorruptedStore).not.toHaveBeenCalled();

        // "Try again": the boot sequence runs.
        pressOnce(screen.getByTestId('store-recovery-retry'));
        await settle();
        expect(mockRunMigrations).toHaveBeenCalledTimes(1);
        expect(screen.getByTestId('authed-tree')).toBeTruthy();
    }

    it('control: a cancelled confirmation leaves both buttons usable', async () => {
        await expectBothButtonsUsableAfterClosing('cancel');
    });

    it('control: a confirmation closed without a choice leaves both buttons usable', async () => {
        await expectBothButtonsUsableAfterClosing('dismiss');
    });

    it('control: a confirmed "Reset" that fails leaves both buttons usable', async () => {
        const screen = await renderRecoveryScreen();
        mockResetCorruptedStore.mockRejectedValueOnce(new Error('delete failed'));
        const alert = answerConfirmation('confirm');

        pressOnce(screen.getByTestId('store-recovery-reset'));
        await settle();
        expect(mockResetCorruptedStore).toHaveBeenCalledTimes(1);
        expect(mockRunMigrations).not.toHaveBeenCalled();
        expect(screen.getByTestId('store-recovery-screen')).toBeTruthy();

        // "Reset" again: the confirmation opens again (cancelled this time).
        alert.mockImplementation((_title, _message, buttons) => {
            buttons?.find((b) => b.style === 'cancel')?.onPress?.();
        });
        pressOnce(screen.getByTestId('store-recovery-reset'));
        await settle();
        expect(alert).toHaveBeenCalledTimes(2);

        // "Try again": the boot sequence runs.
        pressOnce(screen.getByTestId('store-recovery-retry'));
        await settle();
        expect(mockRunMigrations).toHaveBeenCalledTimes(1);
        expect(screen.getByTestId('authed-tree')).toBeTruthy();
    });
});
