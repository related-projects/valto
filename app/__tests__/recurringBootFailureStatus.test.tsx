/* eslint-disable react/display-name */
/**
 * A rule whose boot run failed shows a fault (REGISTRE V-111, Owner decision 3,
 * pass 79)
 *
 * The list of rules whose last engine run failed is fed by every run, the boot
 * run included. Boot used to report a failed rule to Sentry as a count and tell
 * the rules screen nothing, so the rule read Active.
 *
 * The boot graph is mocked as in recurringFailureReport.test.tsx, except the
 * container, the engine and the database, which are real: the restart limit
 * (V-115) is forced on one rule with EverChangingRuleDatabase, and the status
 * is read through useRecurringRules, the hook the rules screen renders from.
 *
 * Zones: the fixture is local and relative to the real clock, so the suite
 * holds in whatever zone the process runs in (run under TZ=UTC, Africa/Lagos,
 * America/New_York).
 */

import { render, renderHook, waitFor } from '@testing-library/react-native';
import React from 'react';

import { container } from '@/src/core/di/container';
import { __setDatabaseForTests } from '@/src/data/storage/sql/database';
import { CategoryType, RecurrenceFrequency, TransactionType, WalletType } from '@/src/domain/entities';
import { RecurringRuleStatus, isFaultStatus } from '@/src/domain/recurring';
import { useRecurringRules } from '@/src/hooks/useRecurringRules';
import { createTestDb } from '@/tests/helpers/createTestDb';
import { EverChangingRuleDatabase } from '@/tests/helpers/EverChangingRuleDatabase';
import { RootLayout } from '../_layout';

// jest.mock calls are hoisted above these imports, so the modules above see the
// mocks below.

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

jest.mock('@/src/components/security/SecurityGate', () => ({
    SecurityGate: ({ children }: { children: React.ReactNode }) => {
        const { View: V } = jest.requireActual('react-native');
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
jest.mock('@/src/data/services/storeRecoveryService', () => ({
    resetCorruptedStore: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('@/src/data/services/settingsService', () => ({
    loadSettings: jest.fn().mockResolvedValue({ onboardingCompleted: true, language: 'en' }),
}));
jest.mock('@/src/data/services/usableStateService', () => ({
    ensureUsableState: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('@/src/domain/useCases', () => ({
    ...jest.requireActual('@/src/domain/useCases'),
    verifyFinancialIntegrity: jest.fn().mockResolvedValue(true),
}));

/** Local noon `days` days before today. */
function daysAgo(days: number): Date {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate() - days, 12, 0);
}

let changing: EverChangingRuleDatabase;

beforeEach(async () => {
    jest.spyOn(console, 'log').mockImplementation(() => undefined);
    jest.spyOn(console, 'info').mockImplementation(() => undefined);
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    changing = new EverChangingRuleDatabase(await createTestDb({ writeGuard: true }));
    __setDatabaseForTests(changing);
    container.reset();
    await changing.runInTransaction(async () => {
        await container.walletRepository.save({
            id: 'w-bank',
            name: 'Bank',
            balance: 1000000,
            type: WalletType.BANK,
            createdAt: new Date(2026, 0, 1),
        });
        await container.categoryRepository.save({ id: 'cat-gym', name: 'Gym', type: CategoryType.EXPENSE });
    });
});

afterEach(() => {
    jest.restoreAllMocks();
    __setDatabaseForTests(null);
    container.reset();
});

describe('V-111 decision 3: the boot run feeds the failed-rule list', () => {
    it('V-111 d (boot). a rule the boot run left at the restart limit, references present and funds sufficient: its status is a fault, not Active', async () => {
        const rule = await changing.runInTransaction(() => container.recurringTransactionRepository.create({
            type: TransactionType.EXPENSE,
            amount: 1000,
            walletId: 'w-bank',
            categoryId: 'cat-gym',
            description: 'Gym',
            startDate: daysAgo(2),
            frequency: RecurrenceFrequency.DAILY,
            interval: 1,
        }));
        changing.ruleId = rule.id;
        changing.enabled = true;

        const { getByTestId } = render(<RootLayout />);
        await waitFor(() => expect(getByTestId('authed-tree')).toBeTruthy());
        changing.enabled = false;

        // The forcing: the boot run found the rule changed past the restart
        // limit and wrote nothing for it.
        expect(changing.changedReads).toBeGreaterThan(3);
        const { rows } = await changing.execute(
            'SELECT COUNT(*) AS n FROM transactions WHERE recurring_rule_id = ?',
            [rule.id],
        );
        expect(Number(rows[0].n)).toBe(0);

        const hook = renderHook(() => useRecurringRules());
        await waitFor(() => expect(hook.result.current.loading).toBe(false));
        await waitFor(() => {
            const status = hook.result.current.statuses[rule.id];
            expect(status).not.toBe(RecurringRuleStatus.ACTIVE);
            expect(isFaultStatus(status)).toBe(true);
        });
    });
});
