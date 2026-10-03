/* eslint-disable react/display-name */
/**
 * V-119 / V-106: a blocking wait screen while a restore runs (Owner decision 1,
 * pass 74).
 *
 * The audited path (pass 74): once the second confirmation was accepted, the
 * only trace of a running restore was the shared `loading` flag, which shows a
 * "Processing..." banner on the settings screen and blocks nothing. Back up,
 * the tabs, the add button and every form stayed usable, and any other action
 * that cleared `loading` hid the banner while the restore kept running.
 *
 * From "Restore Now" until the restore call settles, catch-up included, one
 * full-screen wait screen covers the whole app: it does not depend on the
 * shared `loading`, it survives the settings screen being unmounted (the app
 * locks itself when the file picker sends it to the background), and the
 * Android back button does not dismiss it.
 *
 * Renders the real RootLayout. The settings screen is stood in for by a probe
 * that mounts the real useSettings hook inside the authenticated tree; the
 * restore itself is a seam held open by a deferred promise.
 */

import { act, render, waitFor } from '@testing-library/react-native';
import React from 'react';
import { Alert, Modal } from 'react-native';

import { SnapshotRejectedError } from '@/src/data/services/backupService';
import i18n from '@/src/localization/i18n';
import { RootLayout } from '../_layout';

// jest hoists jest.mock above these imports, and the factories below read the
// `mock` variables only when they are called, after this module has run; only
// vars prefixed `mock` may be referenced inside the factories.
const mockRunMigrations = jest.fn();
const mockLoadSettings = jest.fn();
const mockPickAndRestoreBackup = jest.fn();
const mockCreateAndShareBackup = jest.fn();

/** The useSettings result of the mounted probe, refreshed on every render. */
const mockProbe: { current: any } = { current: null };
/** Locks and unlocks the stand-in security gate, as the auto-lock does. */
const mockGate: { setLocked: ((locked: boolean) => void) | null } = { setLocked: null };

// --- Mocks for the boot dependency graph ---

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

jest.mock('expo-notifications', () => ({
    getPermissionsAsync: jest.fn().mockResolvedValue({ status: 'denied' }),
    requestPermissionsAsync: jest.fn(),
    scheduleNotificationAsync: jest.fn().mockResolvedValue('mock-id'),
    cancelAllScheduledNotificationsAsync: jest.fn().mockResolvedValue(undefined),
    cancelScheduledNotificationAsync: jest.fn().mockResolvedValue(undefined),
    setNotificationChannelAsync: jest.fn().mockResolvedValue(undefined),
    setNotificationHandler: jest.fn(),
    SchedulableTriggerInputTypes: { TIME_INTERVAL: 'timeInterval', DAILY: 'daily' },
    AndroidImportance: { HIGH: 6 },
}));

// The security gate: unlocked, it renders the authenticated tree with the
// settings probe in it; locked, the lock screen INSTEAD of that tree, as the
// real SecurityGate does.
jest.mock('@/src/components/security/SecurityGate', () => {
    // None of the three is mocked, so requireActual hands back the instance
    // every other module gets.
    const { useState } = jest.requireActual('react');
    const { View: V } = jest.requireActual('react-native');
    const { useSettings } = jest.requireActual('@/src/hooks/useSettings');

    function SettingsProbe() {
        mockProbe.current = useSettings();
        return null;
    }

    return {
        SecurityGate: ({ children }: { children: React.ReactNode }) => {
            const [locked, setLocked] = useState(false);
            mockGate.setLocked = setLocked;
            if (locked) {
                return <V testID="lock-screen" />;
            }
            return (
                <V testID="authed-tree">
                    <SettingsProbe />
                    {children}
                </V>
            );
        },
    };
});

jest.mock('@/src/core/security/SecurityContext', () => ({
    SecurityProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

jest.mock('@/src/features/onboarding/screens/OnboardingScreen', () => ({
    OnboardingScreen: () => null,
}));

jest.mock('@/src/data/migrations', () => ({ runMigrations: () => mockRunMigrations() }));
jest.mock('@/src/data/seed', () => ({ initializeSeedData: jest.fn().mockResolvedValue(undefined) }));
jest.mock('@/src/data/storage/sql/database', () => ({
    assertStoreReadable: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('@/src/data/services/RecurringTransactionEngine', () => ({
    processRecurringRules: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('@/src/data/services/storeRecoveryService', () => ({
    resetCorruptedStore: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('@/src/data/services/settingsService', () => ({
    loadSettings: () => mockLoadSettings(),
}));
jest.mock('@/src/data/services/usableStateService', () => ({
    ensureUsableState: jest.fn().mockResolvedValue(undefined),
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
    dataEvents: { emit: jest.fn(), emitMultiple: jest.fn(), subscribe: jest.fn(() => jest.fn()) },
}));

// backupService is required for real below (SnapshotRejectedError has to be the
// same class the hook narrows on), so its native dependencies need stubs.
jest.mock('expo-document-picker', () => ({ getDocumentAsync: jest.fn() }));
jest.mock('expo-file-system', () => ({ File: jest.fn(), Paths: { cache: '/mock/cache' } }));
jest.mock('expo-sharing', () => ({
    shareAsync: jest.fn().mockResolvedValue(undefined),
    isAvailableAsync: jest.fn().mockResolvedValue(true),
}));

// The restore is a seam: the test decides when it settles and how.
jest.mock('@/src/data/services/backupService', () => ({
    ...jest.requireActual('@/src/data/services/backupService'),
    createAndShareBackup: () => mockCreateAndShareBackup(),
    pickAndRestoreBackup: () => mockPickAndRestoreBackup(),
}));

const QUIET_RESTORE = { catchUpGenerated: 0, rulesNotProcessed: 0, catchUpFailed: false };

/** Titles of every alert shown, in order. */
let alertTitles: string[] = [];

/** Settles the restore the probe started; null when none was started. */
let settleRestore: { resolve: (value: unknown) => void; reject: (error: unknown) => void } | null = null;

beforeEach(() => {
    jest.clearAllMocks();
    mockProbe.current = null;
    mockGate.setLocked = null;
    alertTitles = [];
    mockRunMigrations.mockResolvedValue(undefined);
    mockLoadSettings.mockResolvedValue({ onboardingCompleted: true, language: 'en' });
    mockCreateAndShareBackup.mockResolvedValue(undefined);
    mockPickAndRestoreBackup.mockImplementation(
        () =>
            new Promise((resolve, reject) => {
                settleRestore = { resolve, reject };
            }),
    );
    // Record every alert and accept every destructive choice: both restore
    // confirmations, in order.
    jest.spyOn(Alert, 'alert').mockImplementation((title, _message, buttons) => {
        alertTitles.push(title);
        buttons?.find((b) => b.style === 'destructive')?.onPress?.();
    });
});

// A restore left held open by a test still counts as running for the next one:
// settle it, as every real restore eventually settles.
afterEach(async () => {
    const pending = settleRestore;
    settleRestore = null;
    if (pending) {
        await act(async () => {
            pending.resolve(QUIET_RESTORE);
        });
    }
});

/** Boot the app to the authenticated tree, with the settings probe mounted. */
async function bootApp() {
    const screen = render(<RootLayout />);
    await waitFor(() => expect(screen.getByTestId('authed-tree')).toBeTruthy());
    await waitFor(() => expect(mockProbe.current).not.toBeNull());
    return screen;
}

/** Restore Data -> Continue -> Restore Now; the restore is then held open. */
async function startRestore() {
    await act(async () => {
        mockProbe.current.restoreBackup();
    });
    expect(mockPickAndRestoreBackup).toHaveBeenCalledTimes(1);
}

describe('V-119 / V-106. the blocking wait screen while a restore runs', () => {
    it('V-119/V-106 a: with a restore held open, the wait screen is visible', async () => {
        const screen = await bootApp();
        await startRestore();

        expect(await screen.findByTestId('restore-wait-screen')).toBeTruthy();
    });

    it('V-119/V-106 b: it stays visible when another action using the shared loading state finishes', async () => {
        const screen = await bootApp();
        await startRestore();
        expect(await screen.findByTestId('restore-wait-screen')).toBeTruthy();

        // A backup sets and clears the shared `loading`.
        await act(async () => {
            await mockProbe.current.createBackup();
        });
        expect(mockCreateAndShareBackup).toHaveBeenCalledTimes(1);
        expect(mockProbe.current.loading).toBe(false);

        expect(screen.getByTestId('restore-wait-screen')).toBeTruthy();
    });

    it('V-119/V-106 c: it stays visible when the settings screen is unmounted by the auto-lock, then disappears when the restore settles', async () => {
        const screen = await bootApp();
        await startRestore();
        expect(await screen.findByTestId('restore-wait-screen')).toBeTruthy();

        // The file picker sent the app to the background and it locked itself.
        act(() => {
            mockGate.setLocked?.(true);
        });
        expect(screen.getByTestId('lock-screen')).toBeTruthy();
        expect(screen.queryByTestId('authed-tree')).toBeNull();

        expect(screen.getByTestId('restore-wait-screen')).toBeTruthy();

        await act(async () => {
            settleRestore!.resolve(QUIET_RESTORE);
        });
        await waitFor(() => expect(screen.queryByTestId('restore-wait-screen')).toBeNull());
    });

    it('V-119/V-106 d: the Android back button does not dismiss it', async () => {
        const screen = await bootApp();
        await startRestore();
        expect(await screen.findByTestId('restore-wait-screen')).toBeTruthy();

        // Android delivers the back button to a visible Modal as onRequestClose.
        const visibleModals = screen.UNSAFE_getAllByType(Modal).filter((m) => m.props.visible);
        expect(visibleModals).toHaveLength(1);
        act(() => {
            visibleModals[0].props.onRequestClose?.();
        });

        expect(screen.getByTestId('restore-wait-screen')).toBeTruthy();
    });

    it('V-119/V-106 e: it disappears when the restore succeeds', async () => {
        const screen = await bootApp();
        await startRestore();
        expect(await screen.findByTestId('restore-wait-screen')).toBeTruthy();

        await act(async () => {
            settleRestore!.resolve(QUIET_RESTORE);
        });

        await waitFor(() => expect(screen.queryByTestId('restore-wait-screen')).toBeNull());
    });

    it('V-119/V-106 f: it disappears when the restore is refused', async () => {
        const screen = await bootApp();
        await startRestore();
        expect(await screen.findByTestId('restore-wait-screen')).toBeTruthy();

        await act(async () => {
            settleRestore!.reject(new SnapshotRejectedError('refused', 'missingCurrency'));
        });

        await waitFor(() => expect(screen.queryByTestId('restore-wait-screen')).toBeNull());
    });
});

describe('V-119 / V-106 controls: the restore still reports its outcome', () => {
    it('control: a successful restore still ends with its normal alert', async () => {
        await bootApp();
        await startRestore();

        await act(async () => {
            settleRestore!.resolve(QUIET_RESTORE);
        });

        await waitFor(() => expect(alertTitles).toContain(i18n.t('alerts.restoreSuccess')));
        expect(alertTitles).not.toContain(i18n.t('alerts.restoreFailed'));
    });

    it('control: a refused restore still ends with its failure alert', async () => {
        await bootApp();
        await startRestore();

        await act(async () => {
            settleRestore!.reject(new SnapshotRejectedError('refused', 'missingCurrency'));
        });

        await waitFor(() => expect(alertTitles).toContain(i18n.t('alerts.restoreFailed')));
        expect(alertTitles).not.toContain(i18n.t('alerts.restoreSuccess'));
    });
});
