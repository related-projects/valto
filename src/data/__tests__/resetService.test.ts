/**
 * Reset Service Tests
 *
 * Tests full app data reset: storage clearing, seed re-initialization,
 * and event emission.
 */

import { InMemoryStorage } from '../../../tests/helpers/InMemoryStorage';
import { StorageKeys } from '../storage/StorageKeys';

let mockStorage: InMemoryStorage;
const mockEmitMultiple = jest.fn();
const mockInitializeSeedData = jest.fn().mockResolvedValue(undefined);

jest.mock('../../core/events', () => ({
    dataEvents: {
        emitMultiple: (...args: any[]) => mockEmitMultiple(...args),
        emit: jest.fn(),
    },
}));

jest.mock('../seed', () => ({
    initializeSeedData: () => mockInitializeSeedData(),
}));

// resetService now clears the SQLite financial tables via getDb().
jest.mock('../storage/sql/database', () => ({
    getDb: () => ({
        execute: jest.fn().mockResolvedValue({ rows: [], rowsAffected: 0 }),
    }),
}));

// We need to mock the storage adapter via the module
jest.mock('../storage', () => {
    // Use a closure to share state
    const actualStorageKeys = jest.requireActual('../storage/StorageKeys');
    return {
        asyncStorageAdapter: {
            get: jest.fn(),
            set: jest.fn(),
            remove: jest.fn().mockResolvedValue(undefined),
        },
        StorageKeys: actualStorageKeys.StorageKeys,
    };
});

import { resetAppData } from '../services/resetService';
import { asyncStorageAdapter } from '../storage';

describe('resetAppData', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('removes all known storage keys', async () => {
        await resetAppData();

        expect(asyncStorageAdapter.remove).toHaveBeenCalledWith(StorageKeys.WALLETS);
        expect(asyncStorageAdapter.remove).toHaveBeenCalledWith(StorageKeys.TRANSACTIONS);
        expect(asyncStorageAdapter.remove).toHaveBeenCalledWith(StorageKeys.CATEGORIES);
        expect(asyncStorageAdapter.remove).toHaveBeenCalledWith(StorageKeys.BUDGETS);
        expect(asyncStorageAdapter.remove).toHaveBeenCalledWith(StorageKeys.SETTINGS);
        expect(asyncStorageAdapter.remove).toHaveBeenCalledWith(StorageKeys.SEED_INITIALIZED);
    });

    it('re-initializes seed data after clearing', async () => {
        await resetAppData();
        expect(mockInitializeSeedData).toHaveBeenCalledTimes(1);
    });

    it('emits all data events for UI refresh', async () => {
        await resetAppData();
        expect(mockEmitMultiple).toHaveBeenCalledWith(
            expect.arrayContaining(['wallets', 'transactions', 'categories', 'budgets'])
        );
    });

    it('calls operations in correct order: clear → seed → emit', async () => {
        const callOrder: string[] = [];
        (asyncStorageAdapter.remove as jest.Mock).mockImplementation(() => {
            callOrder.push('remove');
            return Promise.resolve();
        });
        mockInitializeSeedData.mockImplementation(() => {
            callOrder.push('seed');
            return Promise.resolve();
        });
        mockEmitMultiple.mockImplementation(() => {
            callOrder.push('emit');
        });

        await resetAppData();

        // remove calls happen first (6 keys), then seed, then emit
        const firstSeed = callOrder.indexOf('seed');
        const firstEmit = callOrder.indexOf('emit');
        expect(firstSeed).toBeGreaterThan(0);
        expect(firstEmit).toBeGreaterThan(firstSeed);
    });
});
