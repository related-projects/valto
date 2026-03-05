/**
 * Create Wallet Use Case
 *
 * Validates input and creates a new wallet.
 */

import { CreateWalletDTO, Wallet } from '../entities';
import type { UseCaseDeps } from './types';

export async function createWallet(
    deps: Pick<UseCaseDeps, 'walletRepo' | 'eventBus'>,
    input: CreateWalletDTO,
): Promise<Wallet> {
    const { walletRepo, eventBus } = deps;

    // ── Validation ────────────────────────────────────────────────────

    if (!input.name || input.name.trim().length === 0) {
        throw new Error('Wallet name is required');
    }

    if (input.balance < 0) {
        throw new Error('Initial balance must be 0 or greater');
    }

    // ── Execute ───────────────────────────────────────────────────────

    const wallet = await walletRepo.create(input);

    eventBus.emit('wallets');

    return wallet;
}
