/* eslint-disable react/display-name */
/**
 * Recovery Reset when the stored database key cannot be read (pass 82, Owner
 * decision 2)
 *
 * expo-secure-store throws on every read of an entry it can no longer decrypt
 * (SecureStoreModule.kt:169-174: a GeneralSecurityException, or any other
 * failure, while an entry exists) and reads a missing entry as null (:93-98).
 * Boot reads the database key before anything else (runMigrations ->
 * initDatabase -> OpSQLiteDatabase.create -> getOrCreateEncryptionKey), so such
 * an entry sends every boot to StoreRecoveryScreen. Reset deleted the database
 * files and kept the entry, so the boot it re-ran read the same entry and
 * failed the same way: Retry and Reset both ended where they started, with no
 * way out short of clearing the app's storage in Android settings.
 *
 * Real here: runMigrations, database.ts, OpSQLiteDatabase, encryptionKey and
 * storeRecoveryService. The stand-ins:
 *  - expo-secure-store keeps entries as the native module does: an entry it
 *    cannot decrypt throws on every read until it is deleted, and deleteItemImpl
 *    (:243-258) removes it without decrypting it;
 *  - op-sqlite opens better-sqlite3 behind a SQLCipher key check: a file opened
 *    with another key still answers PRAGMA cipher_version, then fails every
 *    statement with "file is not a database";
 *  - the database file lives in memoryFileSystem, so the reset's deletion is
 *    what makes the next open a fresh database.
 * The rest of the boot graph is mocked as in storeRecoveryBoot.test.tsx.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import * as SecureStore from 'expo-secure-store';
import React from 'react';
import { Alert } from 'react-native';

import { closeDatabase } from '@/src/data/storage/sql/database';
import { StorageKeys } from '@/src/data/storage/StorageKeys';
import { BetterSqliteDatabase } from '../../tests/helpers/BetterSqliteDatabase';
import { memoryFiles } from '../../tests/helpers/memoryFileSystem';
import { RootLayout } from '../_layout';

/** The alias the database key is stored under (encryptionKey.ts:14). */
const KEY_ALIAS = 'valto.db.encryption_key';

/** Where op-sqlite keeps valto.db on Android (getDatabasePath). */
const DB_DIR = '/data/user/0/com.renkakpo.valto.app/databases';
const DB_URI = `file://${DB_DIR}/valto.db`;

// jest hoists jest.mock above imports; only vars prefixed `mock` may be
// referenced inside the factories, and only when a mock is called.
const mockInitializeSeedData = jest.fn();
const mockProcessRecurringRules = jest.fn();
const mockLoadSettings = jest.fn();

// --- expo-secure-store: entries as SecureStoreModule.kt keeps them ----------

/** An entry the keystore can no longer decrypt. */
const mockUnreadableEntry = '<entry the keystore can no longer decrypt>';
const mockSecureEntries = new Map<string, string>();

jest.mock('expo-secure-store', () => ({
    getItemAsync: jest.fn(async (key: string) => {
        const entry = mockSecureEntries.get(key);
        if (entry === mockUnreadableEntry) {
            throw new Error(`Could not decrypt the value for key ${key}`);
        }
        return entry ?? null;
    }),
    setItemAsync: jest.fn(async (key: string, value: string) => {
        mockSecureEntries.set(key, value);
    }),
    deleteItemAsync: jest.fn(async (key: string) => {
        mockSecureEntries.delete(key);
    }),
    AFTER_FIRST_UNLOCK: 'AFTER_FIRST_UNLOCK',
}));

// Distinct bytes on every call, so two generated keys never match.
let mockRandomCalls = 0;
jest.mock('expo-crypto', () => ({
    getRandomBytesAsync: jest.fn(async (count: number) => {
        mockRandomCalls += 1;
        return Uint8Array.from({ length: count }, (_, i) => (mockRandomCalls * 37 + i) % 256);
    }),
}));

// --- op-sqlite over better-sqlite3, behind a SQLCipher key check ------------

/** The key each database file on "disk" was created with, and its contents. */
const mockDiskDatabases = new Map<string, { key: string; db: BetterSqliteDatabase }>();

const mockOpen = jest.fn((options: { name: string; encryptionKey: string }) => {
    const uri = `file://${DB_DIR}/${options.name}`;
    if (!memoryFiles.has(uri)) {
        memoryFiles.add(uri);
        mockDiskDatabases.set(uri, { key: options.encryptionKey, db: new BetterSqliteDatabase() });
    }
    const stored = mockDiskDatabases.get(uri)!;
    const readable = stored.key === options.encryptionKey;
    return {
        execute: async (sql: string, params?: unknown[]) => {
            if (/^\s*PRAGMA cipher_version/i.test(sql)) {
                return { rows: [{ cipher_version: '4.6.1 community' }], rowsAffected: 0 };
            }
            if (!readable) {
                throw new Error('file is not a database');
            }
            return stored.db.execute(sql, params ?? []);
        },
        getDbPath: () => `${DB_DIR}/${options.name}`,
        close: () => undefined,
    };
});

jest.mock('@op-engineering/op-sqlite', () => ({
    open: (options: { name: string; encryptionKey: string }) => mockOpen(options),
    ANDROID_DATABASE_PATH: '/data/user/0/com.renkakpo.valto.app/databases',
    IOS_LIBRARY_PATH: '/data/user/0/com.renkakpo.valto.app/databases',
}));

jest.mock('expo-file-system', () =>
    jest.requireActual('../../tests/helpers/memoryFileSystem').memoryFileSystemModule());

// --- The rest of the boot graph (as in storeRecoveryBoot.test.tsx) ----------

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

jest.mock('@/src/data/seed', () => ({ initializeSeedData: () => mockInitializeSeedData() }));
jest.mock('@/src/data/services/RecurringTransactionEngine', () => ({
    processRecurringRules: () => mockProcessRecurringRules(),
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

// --- Helpers ----------------------------------------------------------------

const getItem = SecureStore.getItemAsync as jest.Mock;
const setItem = SecureStore.setItemAsync as jest.Mock;

/** The key passed to the most recent open(). */
function lastOpenedKey(): string {
    const calls = mockOpen.mock.calls;
    return calls[calls.length - 1][0].encryptionKey;
}

/** Confirm every reset confirmation. */
function confirmResets() {
    jest.spyOn(Alert, 'alert').mockImplementation((_title, _message, buttons) => {
        buttons?.find((b) => b.style === 'destructive')?.onPress?.();
    });
}

/** An install that has been running: migrated to v10 and seeded. */
async function existingInstall() {
    await AsyncStorage.setItem(StorageKeys.SCHEMA_VERSION, JSON.stringify(10));
    await AsyncStorage.setItem(StorageKeys.SEED_INITIALIZED, JSON.stringify(true));
}

/** A valto.db already on disk, created with `key`. */
function databaseFileOnDisk(key: string) {
    memoryFiles.add(DB_URI);
    mockDiskDatabases.set(DB_URI, { key, db: new BetterSqliteDatabase() });
}

beforeEach(async () => {
    jest.clearAllMocks();
    closeDatabase();
    await AsyncStorage.clear();
    memoryFiles.clear();
    mockDiskDatabases.clear();
    mockSecureEntries.clear();
    mockInitializeSeedData.mockResolvedValue(undefined);
    mockProcessRecurringRules.mockResolvedValue(undefined);
    mockLoadSettings.mockResolvedValue({ onboardingCompleted: true, language: 'en' });
});

afterEach(() => {
    jest.restoreAllMocks();
    closeDatabase();
});

describe('pass 82 b. Reset when the stored database key cannot be read', () => {
    it('pass 82 b: after Reset, the next boot creates a new key and opens a fresh database instead of returning to the recovery screen', async () => {
        await existingInstall();
        mockSecureEntries.set(KEY_ALIAS, mockUnreadableEntry);
        databaseFileOnDisk('the key the keystore lost');
        confirmResets();

        const { getByTestId, queryByTestId, unmount } = render(<RootLayout />);

        // Precondition: the key read throws, so boot stops before opening the
        // database and lands on the recovery screen.
        await waitFor(() => expect(getByTestId('store-recovery-screen')).toBeTruthy());
        expect(getItem).toHaveBeenCalledWith(KEY_ALIAS);
        await expect(getItem.mock.results[0].value).rejects.toThrow('Could not decrypt');
        expect(mockOpen).not.toHaveBeenCalled();

        // Precondition: it keeps throwing - Retry ends on the same screen.
        fireEvent.press(getByTestId('store-recovery-retry'));
        await waitFor(() => expect(getItem).toHaveBeenCalledTimes(2));
        await waitFor(() => expect(getByTestId('store-recovery-screen')).toBeTruthy());
        expect(queryByTestId('authed-tree')).toBeNull();

        fireEvent.press(getByTestId('store-recovery-reset'));

        await waitFor(() => expect(getByTestId('authed-tree')).toBeTruthy());
        expect(queryByTestId('store-recovery-screen')).toBeNull();

        // A new key was created and stored, and the fresh database opened with it.
        expect(setItem).toHaveBeenCalledTimes(1);
        const [alias, newKey] = setItem.mock.calls[0];
        expect(alias).toBe(KEY_ALIAS);
        expect(newKey).toMatch(/^[0-9a-f]{64}$/);
        expect(mockOpen).toHaveBeenCalledTimes(1);
        expect(mockOpen.mock.calls[0][0]).toEqual({ name: 'valto.db', encryptionKey: newKey });

        // A cold start afterwards reads that key back and opens the same
        // database; no further key is created.
        unmount();
        closeDatabase();
        const restarted = render(<RootLayout />);
        await waitFor(() => expect(restarted.getByTestId('authed-tree')).toBeTruthy());
        expect(lastOpenedKey()).toBe(newKey);
        expect(setItem).toHaveBeenCalledTimes(1);
    });

    // CONTROL, not a regression test: true before and after this change. A
    // readable key with a damaged database file - the case Reset was built
    // for - still ends in a working app, and the database is left opened with
    // the key the store holds, so the next cold start opens it too.
    it('control: a normal Reset (readable key, damaged file) still leaves a working app', async () => {
        await existingInstall();
        mockSecureEntries.set(KEY_ALIAS, 'a1'.repeat(32));
        databaseFileOnDisk('<damaged file no key opens>');
        confirmResets();

        const { getByTestId, queryByTestId, unmount } = render(<RootLayout />);

        await waitFor(() => expect(getByTestId('store-recovery-screen')).toBeTruthy());

        fireEvent.press(getByTestId('store-recovery-reset'));

        await waitFor(() => expect(getByTestId('authed-tree')).toBeTruthy());
        expect(queryByTestId('store-recovery-screen')).toBeNull();
        expect(lastOpenedKey()).toBe(mockSecureEntries.get(KEY_ALIAS));

        unmount();
        closeDatabase();
        const restarted = render(<RootLayout />);
        await waitFor(() => expect(restarted.getByTestId('authed-tree')).toBeTruthy());
        expect(lastOpenedKey()).toBe(mockSecureEntries.get(KEY_ALIAS));
    });
});
