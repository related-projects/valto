/* eslint-disable react/display-name */
/**
 * App start removes the backup copies a previous session left in the cache
 * (pass 84, item 1 a)
 *
 * A backup's file stays in the cache after the share sheet returns, because
 * the receiving app may still be reading it; a restore's picker copy stays if
 * the process dies before the restore finishes. The next start is where both
 * go. The boot must not depend on it: a delete that fails leaves the app
 * booting as before. Since pass 84b (item 2) the CSV and PDF exports left in
 * the cache go at the same point.
 *
 * The boot graph is mocked as in storeRecoveryBoot.test.tsx; the file system is
 * tests/helpers/memoryFileSystem, so the cleanup runs for real.
 */

import * as Sentry from '@sentry/react-native';
import { render, waitFor } from '@testing-library/react-native';
import React from 'react';

import { MemoryFile, memoryContents, memoryFiles } from '../../tests/helpers/memoryFileSystem';
import { RootLayout } from '../_layout';

// jest hoists jest.mock above imports; only vars prefixed `mock` may be
// referenced inside the factories.
const mockRunMigrations = jest.fn();
const mockInitializeSeedData = jest.fn();
const mockAssertStoreReadable = jest.fn();
const mockProcessRecurringRules = jest.fn();
const mockLoadSettings = jest.fn();

jest.mock('expo-file-system', () =>
    jest.requireActual('../../tests/helpers/memoryFileSystem').memoryFileSystemModule());

jest.mock('@sentry/react-native', () => ({
    init: jest.fn(),
    wrap: (c: unknown) => c,
    captureMessage: jest.fn(),
    captureException: jest.fn(),
    addBreadcrumb: jest.fn(),
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

jest.mock('@/src/data/migrations', () => ({ runMigrations: () => mockRunMigrations() }));
jest.mock('@/src/data/seed', () => ({ initializeSeedData: () => mockInitializeSeedData() }));
jest.mock('@/src/data/storage/sql/database', () => ({
    assertStoreReadable: () => mockAssertStoreReadable(),
}));
jest.mock('@/src/data/services/RecurringTransactionEngine', () => ({
    processRecurringRules: () => mockProcessRecurringRules(),
}));
jest.mock('@/src/data/services/storeRecoveryService', () => ({
    resetCorruptedStore: jest.fn(),
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

const LEFTOVER_BACKUP = 'file:///cache/valto-backup-2026-10-27T09-15-00-000Z.json';
// Not a Valto file: the CSV and PDF exports are swept too since pass 84b.
const OTHER_IN_CACHE = 'file:///cache/report.pdf';
const PICKER_COPY = 'file:///cache/DocumentPicker/3f2b8c1e-9a4d-4c6b-8e21-5d7f0a9b1c3e.json';
const OTHER_IN_PICKER = 'file:///cache/DocumentPicker/notes.txt';
const LEFTOVER_CSV = 'file:///cache/valto_transactions_2026-10-27.csv';
const LEFTOVER_PDF = 'file:///cache/valto_report_2026-09.pdf';

afterEach(() => {
    jest.restoreAllMocks();
});

beforeEach(() => {
    jest.clearAllMocks();
    memoryFiles.clear();
    memoryContents.clear();
    for (const uri of [LEFTOVER_BACKUP, OTHER_IN_CACHE, PICKER_COPY, OTHER_IN_PICKER, LEFTOVER_CSV, LEFTOVER_PDF]) {
        new MemoryFile(uri).write('{}');
    }
    mockRunMigrations.mockResolvedValue(undefined);
    mockInitializeSeedData.mockResolvedValue(undefined);
    mockAssertStoreReadable.mockResolvedValue(undefined);
    mockProcessRecurringRules.mockResolvedValue(undefined);
    mockLoadSettings.mockResolvedValue({ onboardingCompleted: true, language: 'en' });
});

describe('pass 84 item 1 a. app start', () => {
    it('pass 84 item 1 a. removes the leftover backup and restore copy, keeps the other files', async () => {
        expect(memoryFiles.has(LEFTOVER_BACKUP)).toBe(true);
        expect(memoryFiles.has(PICKER_COPY)).toBe(true);

        const { getByTestId } = render(<RootLayout />);
        await waitFor(() => expect(getByTestId('authed-tree')).toBeTruthy());

        expect(memoryFiles.has(LEFTOVER_BACKUP)).toBe(false);
        expect(memoryFiles.has(PICKER_COPY)).toBe(false);
        expect(memoryFiles.has(OTHER_IN_CACHE)).toBe(true);
        expect(memoryFiles.has(OTHER_IN_PICKER)).toBe(true);
    });

    it('pass 84 item 1 a. a delete that throws does not stop the boot and sends nothing', async () => {
        const deleteSpy = jest.spyOn(MemoryFile.prototype, 'delete').mockImplementation(() => {
            throw new Error('ERR_FILE_NOT_WRITABLE');
        });

        const { getByTestId, queryByTestId } = render(<RootLayout />);
        await waitFor(() => expect(getByTestId('authed-tree')).toBeTruthy());

        expect(deleteSpy).toHaveBeenCalled();
        expect(queryByTestId('store-recovery-screen')).toBeNull();
        expect(Sentry.captureException).not.toHaveBeenCalled();
        expect(Sentry.captureMessage).not.toHaveBeenCalled();
        expect(Sentry.addBreadcrumb).not.toHaveBeenCalled();
    });

    it('pass 84b item 2. removes the leftover CSV and PDF exports, keeps the other files', async () => {
        expect(memoryFiles.has(LEFTOVER_CSV)).toBe(true);
        expect(memoryFiles.has(LEFTOVER_PDF)).toBe(true);

        const { getByTestId } = render(<RootLayout />);
        await waitFor(() => expect(getByTestId('authed-tree')).toBeTruthy());

        expect(memoryFiles.has(LEFTOVER_CSV)).toBe(false);
        expect(memoryFiles.has(LEFTOVER_PDF)).toBe(false);
        expect(memoryFiles.has(OTHER_IN_CACHE)).toBe(true);
        expect(memoryFiles.has(OTHER_IN_PICKER)).toBe(true);
    });
});
