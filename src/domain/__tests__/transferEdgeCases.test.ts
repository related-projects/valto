/**
 * Transfer Funds Edge Case Tests
 *
 * Tests validation edge cases for the transferFunds use case:
 * same wallet, zero/negative amounts, non-existent wallets,
 * insufficient balance, and successful double-entry creation.
 */

import { InMemoryStorage } from '../../../tests/helpers/InMemoryStorage';
import { TransactionRepository } from '../../data/repositories/TransactionRepository';
import { WalletRepository } from '../../data/repositories/WalletRepository';
import { WalletType } from '../entities';
import { transferFunds } from '../useCases/transferFunds';

describe('transferFunds edge cases', () => {
    let storage: InMemoryStorage;
    let walletRepo: WalletRepository;
    let transactionRepo: TransactionRepository;
    let eventBus: { emit: jest.Mock; emitMultiple: jest.Mock };

    beforeEach(() => {
        storage = new InMemoryStorage();
        walletRepo = new WalletRepository(storage);
        transactionRepo = new TransactionRepository(storage);
        eventBus = { emit: jest.fn(), emitMultiple: jest.fn() };
    });

    const deps = () => ({ transactionRepo, walletRepo, eventBus });

    it('rejects transfer to same wallet', async () => {
        const wallet = await walletRepo.create({
            name: 'Cash', balance: 100000, type: WalletType.CASH,
        });

        await expect(
            transferFunds(deps(), {
                fromWalletId: wallet.id,
                toWalletId: wallet.id,
                amount: 10000,
            })
        ).rejects.toThrow('Source and destination wallets must be different');
    });

    it('rejects zero amount', async () => {
        await expect(
            transferFunds(deps(), {
                fromWalletId: 'w-1',
                toWalletId: 'w-2',
                amount: 0,
            })
        ).rejects.toThrow('Transfer amount must be greater than 0');
    });

    it('rejects negative amount', async () => {
        await expect(
            transferFunds(deps(), {
                fromWalletId: 'w-1',
                toWalletId: 'w-2',
                amount: -5000,
            })
        ).rejects.toThrow('Transfer amount must be greater than 0');
    });

    it('rejects non-existent source wallet', async () => {
        const dest = await walletRepo.create({
            name: 'Bank', balance: 50000, type: WalletType.BANK,
        });

        await expect(
            transferFunds(deps(), {
                fromWalletId: 'non-existent',
                toWalletId: dest.id,
                amount: 10000,
            })
        ).rejects.toThrow('Source wallet not found');
    });

    it('rejects non-existent destination wallet', async () => {
        const source = await walletRepo.create({
            name: 'Cash', balance: 100000, type: WalletType.CASH,
        });

        await expect(
            transferFunds(deps(), {
                fromWalletId: source.id,
                toWalletId: 'non-existent',
                amount: 10000,
            })
        ).rejects.toThrow('Destination wallet not found');
    });

    it('rejects insufficient balance', async () => {
        const source = await walletRepo.create({
            name: 'Cash', balance: 5000, type: WalletType.CASH,
        });
        const dest = await walletRepo.create({
            name: 'Bank', balance: 0, type: WalletType.BANK,
        });

        await expect(
            transferFunds(deps(), {
                fromWalletId: source.id,
                toWalletId: dest.id,
                amount: 10000,
            })
        ).rejects.toThrow('Insufficient balance');
    });

    it('creates paired double-entry transfer records', async () => {
        const source = await walletRepo.create({
            name: 'Cash', balance: 100000, type: WalletType.CASH,
        });
        const dest = await walletRepo.create({
            name: 'Bank', balance: 50000, type: WalletType.BANK,
        });

        await transferFunds(deps(), {
            fromWalletId: source.id,
            toWalletId: dest.id,
            amount: 25000,
        });

        const transactions = await transactionRepo.getAll();
        expect(transactions).toHaveLength(2);

        const outgoing = transactions.find(t => t.walletId === source.id);
        const incoming = transactions.find(t => t.walletId === dest.id);

        expect(outgoing).toBeDefined();
        expect(outgoing!.type).toBe('transfer');
        expect(outgoing!.amount).toBe(25000);
        expect(outgoing!.categoryId).toBe('transfer-out');

        expect(incoming).toBeDefined();
        expect(incoming!.type).toBe('transfer');
        expect(incoming!.amount).toBe(25000);
        expect(incoming!.categoryId).toBe('transfer-in');
    });

    it('updates both wallet balances correctly', async () => {
        const source = await walletRepo.create({
            name: 'Cash', balance: 100000, type: WalletType.CASH,
        });
        const dest = await walletRepo.create({
            name: 'Bank', balance: 50000, type: WalletType.BANK,
        });

        await transferFunds(deps(), {
            fromWalletId: source.id,
            toWalletId: dest.id,
            amount: 30000,
        });

        const updatedSource = await walletRepo.getById(source.id);
        const updatedDest = await walletRepo.getById(dest.id);

        expect(updatedSource!.balance).toBe(70000);
        expect(updatedDest!.balance).toBe(80000);
    });

    it('emits wallets and transactions events on success', async () => {
        const source = await walletRepo.create({
            name: 'Cash', balance: 100000, type: WalletType.CASH,
        });
        const dest = await walletRepo.create({
            name: 'Bank', balance: 50000, type: WalletType.BANK,
        });

        await transferFunds(deps(), {
            fromWalletId: source.id,
            toWalletId: dest.id,
            amount: 10000,
        });

        expect(eventBus.emitMultiple).toHaveBeenCalledWith(['wallets', 'transactions']);
    });

    it('transfer of exact balance succeeds', async () => {
        const source = await walletRepo.create({
            name: 'Cash', balance: 50000, type: WalletType.CASH,
        });
        const dest = await walletRepo.create({
            name: 'Bank', balance: 0, type: WalletType.BANK,
        });

        await expect(
            transferFunds(deps(), {
                fromWalletId: source.id,
                toWalletId: dest.id,
                amount: 50000,
            })
        ).resolves.toBeUndefined();

        const updated = await walletRepo.getById(source.id);
        expect(updated!.balance).toBe(0);
    });
});
