/**
 * Create Wallet Use Case
 *
 * Validates input and creates a new wallet.
 */

import { CreateWalletDTO, Wallet } from '../entities';
import type { UseCaseDeps } from './types';

export async function createWallet(
    deps: Pick<UseCaseDeps, 'walletRepo' | 'eventBus' | 'runInTransaction'>,
    input: CreateWalletDTO,
): Promise<Wallet> {
    const { walletRepo, eventBus, runInTransaction } = deps;

    // ── Validation ────────────────────────────────────────────────────

    if (!input.name || input.name.trim().length === 0) {
        throw new Error('Wallet name is required');
    }

    if (input.balance < 0) {
        throw new Error('Initial balance must be 0 or greater');
    }

    // ── Execute ───────────────────────────────────────────────────────

    // Through the runner (REGISTRE V-109): a wallet created while another
    // transaction is open - a restore - waits for it to end instead of landing
    // inside it and being erased by its rollback. Verified by
    // writesThroughRunner.test.ts - "V-109 a".
    const wallet = await runInTransaction(() => walletRepo.create(input));

    eventBus.emit('wallets');

    return wallet;
}
