/**
 * Domain Use Case Tests
 *
 * Tests use cases directly against InMemoryStorage-backed repositories,
 * verifying pure business logic without React hook involvement.
 */

import { InMemoryStorage } from '../../../tests/helpers/InMemoryStorage';
import { CategoryRepository } from '../../data/repositories/CategoryRepository';
import { TransactionRepository } from '../../data/repositories/TransactionRepository';
import { WalletRepository } from '../../data/repositories/WalletRepository';
import { CategoryType, TransactionType, WalletType } from '../../domain/entities';
import type { EventBus } from '../../domain/useCases';
import {
    createTransaction,
    createWallet,
    deleteCategory,
    deleteTransaction,
    transferFunds,
} from '../../domain/useCases';

// ─── Shared test infrastructure ─────────────────────────────────────

let storage: InMemoryStorage;
let transactionRepo: TransactionRepository;
let walletRepo: WalletRepository;
let categoryRepo: CategoryRepository;
let eventBus: EventBus;

function getDeps() {
    return { transactionRepo, walletRepo, categoryRepo, eventBus };
}

beforeEach(() => {
    storage = new InMemoryStorage();
    transactionRepo = new TransactionRepository(storage);
    walletRepo = new WalletRepository(storage);
    categoryRepo = new CategoryRepository(storage);
    eventBus = { emit: jest.fn(), emitMultiple: jest.fn() };
});

// ─── createTransaction ──────────────────────────────────────────────

describe('createTransaction', () => {
    it('debits wallet for expense', async () => {
        const wallet = await walletRepo.create({ name: 'Cash', balance: 100000, type: WalletType.CASH });

        const txn = await createTransaction(getDeps(), {
            type: TransactionType.EXPENSE,
            amount: 15000,
            categoryId: 'food',
            walletId: wallet.id,
            date: new Date(),
        });

        expect(txn.amount).toBe(15000);
        const updated = await walletRepo.getById(wallet.id);
        expect(updated!.balance).toBe(85000);
        expect(eventBus.emitMultiple).toHaveBeenCalledWith(['transactions', 'wallets']);
    });

    it('credits wallet for income', async () => {
        const wallet = await walletRepo.create({ name: 'Bank', balance: 50000, type: WalletType.BANK });

        await createTransaction(getDeps(), {
            type: TransactionType.INCOME,
            amount: 200000,
            categoryId: 'salary',
            walletId: wallet.id,
            date: new Date(),
        });

        const updated = await walletRepo.getById(wallet.id);
        expect(updated!.balance).toBe(250000);
    });
});

// ─── deleteTransaction ──────────────────────────────────────────────

describe('deleteTransaction', () => {
    it('reverts wallet balance on expense deletion', async () => {
        const wallet = await walletRepo.create({ name: 'Cash', balance: 100000, type: WalletType.CASH });

        // Create an expense (debits wallet to 80000)
        const txn = await createTransaction(getDeps(), {
            type: TransactionType.EXPENSE,
            amount: 20000,
            categoryId: 'food',
            walletId: wallet.id,
            date: new Date(),
        });

        // Delete should revert balance back to 100000
        await deleteTransaction(getDeps(), txn.id);

        const updated = await walletRepo.getById(wallet.id);
        expect(updated!.balance).toBe(100000);
        expect(eventBus.emitMultiple).toHaveBeenCalledWith(['transactions', 'wallets']);
    });

    it('reverts wallet balance on income deletion', async () => {
        const wallet = await walletRepo.create({ name: 'Bank', balance: 50000, type: WalletType.BANK });

        const txn = await createTransaction(getDeps(), {
            type: TransactionType.INCOME,
            amount: 30000,
            categoryId: 'salary',
            walletId: wallet.id,
            date: new Date(),
        });

        // Balance is now 80000; deleting income should revert to 50000
        await deleteTransaction(getDeps(), txn.id);

        const updated = await walletRepo.getById(wallet.id);
        expect(updated!.balance).toBe(50000);
    });
});

// ─── transferFunds ──────────────────────────────────────────────────

describe('transferFunds', () => {
    it('updates both wallet balances and creates ledger entries', async () => {
        const source = await walletRepo.create({ name: 'Cash', balance: 100000, type: WalletType.CASH });
        const dest = await walletRepo.create({ name: 'Bank', balance: 50000, type: WalletType.BANK });

        await transferFunds(getDeps(), {
            fromWalletId: source.id,
            toWalletId: dest.id,
            amount: 25000,
        });

        const updatedSource = await walletRepo.getById(source.id);
        const updatedDest = await walletRepo.getById(dest.id);
        expect(updatedSource!.balance).toBe(75000);
        expect(updatedDest!.balance).toBe(75000);

        // Double-entry: 2 transfer transactions created
        const txns = await transactionRepo.getAll();
        expect(txns).toHaveLength(2);
        expect(txns[0].type).toBe(TransactionType.TRANSFER);
        expect(txns[1].type).toBe(TransactionType.TRANSFER);
    });

    it('rejects transfer with insufficient balance', async () => {
        const source = await walletRepo.create({ name: 'Cash', balance: 10000, type: WalletType.CASH });
        const dest = await walletRepo.create({ name: 'Bank', balance: 50000, type: WalletType.BANK });

        await expect(
            transferFunds(getDeps(), { fromWalletId: source.id, toWalletId: dest.id, amount: 50000 })
        ).rejects.toThrow('Insufficient balance');
    });

    it('rejects same-wallet transfer', async () => {
        const wallet = await walletRepo.create({ name: 'Cash', balance: 100000, type: WalletType.CASH });

        await expect(
            transferFunds(getDeps(), { fromWalletId: wallet.id, toWalletId: wallet.id, amount: 5000 })
        ).rejects.toThrow('Source and destination wallets must be different');
    });

    it('rejects zero amount', async () => {
        const source = await walletRepo.create({ name: 'Cash', balance: 100000, type: WalletType.CASH });
        const dest = await walletRepo.create({ name: 'Bank', balance: 50000, type: WalletType.BANK });

        await expect(
            transferFunds(getDeps(), { fromWalletId: source.id, toWalletId: dest.id, amount: 0 })
        ).rejects.toThrow('Transfer amount must be greater than 0');
    });
});

// ─── createWallet ───────────────────────────────────────────────────

describe('createWallet', () => {
    it('creates a wallet and emits event', async () => {
        const wallet = await createWallet(getDeps(), {
            name: 'Savings',
            balance: 500000,
            type: WalletType.SAVINGS,
        });

        expect(wallet.name).toBe('Savings');
        expect(wallet.balance).toBe(500000);
        expect(eventBus.emit).toHaveBeenCalledWith('wallets');
    });

    it('rejects empty name', async () => {
        await expect(
            createWallet(getDeps(), { name: '', balance: 0, type: WalletType.CASH })
        ).rejects.toThrow('Wallet name is required');
    });

    it('rejects negative balance', async () => {
        await expect(
            createWallet(getDeps(), { name: 'Bad', balance: -100, type: WalletType.CASH })
        ).rejects.toThrow('Initial balance must be 0 or greater');
    });
});

// ─── deleteCategory ─────────────────────────────────────────────────

describe('deleteCategory', () => {
    it('deletes a category with no references', async () => {
        const cat = await categoryRepo.create({
            name: 'Unused',
            type: CategoryType.EXPENSE,
            color: '#FF0000',
            icon: 'close',
        });

        await deleteCategory(getDeps(), cat.id);

        const all = await categoryRepo.getAll();
        expect(all).toHaveLength(0);
        expect(eventBus.emit).toHaveBeenCalledWith('categories');
    });

    it('rejects deletion when transactions reference the category', async () => {
        const cat = await categoryRepo.create({
            name: 'Food',
            type: CategoryType.EXPENSE,
            color: '#FF0000',
            icon: 'restaurant',
        });

        const wallet = await walletRepo.create({ name: 'Cash', balance: 100000, type: WalletType.CASH });

        await transactionRepo.create({
            type: TransactionType.EXPENSE,
            amount: 5000,
            categoryId: cat.id,
            walletId: wallet.id,
            date: new Date(),
        });

        await expect(deleteCategory(getDeps(), cat.id)).rejects.toThrow('Cannot delete category');
    });
});
