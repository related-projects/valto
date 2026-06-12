/**
 * Atomic Rollback — Fault Injection (DoD proof)
 *
 * Proves that financial writes are all-or-nothing. A FaultInjectingDatabase
 * forces a mid-transaction failure; we then assert that:
 *   (a) the source balance is intact,
 *   (b) no partial transaction is persisted, and
 *   (c) recomputeBalanceFromLedger concords with the stored balance.
 *
 * Covered use cases: transferFunds and createTransaction.
 */

import { createTestDb } from '../../../tests/helpers/createTestDb';
import { FaultInjectingDatabase } from '../../../tests/helpers/FaultInjectingDatabase';
import { TransactionType, WalletType } from '../../domain/entities';
import { createTransaction } from '../../domain/useCases/createTransaction';
import { transferFunds } from '../../domain/useCases/transferFunds';
import { TransactionRepository } from '../repositories/TransactionRepository';
import { WalletRepository } from '../repositories/WalletRepository';

describe('atomic rollback under fault injection', () => {
    it('transferFunds: failing the 2nd write rolls back the whole transfer', async () => {
        const base = await createTestDb();
        const seed = new WalletRepository(base);
        const source = await seed.create({ name: 'Cash', balance: 100000, type: WalletType.CASH });
        const dest = await seed.create({ name: 'Bank', balance: 50000, type: WalletType.BANK });

        // Fail the 2nd `UPDATE wallets` — i.e. the destination balance update,
        // the second write of the transfer (after the source debit).
        const faulty = FaultInjectingDatabase.failOnNthMatch(base, /UPDATE wallets/i, 2);
        const eventBus = { emit: jest.fn(), emitMultiple: jest.fn() };
        const deps = {
            walletRepo: new WalletRepository(faulty),
            transactionRepo: new TransactionRepository(faulty),
            eventBus,
            runInTransaction: faulty.runInTransaction,
        };

        await expect(
            transferFunds(deps, { fromWalletId: source.id, toWalletId: dest.id, amount: 25000 }),
        ).rejects.toThrow('Injected write failure');

        // (a) source balance intact (the debit was rolled back)
        expect((await seed.getById(source.id))!.balance).toBe(100000);
        expect((await seed.getById(dest.id))!.balance).toBe(50000);

        // (b) no partial transaction persisted
        expect(await new TransactionRepository(base).getAll()).toHaveLength(0);

        // (c) recomputed ledger balance concords with stored balance
        expect(await seed.recomputeBalanceFromLedger(source.id)).toBe(100000);
        expect(await seed.recomputeBalanceFromLedger(dest.id)).toBe(50000);

        // No post-commit side effects fired
        expect(eventBus.emitMultiple).not.toHaveBeenCalled();
    });

    it('createTransaction: failing the balance update persists no transaction', async () => {
        const base = await createTestDb();
        const seed = new WalletRepository(base);
        const wallet = await seed.create({ name: 'Cash', balance: 100000, type: WalletType.CASH });

        // createTransaction inserts the row, then updates the balance — fail the
        // 1st `UPDATE wallets`.
        const faulty = FaultInjectingDatabase.failOnNthMatch(base, /UPDATE wallets/i, 1);
        const eventBus = { emit: jest.fn(), emitMultiple: jest.fn() };
        const deps = {
            walletRepo: new WalletRepository(faulty),
            transactionRepo: new TransactionRepository(faulty),
            eventBus,
            runInTransaction: faulty.runInTransaction,
        };

        await expect(
            createTransaction(deps, {
                type: TransactionType.EXPENSE,
                amount: 15000,
                categoryId: 'food',
                walletId: wallet.id,
                date: new Date('2026-03-01T12:00:00Z'),
            }),
        ).rejects.toThrow('Injected write failure');

        // (a) balance intact
        expect((await seed.getById(wallet.id))!.balance).toBe(100000);

        // (b) the inserted transaction was rolled back
        expect(await new TransactionRepository(base).getAll()).toHaveLength(0);

        // (c) recomputed ledger balance concords with stored balance
        expect(await seed.recomputeBalanceFromLedger(wallet.id)).toBe(100000);

        expect(eventBus.emitMultiple).not.toHaveBeenCalled();
    });

    it('successful createTransaction keeps stored balance == recomputed ledger', async () => {
        // Sanity counterpart: the happy path must also reconcile.
        const db = await createTestDb();
        const walletRepo = new WalletRepository(db);
        const wallet = await walletRepo.create({ name: 'Cash', balance: 100000, type: WalletType.CASH });

        await createTransaction(
            {
                walletRepo,
                transactionRepo: new TransactionRepository(db),
                eventBus: { emit: jest.fn(), emitMultiple: jest.fn() },
                runInTransaction: db.runInTransaction,
            },
            {
                type: TransactionType.EXPENSE,
                amount: 15000,
                categoryId: 'food',
                walletId: wallet.id,
                date: new Date('2026-03-01T12:00:00Z'),
            },
        );

        const stored = (await walletRepo.getById(wallet.id))!.balance;
        expect(stored).toBe(85000);
        expect(await walletRepo.recomputeBalanceFromLedger(wallet.id)).toBe(stored);
    });
});
