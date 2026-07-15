/**
 * Ledger Effect
 *
 * Pure rule mapping a transaction to its signed effect (in cents) on its
 * wallet balance. Single source of truth for "how a transaction moves money",
 * used by balance recomputation/reconciliation and by the import migration to
 * derive each wallet's opening balance anchor.
 */

import { Transaction, TransactionType } from '../../domain/entities/Transaction';

/** Signed cents a transaction contributes to its wallet's balance. */
export function ledgerEffect(
    tx: Pick<Transaction, 'type' | 'amount' | 'categoryId'>,
): number {
    switch (tx.type) {
        case TransactionType.EXPENSE:
            return -tx.amount;
        case TransactionType.INCOME:
            return tx.amount;
        case TransactionType.TRANSFER:
            // Double-entry: the outgoing leg debits, the incoming leg credits.
            return tx.categoryId === 'transfer-out' ? -tx.amount : tx.amount;
        default:
            return 0;
    }
}
