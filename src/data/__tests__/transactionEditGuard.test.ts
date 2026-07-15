/**
 * Transaction Edit Guard (Point 3 proof)
 *
 * The app exposes no path to edit an existing transaction's amount/wallet/type/
 * category, and `TransactionRepository.update` is a plain row UPDATE with no
 * compensating balance adjustment. So `updateFromDTO` must REJECT any attempt to
 * change those ledger-affecting fields, otherwise it would silently desync the
 * stored wallet balance from the recomputed ledger. Ledger-neutral edits
 * (date/note) stay allowed.
 */

import { createTestDb } from '../../../tests/helpers/createTestDb';
import { TransactionType, WalletType } from '../../domain/entities';
import { createTransaction } from '../../domain/useCases/createTransaction';
import { RepositoryErrorType } from '../repositories/IRepository';
import { TransactionRepository } from '../repositories/TransactionRepository';
import { WalletRepository } from '../repositories/WalletRepository';
import type { SqlDatabase } from '../storage/sql/SqlDatabase';

describe('TransactionRepository.updateFromDTO ledger guard', () => {
    let db: SqlDatabase;
    let walletRepo: WalletRepository;
    let txRepo: TransactionRepository;
    let walletId: string;
    let txId: string;

    beforeEach(async () => {
        db = await createTestDb();
        walletRepo = new WalletRepository(db);
        txRepo = new TransactionRepository(db);

        const wallet = await walletRepo.create({ name: 'Cash', balance: 100000, type: WalletType.CASH });
        walletId = wallet.id;

        const tx = await createTransaction(
            {
                walletRepo,
                transactionRepo: txRepo,
                eventBus: { emit: jest.fn(), emitMultiple: jest.fn() },
                runInTransaction: db.runInTransaction,
            },
            { type: TransactionType.EXPENSE, amount: 15000, categoryId: 'food', walletId, date: new Date('2026-03-01') },
        );
        txId = tx.id;
        // Balance is consistent with the ledger at the start.
        expect((await walletRepo.getById(walletId))!.balance).toBe(85000);
        expect(await walletRepo.recomputeBalanceFromLedger(walletId)).toBe(85000);
    });

    it('rejects editing the amount', async () => {
        await expect(txRepo.updateFromDTO({ id: txId, amount: 99999 })).rejects.toMatchObject({
            type: RepositoryErrorType.VALIDATION_ERROR,
        });
        // Nothing changed: balance still concords with the ledger.
        expect((await walletRepo.getById(walletId))!.balance).toBe(85000);
        expect(await walletRepo.recomputeBalanceFromLedger(walletId)).toBe(85000);
    });

    it('rejects editing the wallet, type, or category', async () => {
        await expect(txRepo.updateFromDTO({ id: txId, walletId: 'other' })).rejects.toMatchObject({
            type: RepositoryErrorType.VALIDATION_ERROR,
        });
        await expect(txRepo.updateFromDTO({ id: txId, type: TransactionType.INCOME })).rejects.toMatchObject({
            type: RepositoryErrorType.VALIDATION_ERROR,
        });
        await expect(txRepo.updateFromDTO({ id: txId, categoryId: 'rent' })).rejects.toMatchObject({
            type: RepositoryErrorType.VALIDATION_ERROR,
        });
    });

    it('allows ledger-neutral edits (note/date) and keeps the balance reconciled', async () => {
        const updated = await txRepo.updateFromDTO({ id: txId, note: 'groceries', date: new Date('2026-03-05') });
        expect(updated.note).toBe('groceries');
        expect(updated.amount).toBe(15000); // unchanged
        expect((await walletRepo.getById(walletId))!.balance).toBe(85000);
        expect(await walletRepo.recomputeBalanceFromLedger(walletId)).toBe(85000);
    });

    it('passing the same values (no-op) is allowed', async () => {
        await expect(
            txRepo.updateFromDTO({ id: txId, amount: 15000, type: TransactionType.EXPENSE, walletId, categoryId: 'food' }),
        ).resolves.toBeDefined();
    });
});
