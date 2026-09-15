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
import { RepositoryError } from '../../data/repositories/IRepository';
import { TransactionRepository } from '../../data/repositories/TransactionRepository';
import { WalletRepository } from '../../data/repositories/WalletRepository';
import { WalletType } from '../../domain/entities';

// Shared state for mocks - must use `mock` prefix for jest.mock() hoisting
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

    it('createWallet hands back the exact error instance it caught', async () => {
        // A sentinel the test holds a reference to, thrown from below the hook.
        // Identity is the whole point: the re-wrap this pass removed produced a
        // NEW Error carrying the same message, which a message assertion cannot
        // tell apart from the original but `toBe` can. Asserting identity rather
        // than a stack string also keeps the test independent of the transform -
        // a stack describes how the code was compiled, not how it behaves.
        const sentinel = new Error('wallet repository exploded');
        mockWalletRepo.create = jest.fn().mockRejectedValue(sentinel);

        const { result } = renderHook(() => useWallets());

        await waitFor(() => {
            expect(result.current.loading).toBe(false);
        });

        let caught: unknown;
        await act(async () => {
            try {
                // A valid name, so createWallet (the use case) clears its own
                // validation and the sentinel travels use case -> hook -> here.
                await result.current.createWallet({
                    name: 'Valid name',
                    balance: 1000,
                    type: WalletType.CASH,
                });
            } catch (err) {
                caught = err;
            }
        });

        expect(caught).toBe(sentinel);
        expect((caught as Error).message).toBe('wallet repository exploded');
    });

    // --- V-29: the hook must not flatten a typed error ------------------
    //
    // Both operations below used to end in `throw new Error(errorMessage)`,
    // which produced a bare Error and made `instanceof` useless at the call
    // site. Each test drives a real repository into raising a RepositoryError
    // and asserts the class survives the hook.

    it('createWallet preserves the typed error class', async () => {
        const { result } = renderHook(() => useWallets());

        await waitFor(() => {
            expect(result.current.loading).toBe(false);
        });

        let caught: unknown;
        await act(async () => {
            try {
                // An unknown wallet type fails validateWallet inside
                // WalletRepository.save, which raises a RepositoryError.
                await result.current.createWallet({
                    name: 'Valid name',
                    balance: 1000,
                    type: 'not-a-wallet-type' as WalletType,
                });
            } catch (err) {
                caught = err;
            }
        });

        expect(caught).toBeInstanceOf(RepositoryError);
    });

    it('updateWallet preserves the typed error class', async () => {
        const { result } = renderHook(() => useWallets());

        await waitFor(() => {
            expect(result.current.loading).toBe(false);
        });

        let caught: unknown;
        await act(async () => {
            try {
                // No such wallet: updateFromDTO raises RepositoryError NOT_FOUND.
                await result.current.updateWallet({
                    id: 'no-such-wallet',
                    name: 'Renamed',
                });
            } catch (err) {
                caught = err;
            }
        });

        expect(caught).toBeInstanceOf(RepositoryError);
    });

    // The rule the hook used to enforce itself, and got wrong: it refused a
    // negative balance for EVERY wallet type, while validateWalletBalance
    // (src/domain/entities/Wallet.ts) permits overdraft on bank and savings.
    // The domain owns this now, so a bank wallet may go negative.
    it('updateWallet allows a negative balance on a bank wallet', async () => {
        const bank = await mockWalletRepo.create({
            name: 'Bank',
            balance: 10000,
            type: WalletType.BANK,
        });

        const { result } = renderHook(() => useWallets());

        await waitFor(() => {
            expect(result.current.loading).toBe(false);
        });

        await act(async () => {
            await result.current.updateWallet({ id: bank.id, balance: -5000 });
        });

        const stored = await mockWalletRepo.getById(bank.id);
        expect(stored!.balance).toBe(-5000);
    });

    // The counterpart: the domain rule that DOES still refuse, so the test
    // above cannot be read as "negative balances are now unchecked".
    it('updateWallet still refuses a negative balance on a cash wallet', async () => {
        const cash = await mockWalletRepo.create({
            name: 'Cash',
            balance: 10000,
            type: WalletType.CASH,
        });

        const { result } = renderHook(() => useWallets());

        await waitFor(() => {
            expect(result.current.loading).toBe(false);
        });

        let caught: unknown;
        await act(async () => {
            try {
                await result.current.updateWallet({ id: cash.id, balance: -5000 });
            } catch (err) {
                caught = err;
            }
        });

        expect(caught).toBeInstanceOf(RepositoryError);
    });
});
