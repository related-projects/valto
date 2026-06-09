/**
 * Delete Transaction Use Case
 *
 * Deletes a transaction and reverts the wallet balance adjustment.
 * For expenses, credits the wallet back; for income, debits it.
 */

import { TransactionType } from '../entities';
import type { UseCaseDeps } from './types';

export async function deleteTransaction(
    deps: Pick<UseCaseDeps, 'transactionRepo' | 'walletRepo' | 'eventBus' | 'runInTransaction'>,
    transactionId: string,
): Promise<void> {
    const { transactionRepo, walletRepo, eventBus, runInTransaction } = deps;

    // Look up the transaction to determine reversal amount
    const transaction = await transactionRepo.getById(transactionId);

    // Atomic: the balance reversal and the record deletion commit together
    // or not at all.
    await runInTransaction(async () => {
        if (transaction) {
            // Revert balance: expense was debited → credit back; income was credited → debit back
            const reversalAmount = transaction.type === TransactionType.EXPENSE
                ? transaction.amount
                : -transaction.amount;

            await walletRepo.updateBalance(transaction.walletId, reversalAmount);
        }

        await transactionRepo.delete(transactionId);
    });

    // Notify other components (after commit)
    eventBus.emitMultiple(['transactions', 'wallets']);
}
