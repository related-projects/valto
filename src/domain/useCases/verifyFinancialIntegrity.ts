/**
 * Verify Financial Integrity Use Case
 *
 * Authoritative balance-integrity check for the whole app. Delegates to the
 * single source of truth — the wallet ledger audit (opening_balance +
 * Σ ledgerEffect(transactions), per wallet) — rather than a parallel ad-hoc sum.
 * Returns true when every wallet's stored balance matches its ledger (drift 0).
 *
 * Audit-only: this detects drift and deliberately does not correct it. Atomic
 * writes should prevent drift from ever occurring, so a false result is a bug
 * report — silently rewriting the stored balance would hide the bug that caused
 * the drift. Correcting is a separate, explicit decision, not a side effect of
 * checking.
 */

import type { UseCaseDeps } from './types';

export async function verifyFinancialIntegrity(
    deps: Pick<UseCaseDeps, 'walletRepo'>,
): Promise<boolean> {
    const results = await deps.walletRepo.auditBalances();
    return results.every((r) => r.drift === 0);
}
