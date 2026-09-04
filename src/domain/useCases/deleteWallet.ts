/**
 * Delete Wallet Use Case
 *
 * Deletes a wallet only if no recurring rule draws on it, and only if it is not
 * the last one.
 * Keeps the install able to record a transaction, and keeps every standing
 * order pointing at a wallet that exists.
 */

import { LastWalletError, WalletHasRecurringRulesError } from './errors';
import type { UseCaseDeps } from './types';

export async function deleteWallet(
    deps: Pick<UseCaseDeps, 'walletRepo' | 'recurringRepo' | 'eventBus'>,
    walletId: string,
): Promise<void> {
    const { walletRepo, recurringRepo, eventBus } = deps;

    const wallets = await walletRepo.getAll();

    if (wallets.length <= 1) {
        throw new LastWalletError();
    }

    // Deliberately asymmetric with transactions: a wallet holding transactions
    // stays deletable behind the existing consent dialog, which already warns
    // that past transactions lose their wallet link. Past data may lose its
    // link; a future instruction may not. A transaction is a past fact that
    // remains true without its wallet; a recurring rule is a standing order
    // that, without its wallet, will never execute again - and fails silently
    // when it tries, on every run, for as long as the rule exists.
    //
    // EVERY rule counts, paused and expired included, for the reason set out in
    // deleteCategory: pausing is not an escape hatch for orphaning a rule.
    const rules = await recurringRepo.getByWalletId(walletId);

    if (rules.length > 0) {
        throw new WalletHasRecurringRulesError(rules.length);
    }

    await walletRepo.delete(walletId);

    eventBus.emit('wallets');
}
