/**
 * Usable State Service Tests
 *
 * ensureUsableState is the single definition of the terminal state every
 * destructive path lands on, and the boot repair that reaches installs already
 * stranded in production: at least one wallet, at least the seeded categories.
 *
 * Backed by a real in-memory SQLite db and a real in-memory KV store, so these
 * assert the state AFTER the call rather than that a call was made. The
 * idempotence test is the important one - the helper runs on every boot, so
 * "does nothing when data exists" is a correctness requirement, not a nicety.
 */

import { createTestDb } from '../../../../tests/helpers/createTestDb';
import { CategoryType, WalletType } from '../../../domain/entities';
import { CategoryRepository } from '../../repositories/CategoryRepository';
import { WalletRepository } from '../../repositories/WalletRepository';
import type { SqlDatabase } from '../../storage/sql/SqlDatabase';

jest.mock('../../storage/AsyncStorageAdapter', () => {
    const mem = new (require('../../../../tests/helpers/InMemoryStorage').InMemoryStorage)();
    (global as any).__kv = mem;
    return { __esModule: true, AsyncStorageAdapter: jest.fn(), asyncStorageAdapter: mem };
});

jest.mock('../../../core/di', () => ({
    getWalletRepository: () =>
        new (require('../../repositories/WalletRepository').WalletRepository)((global as any).__testDb),
    getCategoryRepository: () =>
        new (require('../../repositories/CategoryRepository').CategoryRepository)((global as any).__testDb),
}));

import { defaultCategories } from '../../seed/seedData';
import { StorageKeys } from '../../storage';
import { ensureUsableState } from '../usableStateService';

const DEFAULT_CATEGORY_COUNT = defaultCategories.length;

let db: SqlDatabase;

beforeEach(async () => {
    jest.clearAllMocks();
    db = await createTestDb();
    (global as any).__testDb = db;
    await (global as any).__kv.clear();
});

describe('ensureUsableState materializes the terminal state', () => {
    it('creates a wallet and the seeded categories on an empty install', async () => {
        await ensureUsableState();

        const wallets = await new WalletRepository(db).getAll();
        expect(wallets).toHaveLength(1);
        expect(wallets[0].balance).toBe(0);

        const categories = await new CategoryRepository(db).getAll();
        expect(categories).toHaveLength(DEFAULT_CATEGORY_COUNT);
    });

    it('seeds categories even when the seed flag is already set', async () => {
        // initializeSeedData is flag-gated, and the flag survives a path that
        // emptied the table. Without clearing it first the repair would seed
        // nothing and report success.
        await (global as any).__kv.set(StorageKeys.SEED_INITIALIZED, true);

        await ensureUsableState();

        expect(await new CategoryRepository(db).getAll()).toHaveLength(DEFAULT_CATEGORY_COUNT);
    });

    it('repairs only the missing half when a wallet exists but categories do not', async () => {
        const mine = await new WalletRepository(db).create({
            name: 'Mine',
            balance: 12345,
            type: WalletType.BANK,
        });

        await ensureUsableState();

        const wallets = await new WalletRepository(db).getAll();
        expect(wallets).toHaveLength(1);
        expect(wallets[0].id).toBe(mine.id);
        expect(wallets[0].balance).toBe(12345);

        expect((await new CategoryRepository(db).getAll()).length).toBe(DEFAULT_CATEGORY_COUNT);
    });

    it('repairs only the missing half when categories exist but a wallet does not', async () => {
        const kept = await new CategoryRepository(db).create({
            name: 'Only Mine',
            type: CategoryType.EXPENSE,
            icon: 'star',
            color: '#222222',
        });

        await ensureUsableState();

        // The seed must not run over a non-empty category table.
        const categories = await new CategoryRepository(db).getAll();
        expect(categories).toHaveLength(1);
        expect(categories[0].id).toBe(kept.id);

        expect(await new WalletRepository(db).getAll()).toHaveLength(1);
    });

    it('is a no-op when the install is already usable, and stays one when run twice', async () => {
        const wallet = await new WalletRepository(db).create({
            name: 'Mine',
            balance: 5000,
            type: WalletType.CASH,
        });
        const category = await new CategoryRepository(db).create({
            name: 'Mine',
            type: CategoryType.EXPENSE,
            icon: 'star',
            color: '#222222',
        });

        await ensureUsableState();

        const afterFirst = {
            wallets: await new WalletRepository(db).getAll(),
            categories: await new CategoryRepository(db).getAll(),
        };
        expect(afterFirst.wallets).toHaveLength(1);
        expect(afterFirst.wallets[0].id).toBe(wallet.id);
        expect(afterFirst.categories).toHaveLength(1);
        expect(afterFirst.categories[0].id).toBe(category.id);

        // Second run: the boot repair fires on every launch, so a second call
        // must change nothing at all - not one extra wallet, not one extra
        // category.
        await ensureUsableState();

        expect(await new WalletRepository(db).getAll()).toEqual(afterFirst.wallets);
        expect(await new CategoryRepository(db).getAll()).toEqual(afterFirst.categories);
    });

    it('does not duplicate the repair when called twice on an empty install', async () => {
        await ensureUsableState();
        const afterFirst = {
            wallets: await new WalletRepository(db).getAll(),
            categories: await new CategoryRepository(db).getAll(),
        };

        // Assert the first call actually repaired something before comparing:
        // without this, a helper that does nothing at all would satisfy the
        // equality below by leaving two empty tables equal to two empty tables.
        expect(afterFirst.wallets).toHaveLength(1);
        expect(afterFirst.categories).toHaveLength(DEFAULT_CATEGORY_COUNT);

        await ensureUsableState();

        expect(await new WalletRepository(db).getAll()).toEqual(afterFirst.wallets);
        expect(await new CategoryRepository(db).getAll()).toEqual(afterFirst.categories);
    });
});
