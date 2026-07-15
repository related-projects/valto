/**
 * Verify Financial Integrity Use Case
 *
 * Authoritative balance-integrity check for the whole app. Delegates to the
 * single source of truth — the wallet ledger reconciliation (opening_balance +
 * Σ ledgerEffect(transactions), per wallet) — rather than a parallel ad-hoc sum.
 * Returns true when every wallet's stored balance matches its ledger (drift 0).
 */

import type { UseCaseDeps } from './types';

export async function verifyFinancialIntegrity(
    deps: Pick<UseCaseDeps, 'walletRepo'>,
): Promise<boolean> {
    const results = await deps.walletRepo.reconcile();
    return results.every((r) => r.drift === 0);
}
