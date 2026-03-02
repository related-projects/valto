/**
 * Seed Service Tests
 *
 * Tests seed initialization logic: first-run seeding, idempotency,
 * and flag reset behavior.
 *
 * Strategy: Use jest.mock with the full module path to ensure seedService
 * picks up the same mock that the test creates.
 */

import { InMemoryStorage } from '../../../tests/helpers/InMemoryStorage';
import { CategoryRepository } from '../repositories/CategoryRepository';
import { WalletRepository } from '../repositories/WalletRepository';

// We need to mock the exact module that seedService.ts imports.
// seedService.ts: import { asyncStorageAdapter } from '../storage';
// which resolves to src/data/storage/index.ts -> re-exports from AsyncStorageAdapter.ts
// Let's mock the actual AsyncStorageAdapter module directly.

const mockInMemory = new InMemoryStorage();

jest.mock('../storage/AsyncStorageAdapter', () => {
    const mem = new (require('../../../tests/helpers/InMemoryStorage').InMemoryStorage)();
    // Store reference on global so we can access in tests
    (global as any).__testSeedStorage = mem;
    return {
        __esModule: true,
        AsyncStorageAdapter: jest.fn(),
        asyncStorageAdapter: mem,
    };
});

// Mock the DI container
jest.mock('../../core/di', () => ({
    getWalletRepository: () =>
        new (require('../repositories/WalletRepository').WalletRepository)((global as any).__testSeedStorage),
    getCategoryRepository: () =>
        new (require('../repositories/CategoryRepository').CategoryRepository)((global as any).__testSeedStorage),
    getTransactionRepository: () => ({
        getAll: jest.fn().mockResolvedValue([]),
    }),
}));

import { initializeSeedData, resetSeedFlag } from '../seed/seedService';

describe('Seed Service', () => {
    beforeEach(async () => {
        // Clear the storage between tests
        await (global as any).__testSeedStorage.clear();
    });

    it('first run creates default wallets and categories', async () => {
        const result = await initializeSeedData();

        expect(result.success).toBe(true);
        expect(result.walletsCreated).toBeGreaterThan(0);
        expect(result.categoriesCreated).toBeGreaterThan(0);

        const walletRepo = new WalletRepository((global as any).__testSeedStorage);
        const wallets = await walletRepo.getAll();
        expect(wallets.length).toBe(result.walletsCreated);

        const categoryRepo = new CategoryRepository((global as any).__testSeedStorage);
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
