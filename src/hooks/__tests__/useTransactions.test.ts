/**
 * useTransactions Hook Tests
 *
 * Tests the useTransactions hook behavior using mocked DI repositories.
 * Verifies loading, creation with wallet balance update, and deletion
 * with balance reversal.
 */

import { act, renderHook, waitFor } from '@testing-library/react-native';
import { createTestDb } from '../../../tests/helpers/createTestDb';
import type { SqlDatabase } from '../../data/storage/sql/SqlDatabase';
import { TransactionRepository } from '../../data/repositories/TransactionRepository';
import { WalletRepository } from '../../data/repositories/WalletRepository';
import { TransactionType, WalletType } from '../../domain/entities';

// Shared state — mock-prefixed for jest.mock() hoisting
let mockDb: SqlDatabase;
let mockWalletRepo: WalletRepository;
let mockTransactionRepo: TransactionRepository;

// Mock DI container
jest.mock('../../core/di', () => ({
    getWalletRepository: () => mockWalletRepo,
    getTransactionRepository: () => mockTransactionRepo,
    getUseCaseDeps: () => ({
        runInTransaction: (work: any) => mockDb.runInTransaction(work),
        transactionRepo: mockTransactionRepo,
        walletRepo: mockWalletRepo,
        categoryRepo: { getAll: jest.fn().mockResolvedValue([]) },
        eventBus: { emit: jest.fn(), emitMultiple: jest.fn() },
    }),
}));

// Mock events
jest.mock('../../core/events', () => ({
    dataEvents: {
        subscribe: jest.fn(() => jest.fn()),
        emit: jest.fn(),
        emitMultiple: jest.fn(),
    },
}));

import { useTransactions } from '../useTransactions';

describe('useTransactions', () => {
    beforeEach(async () => {
        mockDb = await createTestDb();
        mockWalletRepo = new WalletRepository(mockDb);
        mockTransactionRepo = new TransactionRepository(mockDb);
    });

    it('loads transactions on mount', async () => {
        // Pre-seed
        await mockTransactionRepo.create({
            type: TransactionType.EXPENSE,
            amount: 5000,
            categoryId: 'food',
            walletId: 'w1',
            date: new Date('2026-03-10'),
        });

        const { result } = renderHook(() => useTransactions());

        await waitFor(() => {
            expect(result.current.loading).toBe(false);
        });

        expect(result.current.transactions).toHaveLength(1);
        expect(result.current.transactions[0].amount).toBe(5000);
    });

    it('createTransaction updates list and adjusts wallet balance', async () => {
        // Create a wallet first
        const wallet = await mockWalletRepo.create({
            name: 'Cash',
            balance: 100000,
            type: WalletType.CASH,
        });

        const { result } = renderHook(() => useTransactions());

        await waitFor(() => {
            expect(result.current.loading).toBe(false);
        });

        await act(async () => {
            await result.current.createTransaction({
                type: TransactionType.EXPENSE,
                amount: 15000,
                categoryId: 'food',
                walletId: wallet.id,
                date: new Date('2026-03-10'),
                note: 'Groceries',
            });
        });

        // Transaction was created
        expect(result.current.transactions).toHaveLength(1);
        expect(result.current.transactions[0].note).toBe('Groceries');

        // Wallet balance was debited
        const updatedWallet = await mockWalletRepo.getById(wallet.id);
        expect(updatedWallet!.balance).toBe(85000);
    });

    it('createTransaction credits wallet for income', async () => {
        const wallet = await mockWalletRepo.create({
            name: 'Bank',
            balance: 50000,
            type: WalletType.BANK,
        });

        const { result } = renderHook(() => useTransactions());

        await waitFor(() => {
            expect(result.current.loading).toBe(false);
        });

        await act(async () => {
            await result.current.createTransaction({
                type: TransactionType.INCOME,
                amount: 200000,
                categoryId: 'salary',
                walletId: wallet.id,
                date: new Date('2026-03-01'),
            });
        });

        const updatedWallet = await mockWalletRepo.getById(wallet.id);
        expect(updatedWallet!.balance).toBe(250000);
    });

    it('deleteTransaction reverts wallet balance', async () => {
        const wallet = await mockWalletRepo.create({
            name: 'Cash',
            balance: 100000,
            type: WalletType.CASH,
        });

        // Create expense
        const tx = await mockTransactionRepo.create({
            type: TransactionType.EXPENSE,
            amount: 20000,
            categoryId: 'food',
            walletId: wallet.id,
            date: new Date('2026-03-10'),
        });

        // Simulate what the hook does: debit wallet
        await mockWalletRepo.updateBalance(wallet.id, -20000);

        const { result } = renderHook(() => useTransactions());

        await waitFor(() => {
            expect(result.current.loading).toBe(false);
        });

        expect(result.current.transactions).toHaveLength(1);

        // Delete the transaction
        await act(async () => {
            await result.current.deleteTransaction(tx.id);
        });

        expect(result.current.transactions).toHaveLength(0);

        // Wallet balance should be reverted to original
        const updatedWallet = await mockWalletRepo.getById(wallet.id);
        expect(updatedWallet!.balance).toBe(100000);
    });
});
