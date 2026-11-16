/**
 * Transfer Funds Use Case
 *
 * Transfers money between two wallets using double-entry accounting.
 * Validates inputs, updates both balances, and creates paired transfer records.
 */

import { TransactionType } from '../entities';
import { TRANSFER_IN_CATEGORY_ID, TRANSFER_OUT_CATEGORY_ID } from '../ledger/transferCategories';
import { InsufficientFundsError } from './errors';
import type { UseCaseDeps } from './types';

export interface TransferFundsInput {
    fromWalletId: string;
    toWalletId: string;
    amount: number;
    /**
     * When the transfer happened, stored on both legs. Absent: the present
     * instant (the Dashboard shortcut has no date field). Checked as
     * createTransaction's date is, by validateTransaction when each leg is
     * written. REGISTRE V-129, decision 1.
     */
    date?: Date;
    /**
     * The note the user typed. Trimmed, then stored on each leg after that
     * leg's wallet text, so the leg still names the other wallet:
     * "Transfer to <wallet> - <note>". Absent, empty or blank: the wallet text
     * alone. REGISTRE V-129, Owner decisions 16/11 and 17/11.
     */
    note?: string;
}

/** A leg's note: its wallet text, then the typed note when there is one. */
function legNote(walletText: string, typedNote: string): string {
    return typedNote ? `${walletText} - ${typedNote}` : walletText;
}

export async function transferFunds(
    deps: Pick<UseCaseDeps, 'transactionRepo' | 'walletRepo' | 'eventBus' | 'runInTransaction'>,
    input: TransferFundsInput,
): Promise<void> {
    const { transactionRepo, walletRepo, eventBus, runInTransaction } = deps;
    const { fromWalletId, toWalletId, amount, note } = input;

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
    // The date is only written: the sufficiency check reads the current
    // balance, whatever date the transfer carries.
    const date = input.date ?? new Date();
    const typedNote = note?.trim() ?? '';

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
            categoryId: TRANSFER_OUT_CATEGORY_ID,
            date,
            note: legNote(`Transfer to ${destWallet.name}`, typedNote),
        });

        await transactionRepo.create({
            type: TransactionType.TRANSFER,
            amount,
            walletId: toWalletId,
            categoryId: TRANSFER_IN_CATEGORY_ID,
            date,
            note: legNote(`Transfer from ${sourceWallet.name}`, typedNote),
        });
    });

    // ── Notify (after commit) ───────────────────────────────────────────

    eventBus.emitMultiple(['wallets', 'transactions']);
}
