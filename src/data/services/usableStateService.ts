/**
 * Usable State Service
 *
 * One definition of the terminal state every destructive path must land on:
 * at least one wallet, and at least the seeded default categories.
 *
 * A transaction needs both a wallet and a category, and neither can be created
 * from inside the add-transaction flow. Onboarding is the only flow that
 * materializes them unprompted, and it never runs again once completed - so a
 * path that empties either table leaves an install in which nothing can be
 * recorded and nothing in place offers a way out.
 *
 * Every such path calls this instead of repeating the repair, which is what
 * stops the two resets from diverging again: resetAppData created a replacement
 * wallet, resetFinancialDataForCurrencyReset did not, and the divergence was
 * documented without a reason rather than fixed.
 *
 * Idempotent by construction: each branch is guarded on the table being empty,
 * so calling this when data exists does nothing and calling it twice is the
 * same as calling it once. That is what lets it also run on every boot.
 */

import { getCategoryRepository, getWalletRepository } from '../../core/di';
import { initializeSeedData, resetDefaultWallet, resetSeedFlag } from '../seed';

/**
 * Bring the install up to the terminal state, repairing only what is missing.
 *
 * Categories are restored through the seed rather than written here, so the
 * defaults stay defined in exactly one place. The seed flag is cleared first
 * because initializeSeedData is flag-gated: without this, an install whose
 * category table was emptied after the flag was set would be seeded with
 * nothing.
 */
export async function ensureUsableState(): Promise<void> {
    const categoryRepo = getCategoryRepository();
    const categories = await categoryRepo.getAll();

    if (categories.length === 0) {
        await resetSeedFlag();
        await initializeSeedData();
    }

    const walletRepo = getWalletRepository();
    const wallets = await walletRepo.getAll();

    if (wallets.length === 0) {
        await walletRepo.create(resetDefaultWallet);
    }
}
