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
import { CategoryType } from '../../domain/entities/Category';
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

// Mock the DI container - repos are backed by the per-test SQLite db.
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

    it('first run creates the default categories and no wallets', async () => {
        const result = await initializeSeedData();

        expect(result.success).toBe(true);
        expect(result.categoriesCreated).toBeGreaterThan(0);

        const walletRepo = new WalletRepository((global as any).__testSeedDb);
        const wallets = await walletRepo.getAll();
        expect(wallets).toHaveLength(0);

        const categoryRepo = new CategoryRepository((global as any).__testSeedDb);
        const categories = await categoryRepo.getAll();
        expect(categories.length).toBe(result.categoriesCreated);
    });

    // Category labels are user data written once at install time in French, never
    // routed through i18n and never re-translated (see seedData.ts). These
    // assertions pin the exact set a fresh install gets.
    it('seeds exactly the three French categories with their icons and colors', async () => {
        await initializeSeedData();

        const categories = await new CategoryRepository((global as any).__testSeedDb).getAll();
        expect(categories).toHaveLength(3);

        const byName = (name: string) => categories.find(c => c.name === name);

        expect(byName('Nourriture')).toMatchObject({
            name: 'Nourriture',
            type: CategoryType.EXPENSE,
            icon: 'restaurant',
            color: '#FFB74D',
        });
        expect(byName('Transport')).toMatchObject({
            name: 'Transport',
            type: CategoryType.EXPENSE,
            icon: 'car',
            color: '#64B5F6',
        });
        expect(byName('Salaire')).toMatchObject({
            name: 'Salaire',
            type: CategoryType.INCOME,
            icon: 'cash',
            color: '#66BB6A',
        });

        expect(categories.filter(c => c.type === CategoryType.EXPENSE).map(c => c.name).sort())
            .toEqual(['Nourriture', 'Transport']);
        expect(categories.filter(c => c.type === CategoryType.INCOME).map(c => c.name))
            .toEqual(['Salaire']);
    });

    // Onboarding is the single source of the first wallet: it cannot be skipped and the
    // user names, types and funds that wallet. Seeding wallets on top of it left a fresh
    // user with four wallets, three of which they never asked for.
    it('seeds no wallets - onboarding creates the first one', async () => {
        await initializeSeedData();

        const wallets = await new WalletRepository((global as any).__testSeedDb).getAll();
        expect(wallets).toHaveLength(0);
    });

    it('second run is a no-op (seed initialized flag prevents re-seeding)', async () => {
        const firstResult = await initializeSeedData();
        expect(firstResult.success).toBe(true);

        const secondResult = await initializeSeedData();
        expect(secondResult.success).toBe(true);
        expect(secondResult.categoriesCreated).toBe(0);

        const categories = await new CategoryRepository((global as any).__testSeedDb).getAll();
        expect(categories).toHaveLength(3);

        const wallets = await new WalletRepository((global as any).__testSeedDb).getAll();
        expect(wallets).toHaveLength(0);
    });

    it('resetSeedFlag allows re-initialization', async () => {
        const firstResult = await initializeSeedData();
        expect(firstResult.categoriesCreated).toBeGreaterThan(0);

        await resetSeedFlag();
        await (global as any).__testSeedStorage.clear();

        const secondResult = await initializeSeedData();
        expect(secondResult.success).toBe(true);
        expect(secondResult.categoriesCreated).toBeGreaterThan(0);
    });
});
