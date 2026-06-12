/**
 * verifyFinancialIntegrity Use Case Tests
 *
 * The integrity check delegates to the authoritative ledger reconciliation
 * (WalletRepository.reconcile). It returns true only when every wallet's stored
 * balance matches its recomputed ledger value (drift 0).
 */

import { createMockRepositories, type MockRepositoryBundle } from '../../test-utils/mockRepositories';
import { TransactionType, WalletType } from '../entities';
import { createTransaction, verifyFinancialIntegrity } from '../useCases';

let repos: MockRepositoryBundle;

beforeEach(async () => {
    repos = await createMockRepositories();
});

it('returns true when stored balances match the ledger', async () => {
    const wallet = await repos.walletRepo.create({ name: 'Cash', balance: 100000, type: WalletType.CASH });

    await createTransaction(repos, {
        type: TransactionType.EXPENSE,
        amount: 20000,
        categoryId: 'food',
        walletId: wallet.id,
        date: new Date(),
    });

    await expect(verifyFinancialIntegrity(repos)).resolves.toBe(true);
});

it('returns false when a stored balance drifts from the ledger', async () => {
    const wallet = await repos.walletRepo.create({ name: 'Cash', balance: 100000, type: WalletType.CASH });

    // Mutate the stored balance without a backing transaction → ledger drift.
    await repos.walletRepo.updateBalance(wallet.id, -5000);

    await expect(verifyFinancialIntegrity(repos)).resolves.toBe(false);
});
