/**
 * Delete Transaction Use Case
 *
 * Deletes a transaction and reverts the wallet balance adjustment it made.
 *
 * The reversal is the exact negation of `ledgerEffect` - the single rule that
 * says how a transaction moves money - so the two can never disagree. Deriving
 * the sign here a second time is what let a transfer leg be reversed with the
 * wrong sign, and since updateBalance applies a delta the error was 2x amount.
 *
 * Deleting a transfer leg is refused outright: see
 * TransferDeletionNotSupportedError.
 */

import { TransactionType } from '../entities';
import { ledgerEffect } from '../ledger/ledgerEffect';
import { TransferDeletionNotSupportedError } from './errors';
import type { UseCaseDeps } from './types';

export async function deleteTransaction(
    deps: Pick<UseCaseDeps, 'transactionRepo' | 'walletRepo' | 'eventBus' | 'runInTransaction'>,
    transactionId: string,
): Promise<void> {
    const { transactionRepo, walletRepo, eventBus, runInTransaction } = deps;

    // Look up the transaction to determine reversal amount
    const transaction = await transactionRepo.getById(transactionId);

    // Refuse before anything is written, so the pair is left exactly as it was.
    if (transaction?.type === TransactionType.TRANSFER) {
        throw new TransferDeletionNotSupportedError();
    }

    // Atomic: the balance reversal and the record deletion commit together
    // or not at all.
    await runInTransaction(async () => {
        if (transaction) {
            // Undo precisely the effect this transaction had on its wallet.
            await walletRepo.updateBalance(transaction.walletId, -ledgerEffect(transaction));
        }

        await transactionRepo.delete(transactionId);
    });

    // Notify other components (after commit)
    eventBus.emitMultiple(['transactions', 'wallets']);
}
