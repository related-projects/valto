import { createTestDb } from '../../../tests/helpers/createTestDb';
import { TransactionType, WalletType, type UpdateWalletDTO } from '../../domain/entities';
import { createTransaction } from '../../domain/useCases/createTransaction';
import { RepositoryErrorType } from '../repositories/IRepository';
import { TransactionRepository } from '../repositories/TransactionRepository';
import { WalletRepository } from '../repositories/WalletRepository';
import type { SqlDatabase } from '../storage/sql/SqlDatabase';

/**
 * Wallet Edit Guard (V-87)
 *
 * A wallet balance moves only through the ledger: `updateBalance`, inside the
 * serialized transaction of the use case that records the movement. A wallet
 * update writes name, type and color, never the balance. So:
 *
 * - an update that tries to change the balance is refused before any write,
 *   and the stored balance keeps agreeing with the recomputed ledger;
 * - an update that does not mention the balance cannot put back a balance it
 *   read before a ledger movement landed.
 */

describe('WalletRepository update ledger guard', () => {
    let db: SqlDatabase;
    let walletRepo: WalletRepository;
    let txRepo: TransactionRepository;
    let walletId: string;

    function expense(amount: number) {
        return createTransaction(
            {
                walletRepo,
                transactionRepo: txRepo,
                eventBus: { emit: jest.fn(), emitMultiple: jest.fn() },
                runInTransaction: db.runInTransaction,
            },
            { type: TransactionType.EXPENSE, amount, categoryId: 'food', walletId, date: new Date('2026-03-01') },
        );
    }

    async function expectBalance(expected: number) {
        expect((await walletRepo.getById(walletId))!.balance).toBe(expected);
        expect(await walletRepo.recomputeBalanceFromLedger(walletId)).toBe(expected);
    }

    beforeEach(async () => {
        db = await createTestDb();
        walletRepo = new WalletRepository(db);
        txRepo = new TransactionRepository(db);

        const wallet = await walletRepo.create({ name: 'Cash', balance: 100000, type: WalletType.CASH });
        walletId = wallet.id;
        await expense(15000);

        // Balance is consistent with the ledger at the start.
        await expectBalance(85000);
    });

    it('update refuses an entity whose balance differs from the stored one', async () => {
        const wallet = (await walletRepo.getById(walletId))!;

        await expect(walletRepo.update({ ...wallet, balance: 99999 })).rejects.toMatchObject({
            type: RepositoryErrorType.VALIDATION_ERROR,
        });

        await expectBalance(85000);
    });

    it('updateFromDTO refuses a balance forced past the DTO type', async () => {
        const dto = { id: walletId, balance: 99999 } as unknown as UpdateWalletDTO;

        await expect(walletRepo.updateFromDTO(dto)).rejects.toMatchObject({
            type: RepositoryErrorType.VALIDATION_ERROR,
        });

        await expectBalance(85000);
    });

    it('allows name, type and color edits and keeps the balance in agreement with the ledger', async () => {
        const updated = await walletRepo.updateFromDTO({
            id: walletId,
            name: 'Pocket',
            type: WalletType.BANK,
            color: '#123456',
        });

        expect(updated.name).toBe('Pocket');
        expect(updated.type).toBe(WalletType.BANK);
        expect(updated.color).toBe('#123456');
        await expectBalance(85000);
    });

    it('update with the stored balance unchanged is allowed', async () => {
        const wallet = (await walletRepo.getById(walletId))!;

        await expect(walletRepo.update({ ...wallet, name: 'Pocket' })).resolves.toBeDefined();

        expect((await walletRepo.getById(walletId))!.name).toBe('Pocket');
        await expectBalance(85000);
    });

    it('a name-only edit does not write back a balance read before a ledger movement', async () => {
        // The ledger movement lands between the update's read and its write.
        const realGetById = walletRepo.getById.bind(walletRepo);
        let injected = false;
        jest.spyOn(walletRepo, 'getById').mockImplementation(async (id: string) => {
            const read = await realGetById(id);
            if (!injected) {
                injected = true;
                await expense(5000);
            }
            return read;
        });

        await walletRepo.updateFromDTO({ id: walletId, name: 'Renamed' });

        jest.restoreAllMocks();
        expect((await walletRepo.getById(walletId))!.name).toBe('Renamed');
        await expectBalance(80000);
    });
});
