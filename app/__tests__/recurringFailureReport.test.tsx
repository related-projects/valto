/* eslint-disable react/display-name */
/**
 * Recurring failure report - payload
 *
 * sentryEmissionSurface.test.ts pins WHERE the recurring-failure report is sent
 * from (bootstrap, captureMessage, failure branch, release-gated). It does not
 * look at what the report carries. This file does.
 *
 * DoD (REGISTRE V-72):
 *  - The message handed to Sentry.captureMessage when rules fail carries the
 *    number of failed rules and the number of evaluated rules.
 *  - It carries no rule id. Rule ids are persisted UUIDs, so the same ids would
 *    be sent again on every boot for as long as a rule keeps failing.
 *
 * The boot dependency graph is mocked the same way as storeRecoveryBoot.test.tsx.
 * __DEV__ is switched off around each test so the release-gated branch runs.
 */

import { render, waitFor } from '@testing-library/react-native';
import React from 'react';

// jest hoists jest.mock above imports; only vars prefixed `mock` may be
// referenced inside the factories.
const mockProcessRecurringRules = jest.fn();
const mockLoadSettings = jest.fn();
const mockCaptureMessage = jest.fn();

jest.mock('@sentry/react-native', () => ({
    init: jest.fn(),
    wrap: (c: unknown) => c,
    captureMessage: (...args: unknown[]) => mockCaptureMessage(...args),
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

jest.mock('@/src/data/migrations', () => ({ runMigrations: jest.fn().mockResolvedValue(undefined) }));
jest.mock('@/src/data/seed', () => ({ initializeSeedData: jest.fn().mockResolvedValue(undefined) }));
jest.mock('@/src/data/storage/sql/database', () => ({
    assertStoreReadable: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('@/src/data/services/RecurringTransactionEngine', () => ({
    processRecurringRules: () => mockProcessRecurringRules(),
}));
jest.mock('@/src/data/services/storeRecoveryService', () => ({
    resetCorruptedStore: jest.fn().mockResolvedValue(undefined),
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

import { RootLayout } from '../_layout';

const FAILED_RULE_IDS = [
    'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
    'ffffffff-eeee-dddd-cccc-bbbbbbbbbbbb',
];

const globalWithDev = global as unknown as { __DEV__: boolean };
let originalDev: boolean;

beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    originalDev = globalWithDev.__DEV__;
    globalWithDev.__DEV__ = false;
    mockLoadSettings.mockResolvedValue({ onboardingCompleted: true, language: 'en' });
});

afterEach(() => {
    globalWithDev.__DEV__ = originalDev;
    jest.restoreAllMocks();
});

describe('RootLayout recurring failure report', () => {
    it('sends both counts and no rule id when 2 of 3 rules fail', async () => {
        mockProcessRecurringRules.mockResolvedValue({
            rulesEvaluated: 3,
            transactionsGenerated: 0,
            errors: FAILED_RULE_IDS.map((ruleId) => ({ ruleId, error: 'boom' })),
        });

        const { getByTestId } = render(<RootLayout />);
        await waitFor(() => expect(getByTestId('authed-tree')).toBeTruthy());

        expect(mockCaptureMessage).toHaveBeenCalledTimes(1);
        const [message, level] = mockCaptureMessage.mock.calls[0];
        expect(level).toBe('warning');
        expect(message).toMatch(/\b2 of 3\b/);
        for (const id of FAILED_RULE_IDS) {
            expect(message).not.toContain(id);
        }
    });
});
