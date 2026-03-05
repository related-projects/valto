/**
 * Transfer Funds Use Case
 *
 * Transfers money between two wallets using double-entry accounting.
 * Validates inputs, updates both balances, and creates paired transfer records.
 */

import { TransactionType } from '../entities';
import type { UseCaseDeps } from './types';

export interface TransferFundsInput {
    fromWalletId: string;
    toWalletId: string;
    amount: number;
}

export async function transferFunds(
    deps: Pick<UseCaseDeps, 'transactionRepo' | 'walletRepo' | 'eventBus'>,
    input: TransferFundsInput,
): Promise<void> {
    const { transactionRepo, walletRepo, eventBus } = deps;
    const { fromWalletId, toWalletId, amount } = input;

    // ── Validation ────────────────────────────────────────────────────

    if (amount <= 0) {
        throw new Error('Transfer amount must be greater than 0');
    }

    if (fromWalletId === toWalletId) {
        throw new Error('Source and destination wallets must be different');
    }

    const sourceWallet = await walletRepo.getById(fromWalletId);
    if (!sourceWallet) {
        throw new Error('Source wallet not found');
    }

    if (sourceWallet.balance < amount) {
        throw new Error('Insufficient balance in source wallet');
    }

    const destWallet = await walletRepo.getById(toWalletId);
    if (!destWallet) {
        throw new Error('Destination wallet not found');
    }

    // ── Execute ───────────────────────────────────────────────────────

    // Update both wallet balances
    await walletRepo.updateBalance(fromWalletId, -amount);
    await walletRepo.updateBalance(toWalletId, amount);

    // Create double-entry transfer records
    const now = new Date();

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

    // ── Notify ────────────────────────────────────────────────────────

    eventBus.emitMultiple(['wallets', 'transactions']);
}
