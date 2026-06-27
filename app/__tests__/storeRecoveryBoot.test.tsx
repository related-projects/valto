/* eslint-disable react/display-name */
/**
 * Boot Recovery Gate Tests
 *
 * DoD:
 *  - When boot init fails (runMigrations throws), RootLayout renders the
 *    StoreRecoveryScreen and does NOT mount the authenticated tree.
 *  - When the user confirms "Reset data", the filesystem reset runs, init is
 *    re-attempted, and on success the app proceeds to the authenticated tree.
 */

import { fireEvent, render, waitFor } from '@testing-library/react-native';
import React from 'react';
import { Alert } from 'react-native';

// jest hoists jest.mock above imports; only vars prefixed `mock` may be
// referenced inside the factories.
const mockRunMigrations = jest.fn();
const mockInitializeSeedData = jest.fn();
const mockAssertStoreReadable = jest.fn();
const mockProcessRecurringRules = jest.fn();
const mockResetCorruptedStore = jest.fn();
const mockLoadSettings = jest.fn();

// ─── Mocks for the boot dependency graph ────────────────────────────────

jest.mock('@sentry/react-native', () => ({
    init: jest.fn(),
    wrap: (c: unknown) => c,
    captureMessage: jest.fn(),
    captureException: jest.fn(),
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

jest.mock('@/src/core/events/dataEvents', () => ({
    dataEvents: { emit: jest.fn(), emitMultiple: jest.fn() },
}));

import { RootLayout } from '../_layout';

beforeEach(() => {
    jest.clearAllMocks();
    mockInitializeSeedData.mockResolvedValue(undefined);
    mockAssertStoreReadable.mockResolvedValue(undefined);
    mockProcessRecurringRules.mockResolvedValue(undefined);
    mockResetCorruptedStore.mockResolvedValue(undefined);
    mockLoadSettings.mockResolvedValue({ onboardingCompleted: true, language: 'en' });
});

describe('RootLayout boot recovery gate', () => {
    it('renders StoreRecoveryScreen and NOT the authenticated tree when init fails', async () => {
        mockRunMigrations.mockRejectedValue(new Error('corrupt store'));

        const { getByTestId, queryByTestId } = render(<RootLayout />);

        await waitFor(() => expect(getByTestId('store-recovery-screen')).toBeTruthy());
        expect(queryByTestId('authed-tree')).toBeNull();
    });

    it('runs the filesystem reset on confirm and then proceeds to the app', async () => {
        // Fail once (corrupt), succeed on the post-reset re-init.
        mockRunMigrations
            .mockRejectedValueOnce(new Error('corrupt store'))
            .mockResolvedValue(undefined);

        // Auto-confirm the destructive Alert.
        jest.spyOn(Alert, 'alert').mockImplementation((_t, _m, buttons) => {
            buttons?.find((b) => b.style === 'destructive')?.onPress?.();
        });

        const { getByTestId, queryByTestId } = render(<RootLayout />);

        await waitFor(() => expect(getByTestId('store-recovery-screen')).toBeTruthy());

        fireEvent.press(getByTestId('store-recovery-reset'));

        await waitFor(() => expect(getByTestId('authed-tree')).toBeTruthy());
        expect(mockResetCorruptedStore).toHaveBeenCalledTimes(1);
        expect(queryByTestId('store-recovery-screen')).toBeNull();
    });
});
