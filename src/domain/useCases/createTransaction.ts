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
    deps: Pick<UseCaseDeps, 'transactionRepo' | 'walletRepo' | 'eventBus' | 'runInTransaction'>,
    input: CreateTransactionInput,
): Promise<Transaction> {
    const { transactionRepo, walletRepo, eventBus, runInTransaction } = deps;

    // ── DOMAIN RULE: an expense MAY overdraw a wallet into a negative balance ──
    // There is deliberately NO sufficiency guard here. An expense records a *real*
    // outflow that already happened in the world; spending money an account does
    // not hold (overdraft, pending settlement, manual back-entry) is a real event
    // worth tracking, so we record it and let the balance go negative.
    //
    // This is the asymmetric counterpart to transferFunds, which DOES bound the
    // amount by the source balance (InsufficientFundsError): a transfer only moves
    // funds we already track, so it cannot exceed what is there. Expense = real
    // outflow (unbounded); transfer = tracked-funds movement (bounded). The
    // asymmetry is intentional. See src/domain/__tests__/overdrawRule.test.ts.
    const balanceAdjustment = input.type === TransactionType.EXPENSE
        ? -input.amount
        : input.amount;

    // Atomic: the transaction record and the balance adjustment commit together
    // or not at all.
    const transaction = await runInTransaction(async () => {
        const created = await transactionRepo.create(input);
        await walletRepo.updateBalance(input.walletId, balanceAdjustment);
        return created;
    });

    // Notify other components (after commit)
    eventBus.emitMultiple(['transactions', 'wallets']);

    return transaction;
}
