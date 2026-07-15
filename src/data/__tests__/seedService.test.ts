/**
 * Seed Service Tests
 *
 * Tests seed initialization logic: first-run seeding, idempotency,
 * and flag reset behavior.
 *
 * Strategy: Use jest.mock with the full module path to ensure seedService
 * picks up the same mock that the test creates.
 */

import { createTestDb } from '../../../tests/helpers/createTestDb';
import { CategoryRepository } from '../repositories/CategoryRepository';
import { WalletRepository } from '../repositories/WalletRepository';

// The seed flag (SEED_INITIALIZED) is still key-value, so AsyncStorageAdapter
// is mocked with an in-memory KV store. The financial entities, however, now
// live in SQLite, so the repos are backed by an in-memory SqlDatabase.

jest.mock('../storage/AsyncStorageAdapter', () => {
    const mem = new (require('../../../tests/helpers/InMemoryStorage').InMemoryStorage)();
    (global as any).__testSeedStorage = mem; // KV store: holds the seed flag
    return {
        __esModule: true,
        AsyncStorageAdapter: jest.fn(),
        asyncStorageAdapter: mem,
    };
});

// Mock the DI container — repos are backed by the per-test SQLite db.
jest.mock('../../core/di', () => ({
    getWalletRepository: () =>
        new (require('../repositories/WalletRepository').WalletRepository)((global as any).__testSeedDb),
    getCategoryRepository: () =>
        new (require('../repositories/CategoryRepository').CategoryRepository)((global as any).__testSeedDb),
    getTransactionRepository: () => ({
        getAll: jest.fn().mockResolvedValue([]),
    }),
}));

import { initializeSeedData, resetSeedFlag } from '../seed/seedService';

describe('Seed Service', () => {
    beforeEach(async () => {
        // Fresh in-memory SQLite per test + clear the KV seed flag.
        (global as any).__testSeedDb = await createTestDb();
        await (global as any).__testSeedStorage.clear();
    });

    it('first run creates default wallets and categories', async () => {
        const result = await initializeSeedData();

        expect(result.success).toBe(true);
        expect(result.walletsCreated).toBeGreaterThan(0);
        expect(result.categoriesCreated).toBeGreaterThan(0);

        const walletRepo = new WalletRepository((global as any).__testSeedDb);
        const wallets = await walletRepo.getAll();
        expect(wallets.length).toBe(result.walletsCreated);

        const categoryRepo = new CategoryRepository((global as any).__testSeedDb);
        const categories = await categoryRepo.getAll();
        expect(categories.length).toBe(result.categoriesCreated);
    });

    it('second run is a no-op (seed initialized flag prevents re-seeding)', async () => {
        const firstResult = await initializeSeedData();
        expect(firstResult.success).toBe(true);

        const secondResult = await initializeSeedData();
        expect(secondResult.success).toBe(true);
        expect(secondResult.walletsCreated).toBe(0);
        expect(secondResult.categoriesCreated).toBe(0);
    });

    it('resetSeedFlag allows re-initialization', async () => {
        const firstResult = await initializeSeedData();
        expect(firstResult.walletsCreated).toBeGreaterThan(0);

        await resetSeedFlag();
        await (global as any).__testSeedStorage.clear();

        const secondResult = await initializeSeedData();
        expect(secondResult.success).toBe(true);
        expect(secondResult.walletsCreated).toBeGreaterThan(0);
        expect(secondResult.categoriesCreated).toBeGreaterThan(0);
    });
});
