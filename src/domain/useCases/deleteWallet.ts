/**
 * Delete Wallet Use Case
 *
 * Deletes a wallet only if it is not the last one.
 * Keeps the install able to record a transaction.
 */

import { LastWalletError } from './errors';
import type { UseCaseDeps } from './types';

export async function deleteWallet(
    deps: Pick<UseCaseDeps, 'walletRepo' | 'eventBus'>,
    walletId: string,
): Promise<void> {
    const { walletRepo, eventBus } = deps;

    const wallets = await walletRepo.getAll();

    if (wallets.length <= 1) {
        throw new LastWalletError();
    }

    await walletRepo.delete(walletId);

    eventBus.emit('wallets');
}
