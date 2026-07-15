/**
 * Repository Validation Error Tests
 *
 * Tests that repositories properly reject invalid data with
 * appropriate error types and messages.
 * Simulates corrupted inputs.
 */

import { TransactionType, type Transaction } from '../../domain/entities/Transaction';
import { WalletType, type Wallet } from '../../domain/entities/Wallet';
import { TransactionRepository } from '../../data/repositories/TransactionRepository';
import { WalletRepository } from '../../data/repositories/WalletRepository';
import { RepositoryErrorType } from '../../data/repositories/IRepository';
import { createTestDb } from '../../../tests/helpers/createTestDb';
import type { SqlDatabase } from '../storage/sql/SqlDatabase';

// ─── Helpers ──────────────────────────────────────────────────────────

function validTransaction(overrides: Partial<Transaction> = {}): Transaction {
    return {
        id: 'tx-valid',
        type: TransactionType.EXPENSE,
        amount: 5000,
        categoryId: 'cat-1',
        walletId: 'w-1',
        date: new Date('2026-01-15'),
        createdAt: new Date('2026-01-15'),
        ...overrides,
    };
}

function validWallet(overrides: Partial<Wallet> = {}): Wallet {
    return {
        id: 'w-1',
        name: 'Test Wallet',
        balance: 10000,
        type: WalletType.CASH,
        createdAt: new Date('2026-01-01'),
        ...overrides,
    };
}

// ─── TransactionRepository Validation ─────────────────────────────────

describe('TransactionRepository validation', () => {
    let storage: SqlDatabase;
    let repo: TransactionRepository;

    beforeEach(async () => {
        storage = await createTestDb();
        repo = new TransactionRepository(storage);
    });

    it('rejects transaction with empty id', async () => {
        await expect(repo.save(validTransaction({ id: '' }))).rejects.toMatchObject({
            type: RepositoryErrorType.VALIDATION_ERROR,
        });
    });

    it('rejects transaction with NaN amount', async () => {
        await expect(repo.save(validTransaction({ amount: NaN }))).rejects.toMatchObject({
            type: RepositoryErrorType.VALIDATION_ERROR,
        });
    });

    it('rejects transaction with negative amount', async () => {
        await expect(repo.save(validTransaction({ amount: -100 }))).rejects.toMatchObject({
            type: RepositoryErrorType.VALIDATION_ERROR,
        });
    });

    it('rejects transaction with invalid date', async () => {
        await expect(repo.save(validTransaction({ date: new Date('invalid') }))).rejects.toMatchObject({
            type: RepositoryErrorType.VALIDATION_ERROR,
        });
    });

    it('rejects transaction with empty walletId', async () => {
        await expect(repo.save(validTransaction({ walletId: '' }))).rejects.toMatchObject({
            type: RepositoryErrorType.VALIDATION_ERROR,
        });
    });

    it('rejects corrupted transaction on update', async () => {
        // First save a valid transaction
        await repo.save(validTransaction());

        // Then try to update with corrupted data
        await expect(repo.update(validTransaction({ amount: Infinity }))).rejects.toMatchObject({
            type: RepositoryErrorType.VALIDATION_ERROR,
        });
    });

    it('allows valid transaction to save', async () => {
        const tx = await repo.save(validTransaction());
        expect(tx.id).toBe('tx-valid');
    });
});

// ─── WalletRepository Validation ──────────────────────────────────────

describe('WalletRepository validation', () => {
    let storage: SqlDatabase;
    let repo: WalletRepository;

    beforeEach(async () => {
        storage = await createTestDb();
        repo = new WalletRepository(storage);
    });

    it('rejects wallet with empty id', async () => {
        await expect(repo.save(validWallet({ id: '' }))).rejects.toMatchObject({
            type: RepositoryErrorType.VALIDATION_ERROR,
        });
    });

    it('rejects wallet with empty name', async () => {
        await expect(repo.save(validWallet({ name: '' }))).rejects.toMatchObject({
            type: RepositoryErrorType.VALIDATION_ERROR,
        });
    });

    it('rejects wallet with whitespace-only name', async () => {
        await expect(repo.save(validWallet({ name: '   ' }))).rejects.toMatchObject({
            type: RepositoryErrorType.VALIDATION_ERROR,
        });
    });

    it('rejects wallet with NaN balance', async () => {
        await expect(repo.save(validWallet({ balance: NaN }))).rejects.toMatchObject({
            type: RepositoryErrorType.VALIDATION_ERROR,
        });
    });

    it('rejects cash wallet with negative balance', async () => {
        await expect(repo.save(validWallet({ balance: -100, type: WalletType.CASH }))).rejects.toMatchObject({
            type: RepositoryErrorType.VALIDATION_ERROR,
        });
    });

    it('rejects wallet with invalid createdAt', async () => {
        await expect(repo.save(validWallet({ createdAt: new Date('invalid') }))).rejects.toMatchObject({
            type: RepositoryErrorType.VALIDATION_ERROR,
        });
    });

    it('rejects corrupted wallet on update', async () => {
        await repo.save(validWallet());

        await expect(repo.update(validWallet({ balance: Infinity }))).rejects.toMatchObject({
            type: RepositoryErrorType.VALIDATION_ERROR,
        });
    });

    it('allows valid wallet to save', async () => {
        const w = await repo.save(validWallet());
        expect(w.id).toBe('w-1');
    });

    it('allows bank wallet with negative balance', async () => {
        const w = await repo.save(validWallet({ id: 'w-bank', balance: -500, type: WalletType.BANK }));
        expect(w.balance).toBe(-500);
    });
});
