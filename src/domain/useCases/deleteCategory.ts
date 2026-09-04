/**
 * Delete Category Use Case
 *
 * Deletes a category only if no transactions or budgets reference it, and only
 * if it is not the last one.
 * Prevents orphaned transaction and budget records, and keeps the install able
 * to record a transaction.
 */

import type { UseCaseDeps } from './types';

export async function deleteCategory(
    deps: Pick<UseCaseDeps, 'categoryRepo' | 'transactionRepo' | 'budgetRepo' | 'eventBus'>,
    categoryId: string,
): Promise<void> {
    const { categoryRepo, transactionRepo, budgetRepo, eventBus } = deps;

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
