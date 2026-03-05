/**
 * Create Transaction Use Case
 *
 * Creates a transaction and adjusts the associated wallet balance.
 * Expenses debit the wallet; income credits it.
 */

import { CreateTransactionDTO, Transaction, TransactionType } from '../entities';
import type { UseCaseDeps } from './types';

export interface CreateTransactionInput extends CreateTransactionDTO { }

export async function createTransaction(
    deps: Pick<UseCaseDeps, 'transactionRepo' | 'walletRepo' | 'eventBus'>,
    input: CreateTransactionInput,
): Promise<Transaction> {
    const { transactionRepo, walletRepo, eventBus } = deps;

    // Create the transaction record
    const transaction = await transactionRepo.create(input);

    // Adjust wallet balance: expense = debit, income = credit
    const balanceAdjustment = input.type === TransactionType.EXPENSE
        ? -input.amount
        : input.amount;

    await walletRepo.updateBalance(input.walletId, balanceAdjustment);

    // Notify other components
    eventBus.emitMultiple(['transactions', 'wallets']);

    return transaction;
}
