/**
 * Transfer Funds Use Case
 *
 * Transfers money between two wallets using double-entry accounting.
 * Validates inputs, updates both balances, and creates paired transfer records.
 */

import { TransactionType } from '../entities';
import { InsufficientFundsError } from './errors';
import type { UseCaseDeps } from './types';

export interface TransferFundsInput {
    fromWalletId: string;
    toWalletId: string;
    amount: number;
}

export async function transferFunds(
    deps: Pick<UseCaseDeps, 'transactionRepo' | 'walletRepo' | 'eventBus' | 'runInTransaction'>,
    input: TransferFundsInput,
): Promise<void> {
    const { transactionRepo, walletRepo, eventBus, runInTransaction } = deps;
    const { fromWalletId, toWalletId, amount } = input;

    // ── Validation ────────────────────────────────────────────────────

    if (amount <= 0) {
        throw new Error('Transfer amount must be greater than 0');
    }

    if (fromWalletId === toWalletId) {
        throw new Error('Source and destination wallets must be different');
    }

    // ── Execute (atomic: all-or-nothing) ───────────────────────────────
    // The authoritative balance read, the sufficiency decision, the two
    // balance updates and the two double-entry ledger records all run inside a
    // single DB transaction. Reading-then-deciding-then-writing under the same
    // transaction (with the step-1.5 mutex) closes the TOCTOU window. Any throw
    // rolls the whole transfer back, so a balance can never be left corrupted.
    const now = new Date();

    await runInTransaction(async () => {
        const sourceWallet = await walletRepo.getById(fromWalletId);
        if (!sourceWallet) {
            throw new Error('Source wallet not found');
        }

        // ── DOMAIN RULE: a transfer may NEVER exceed the source balance ──
        // A transfer only moves funds we already track from one wallet to another;
        // it creates no new outflow from the world. You cannot move money that is
        // not there, so an over-balance transfer is rejected with a typed
        // InsufficientFundsError and the whole operation rolls back.
        //
        // This is the asymmetric counterpart to createTransaction, where an EXPENSE
        // is allowed to overdraw into a negative balance (a real outflow is always
        // recorded). Expense = real outflow (unbounded); transfer = tracked-funds
        // movement (bounded). The asymmetry is intentional.
        // See src/domain/__tests__/overdrawRule.test.ts.
        if (sourceWallet.balance < amount) {
            throw new InsufficientFundsError();
        }

        const destWallet = await walletRepo.getById(toWalletId);
        if (!destWallet) {
            throw new Error('Destination wallet not found');
        }

        await walletRepo.updateBalance(fromWalletId, -amount);
        await walletRepo.updateBalance(toWalletId, amount);

        await transactionRepo.create({
            type: TransactionType.TRANSFER,
            amount,
            walletId: fromWalletId,
            categoryId: 'transfer-out',
            date: now,
            note: `Transfer to ${destWallet.name}`,
        });

        await transactionRepo.create({
            type: TransactionType.TRANSFER,
            amount,
            walletId: toWalletId,
            categoryId: 'transfer-in',
            date: now,
            note: `Transfer from ${sourceWallet.name}`,
        });
    });

    // ── Notify (after commit) ───────────────────────────────────────────

    eventBus.emitMultiple(['wallets', 'transactions']);
}
