/**
 * Delete Transaction Use Case
 *
 * Deletes a transaction and reverts the wallet balance adjustment.
 * For expenses, credits the wallet back; for income, debits it.
 */

import { TransactionType } from '../entities';
import type { UseCaseDeps } from './types';

export async function deleteTransaction(
    deps: Pick<UseCaseDeps, 'transactionRepo' | 'walletRepo' | 'eventBus'>,
    transactionId: string,
): Promise<void> {
    const { transactionRepo, walletRepo, eventBus } = deps;

    // Look up the transaction to determine reversal amount
    const transaction = await transactionRepo.getById(transactionId);

    if (transaction) {
        // Revert balance: expense was debited → credit back; income was credited → debit back
        const reversalAmount = transaction.type === TransactionType.EXPENSE
            ? transaction.amount
            : -transaction.amount;

        await walletRepo.updateBalance(transaction.walletId, reversalAmount);
    }

    // Delete the transaction record
    await transactionRepo.delete(transactionId);

    // Notify other components
    eventBus.emitMultiple(['transactions', 'wallets']);
}
