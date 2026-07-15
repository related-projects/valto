/**
 * Overdraw DOMAIN RULE — locked asymmetry
 *
 * One deliberate product rule, two opposite sides — kept in one file so the
 * asymmetry reads at a glance:
 *
 *   (a) An EXPENSE may overdraw a wallet into a NEGATIVE balance. It records a
 *       real outflow that already happened, so there is no sufficiency guard.
 *       Ledger integrity still holds: recomputeBalanceFromLedger == stored
 *       balance, even when negative.
 *
 *   (b) A TRANSFER may NEVER exceed the source balance. It only moves funds we
 *       already track, so an over-balance transfer throws InsufficientFundsError
 *       and rolls back with zero partial writes.
 *
 * Expense = real outflow (unbounded); transfer = tracked-funds movement
 * (bounded). These tests verify behavior — they must NOT change it. The rule is
 * also documented next to createTransaction() and transferFunds().
 */

import { createMockRepositories, type MockRepositoryBundle } from '../../test-utils/mockRepositories';
import { TransactionType, WalletType } from '../entities';
import { createTransaction, transferFunds } from '../useCases';
import { InsufficientFundsError } from '../useCases/errors';

describe('overdraw DOMAIN RULE', () => {
    let repos: MockRepositoryBundle;
    let walletRepo: MockRepositoryBundle['walletRepo'];
    let transactionRepo: MockRepositoryBundle['transactionRepo'];
    let eventBus: MockRepositoryBundle['eventBus'];

    beforeEach(async () => {
        repos = await createMockRepositories();
        ({ walletRepo, transactionRepo, eventBus } = repos);
    });

    const deps = () => ({ transactionRepo, walletRepo, eventBus, runInTransaction: repos.runInTransaction });

    // (a) EXPENSE — overdraw allowed, ledger integrity preserved even negative.
    it('allows an expense to overdraw a wallet into a negative balance (by design)', async () => {
        const wallet = await walletRepo.create({ name: 'Cash', balance: 5000, type: WalletType.CASH });

        // Spend more than the wallet holds — this is a real outflow and must succeed.
        await expect(
            createTransaction(deps(), {
                type: TransactionType.EXPENSE,
                amount: 10000,
                categoryId: 'food',
                walletId: wallet.id,
                date: new Date(),
            })
        ).resolves.toBeDefined();

        // Stored balance went negative — the overdraw was recorded, not blocked.
        const updated = await walletRepo.getById(wallet.id);
        expect(updated!.balance).toBe(-5000);

        // Integrity holds even in the red: the ledger recomputes to the same value.
        expect(await walletRepo.recomputeBalanceFromLedger(wallet.id)).toBe(-5000);
    });

    // (b) TRANSFER — the mirror: bounded by source balance, no partial writes.
    it('rejects a transfer that exceeds the source balance (the asymmetry)', async () => {
        const source = await walletRepo.create({ name: 'Cash', balance: 5000, type: WalletType.CASH });
        const dest = await walletRepo.create({ name: 'Bank', balance: 0, type: WalletType.BANK });

        const error = await transferFunds(deps(), {
            fromWalletId: source.id,
            toWalletId: dest.id,
            amount: 10000,
        }).catch((e) => e);

        expect(error).toBeInstanceOf(InsufficientFundsError);

        // Rolled back: source untouched, no ledger entries written.
        expect((await walletRepo.getById(source.id))!.balance).toBe(5000);
        expect(await transactionRepo.getAll()).toHaveLength(0);
    });
});
