/**
 * WalletRepository Tests
 *
 * Tests CRUD operations and domain-specific methods using InMemoryStorage.
 * No AsyncStorage dependency — fully deterministic and offline.
 */

// Mock AsyncStorage before any imports
jest.mock('@react-native-async-storage/async-storage', () =>
    require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

import { createTestDb } from '../../../tests/helpers/createTestDb';
import type { SqlDatabase } from '../storage/sql/SqlDatabase';
import { Wallet, WalletType } from '../../domain/entities/Wallet';
import { RepositoryError, RepositoryErrorType } from '../repositories/IRepository';
import { WalletRepository } from '../repositories/WalletRepository';

describe('WalletRepository', () => {
    let storage: SqlDatabase;
    let repo: WalletRepository;

    beforeEach(async () => {
        storage = await createTestDb();
        repo = new WalletRepository(storage);
    });

    // ─── CRUD ──────────────────────────────────

    it('getAll returns empty array initially', async () => {
        const wallets = await repo.getAll();
        expect(wallets).toEqual([]);
    });

    it('create + getAll persists wallet', async () => {
        const wallet = await repo.create({
            name: 'Cash',
            balance: 50000,
            type: WalletType.CASH,
            color: '#4CAF50',
        });

        expect(wallet.id).toBeDefined();
        expect(wallet.name).toBe('Cash');
        expect(wallet.balance).toBe(50000);
        expect(wallet.createdAt).toBeInstanceOf(Date);

        const all = await repo.getAll();
        expect(all).toHaveLength(1);
        expect(all[0].id).toBe(wallet.id);
    });

    it('getById returns correct wallet', async () => {
        const created = await repo.create({
            name: 'Bank',
            balance: 100000,
            type: WalletType.BANK,
        });

        const found = await repo.getById(created.id);
        expect(found).not.toBeNull();
        expect(found!.name).toBe('Bank');
    });

    it('getById returns null for non-existent ID', async () => {
        const found = await repo.getById('non-existent');
        expect(found).toBeNull();
    });

    it('update modifies existing wallet', async () => {
        const created = await repo.create({
            name: 'Cash',
            balance: 50000,
            type: WalletType.CASH,
        });

        const updated = await repo.update({
            ...created,
            balance: 75000,
        });

        expect(updated.balance).toBe(75000);

        const fetched = await repo.getById(created.id);
        expect(fetched!.balance).toBe(75000);
    });

    it('delete removes wallet', async () => {
        const created = await repo.create({
            name: 'Temp',
            balance: 0,
            type: WalletType.CASH,
        });

        await repo.delete(created.id);

        const all = await repo.getAll();
        expect(all).toHaveLength(0);
    });

    it('delete throws NOT_FOUND for non-existent wallet', async () => {
        try {
            await repo.delete('non-existent');
            fail('Should have thrown');
        } catch (error) {
            expect(error).toBeInstanceOf(RepositoryError);
            expect((error as RepositoryError).type).toBe(RepositoryErrorType.NOT_FOUND);
        }
    });

    // ─── Duplicate ID ─────────────────────────

    it('save rejects duplicate ID', async () => {
        const wallet: Wallet = {
            id: 'dup-id',
            name: 'Cash',
            balance: 1000,
            type: WalletType.CASH,
            createdAt: new Date(),
        };

        await repo.save(wallet);

        try {
            await repo.save(wallet);
            fail('Should have thrown');
        } catch (error) {
            expect(error).toBeInstanceOf(RepositoryError);
            expect((error as RepositoryError).type).toBe(RepositoryErrorType.DUPLICATE_ERROR);
        }
    });

    // ─── Domain Methods ───────────────────────

    it('updateBalance adjusts correctly', async () => {
        const created = await repo.create({
            name: 'Bank',
            balance: 100000,
            type: WalletType.BANK,
        });

        const updated = await repo.updateBalance(created.id, -25000);
        expect(updated.balance).toBe(75000);

        const fetched = await repo.getById(created.id);
        expect(fetched!.balance).toBe(75000);
    });

    it('updateBalance can make bank balance negative', async () => {
        const created = await repo.create({
            name: 'Bank',
            balance: 10000,
            type: WalletType.BANK,
        });

        const updated = await repo.updateBalance(created.id, -50000);
        expect(updated.balance).toBe(-40000);
    });

    it('getTotalBalance sums all wallets', async () => {
        await repo.create({ name: 'Cash', balance: 50000, type: WalletType.CASH });
        await repo.create({ name: 'Bank', balance: 100000, type: WalletType.BANK });
        await repo.create({ name: 'Savings', balance: 200000, type: WalletType.SAVINGS });

        const total = await repo.getTotalBalance();
        expect(total).toBe(350000);
    });

    it('getByType filters correctly', async () => {
        await repo.create({ name: 'Cash 1', balance: 10000, type: WalletType.CASH });
        await repo.create({ name: 'Bank 1', balance: 50000, type: WalletType.BANK });
        await repo.create({ name: 'Cash 2', balance: 20000, type: WalletType.CASH });

        const cashWallets = await repo.getByType(WalletType.CASH);
        expect(cashWallets).toHaveLength(2);
        cashWallets.forEach((w) => expect(w.type).toBe(WalletType.CASH));
    });

    // ─── Validation ───────────────────────────

    it('rejects negative balance for cash wallet on save', async () => {
        const wallet: Wallet = {
            id: 'neg-cash',
            name: 'Bad Cash',
            balance: -100,
            type: WalletType.CASH,
            createdAt: new Date(),
        };

        try {
            await repo.save(wallet);
            fail('Should have thrown');
        } catch (error) {
            expect(error).toBeInstanceOf(RepositoryError);
            expect((error as RepositoryError).type).toBe(RepositoryErrorType.VALIDATION_ERROR);
        }
    });
});
