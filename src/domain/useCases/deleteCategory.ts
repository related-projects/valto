/**
 * Delete Category Use Case
 *
 * Deletes a category only if no transactions reference it.
 * Prevents orphaned transaction records.
 */

import type { UseCaseDeps } from './types';

export async function deleteCategory(
    deps: Pick<UseCaseDeps, 'categoryRepo' | 'transactionRepo' | 'eventBus'>,
    categoryId: string,
): Promise<void> {
    const { categoryRepo, transactionRepo, eventBus } = deps;

    // ── Reference check ───────────────────────────────────────────────

    const transactions = await transactionRepo.getByCategoryId(categoryId);

    if (transactions.length > 0) {
        throw new Error(
            `Cannot delete category. It is used in ${transactions.length} transactions.`
        );
    }

    // ── Execute ───────────────────────────────────────────────────────

    await categoryRepo.delete(categoryId);

    eventBus.emit('categories');
}
