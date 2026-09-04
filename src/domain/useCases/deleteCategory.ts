/**
 * Delete Category Use Case
 *
 * Deletes a category only if no transactions, budgets or live recurring rules
 * reference it, and only if it is not the last one.
 * Prevents orphaned transaction, budget and recurring rule records, and keeps
 * the install able to record a transaction.
 */

import { CategoryHasRecurringRulesError } from './errors';
import type { UseCaseDeps } from './types';

export async function deleteCategory(
    deps: Pick<UseCaseDeps, 'categoryRepo' | 'transactionRepo' | 'budgetRepo' | 'recurringRepo' | 'eventBus'>,
    categoryId: string,
): Promise<void> {
    const { categoryRepo, transactionRepo, budgetRepo, recurringRepo, eventBus } = deps;

    // ── Reference check ───────────────────────────────────────────────

    const transactions = await transactionRepo.getByCategoryId(categoryId);

    if (transactions.length > 0) {
        throw new Error(
            `Cannot delete category. It is used in ${transactions.length} transactions.`
        );
    }

    // A budget is a reference too, and budgets.category_id has no database
    // constraint behind it, so nothing else would catch this: deleting a
    // budgeted-but-unused category left the budget row pointing at a category
    // that no longer exists.
    const budgets = await budgetRepo.getByCategoryId(categoryId);

    if (budgets.length > 0) {
        throw new Error(
            `Cannot delete category. It is used in ${budgets.length} budgets.`
        );
    }

    // A recurring rule is the third reference, and the only one whose breakage
    // is silent. A dangling transaction or budget is at least visible in a list;
    // a rule that has lost its category still looks armed on the rules screen
    // while the engine refuses it on every run, so the user only ever sees an
    // occurrence that stops arriving.
    //
    // Past data may lose its link; a future instruction may not. EVERY rule
    // counts, paused and expired ones included: `is_paused` records when a rule
    // runs, not whether it exists, and a paused rule that gets resumed must not
    // resume into a category deleted while it slept. This is deliberately a
    // wider scope than the engine's getActiveRules - the engine asks what
    // executes now, this asks what still points here.
    const rules = await recurringRepo.getByCategoryId(categoryId);

    if (rules.length > 0) {
        throw new CategoryHasRecurringRulesError(rules.length);
    }

    // A transaction needs a category as much as it needs a wallet, and the
    // reference check above does not imply this one: on an install whose
    // categories are all unused - a fresh one, or one whose ledger was just
    // wiped - every category is individually deletable, so the set can be
    // emptied one refusal-free delete at a time.
    const categories = await categoryRepo.getAll();

    if (categories.length <= 1) {
        throw new Error('Cannot delete category. At least one category is required.');
    }

    // ── Execute ───────────────────────────────────────────────────────

    await categoryRepo.delete(categoryId);

    eventBus.emit('categories');
}
