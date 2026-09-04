/**
 * Recurring Transaction Repository Interface (domain-level)
 *
 * The contract the domain (use cases) depends on for recurring rule
 * persistence. Implemented by the concrete RecurringTransactionRepository in
 * src/data/.
 *
 * Two scopes live here, and they answer different questions. Do not merge them.
 *
 *  - getActiveRules is "what executes now". The engine wants this: a paused or
 *    expired rule has no occurrence to generate today.
 *  - getByWalletId / getByCategoryId are "what exists". The deletion guards want
 *    this: `is_paused` records WHEN a rule runs, not whether it is still a
 *    standing order. A paused rule can be resumed, and it must not be resumable
 *    into a wallet or category that was deleted while it slept. Pausing is not
 *    an escape hatch for orphaning a rule.
 */

import type { RecurringTransaction } from '../entities';
import type { IRepository } from './IRepository';

export interface IRecurringTransactionRepository extends IRepository<RecurringTransaction> {
    /** Rules that are not paused and have not passed their end date. */
    getActiveRules(): Promise<RecurringTransaction[]>;

    /** Every rule drawing on a given wallet, paused and expired ones included. */
    getByWalletId(walletId: string): Promise<RecurringTransaction[]>;

    /** Every rule filing against a given category, paused and expired included. */
    getByCategoryId(categoryId: string): Promise<RecurringTransaction[]>;
}
