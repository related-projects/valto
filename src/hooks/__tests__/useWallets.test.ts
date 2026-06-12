/**
 * useWallets Hook Tests
 *
 * Tests the useWallets hook behavior using mocked DI repositories
 * backed by InMemoryStorage. Verifies loading, creation, total balance,
 * and transfer operations.
 */

import { act, renderHook, waitFor } from '@testing-library/react-native';
import { createTestDb } from '../../../tests/helpers/createTestDb';
import type { SqlDatabase } from '../../data/storage/sql/SqlDatabase';
import { TransactionRepository } from '../../data/repositories/TransactionRepository';
import { WalletRepository } from '../../data/repositories/WalletRepository';
import { WalletType } from '../../domain/entities';

// Shared state for mocks — must use `mock` prefix for jest.mock() hoisting
let mockDb: SqlDatabase;
let mockWalletRepo: WalletRepository;
let mockTransactionRepo: TransactionRepository;

// Mock DI container
jest.mock('../../core/di', () => ({
    getWalletRepository: () => mockWalletRepo,
    getTransactionRepository: () => mockTransactionRepo,
    getCategoryRepository: () => ({
        getAll: jest.fn().mockResolvedValue([]),
    }),
    getBudgetRepository: () => ({
        getAll: jest.fn().mockResolvedValue([]),
        getByMonth: jest.fn().mockResolvedValue([]),
    }),
    getUseCaseDeps: () => ({
        runInTransaction: (work: any) => mockDb.runInTransaction(work),
        transactionRepo: mockTransactionRepo,
        walletRepo: mockWalletRepo,
        categoryRepo: { getAll: jest.fn().mockResolvedValue([]) },
        eventBus: { emit: jest.fn(), emitMultiple: jest.fn() },
    }),
}));

// Mock events to prevent side effects  
jest.mock('../../core/events', () => ({
    dataEvents: {
        subscribe: jest.fn(() => jest.fn()),
        emit: jest.fn(),
        emitMultiple: jest.fn(),
    },
}));

import { useWallets } from '../useWallets';

describe('useWallets', () => {
    beforeEach(async () => {
        mockDb = await createTestDb();
        mockWalletRepo = new WalletRepository(mockDb);
        mockTransactionRepo = new TransactionRepository(mockDb);
    });

    it('loads wallets on mount', async () => {
        // Pre-seed a wallet
        await mockWalletRepo.create({
            name: 'Cash',
            balance: 50000,
            type: WalletType.CASH,
        });

        const { result } = renderHook(() => useWallets());

        await waitFor(() => {
            expect(result.current.loading).toBe(false);
        });

        expect(result.current.wallets).toHaveLength(1);
        expect(result.current.wallets[0].name).toBe('Cash');
        expect(result.current.error).toBeNull();
    });

    it('createWallet adds wallet and refreshes', async () => {
        const { result } = renderHook(() => useWallets());

        await waitFor(() => {
            expect(result.current.loading).toBe(false);
        });

        await act(async () => {
            await result.current.createWallet({
                name: 'Bank',
                balance: 100000,
                type: WalletType.BANK,
                color: '#2196F3',
            });
        });

        expect(result.current.wallets).toHaveLength(1);
        expect(result.current.wallets[0].name).toBe('Bank');
        expect(result.current.wallets[0].balance).toBe(100000);
    });

    it('getTotalBalance returns correct sum', async () => {
        await mockWalletRepo.create({ name: 'Cash', balance: 50000, type: WalletType.CASH });
        await mockWalletRepo.create({ name: 'Bank', balance: 150000, type: WalletType.BANK });

        const { result } = renderHook(() => useWallets());

        await waitFor(() => {
            expect(result.current.loading).toBe(false);
        });

        expect(result.current.getTotalBalance()).toBe(200000);
    });

    it('transferBetweenWallets updates both balances', async () => {
        const source = await mockWalletRepo.create({ name: 'Cash', balance: 100000, type: WalletType.CASH });
        const dest = await mockWalletRepo.create({ name: 'Bank', balance: 50000, type: WalletType.BANK });

        const { result } = renderHook(() => useWallets());

        await waitFor(() => {
            expect(result.current.loading).toBe(false);
        });

        await act(async () => {
            await result.current.transferBetweenWallets(source.id, dest.id, 25000);
        });

        const updatedSource = result.current.wallets.find((w) => w.id === source.id);
        const updatedDest = result.current.wallets.find((w) => w.id === dest.id);

        expect(updatedSource!.balance).toBe(75000);
        expect(updatedDest!.balance).toBe(75000);

        // Total balance unchanged
        expect(result.current.getTotalBalance()).toBe(150000);
    });

    it('createWallet rejects empty name', async () => {
        const { result } = renderHook(() => useWallets());

        await waitFor(() => {
            expect(result.current.loading).toBe(false);
        });

        await expect(
            act(async () => {
                await result.current.createWallet({
                    name: '',
                    balance: 1000,
                    type: WalletType.CASH,
                });
            })
        ).rejects.toThrow('Wallet name is required');
    });
});
