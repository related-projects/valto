/**
 * Category Service
 *
 * Safety tools for category operations that affect transactions.
 * Ensures no orphan transactions and no data loss during merges.
 */

import {
    getBudgetRepository,
    getCategoryRepository,
    getTransactionRepository,
} from '../../core/di';
import { dataEvents } from '../../core/events';
import {
    serializeTransaction,
    Transaction,
} from '../../domain/entities';
import { asyncStorageAdapter, StorageKeys } from '../storage';

// ─── Bulk Reassign ────────────────────────────────────────────────────

/**
 * Reassign all transactions from one category to another.
 * Writes all changes in a single storage operation to avoid partial updates.
 *
 * @returns Number of transactions reassigned
 */
export async function reassignCategoryBulk(
    oldCategoryId: string,
    newCategoryId: string,
): Promise<number> {
    if (oldCategoryId === newCategoryId) {
        return 0;
    }

    // Verify target category exists
    const targetCategory = await getCategoryRepository().getById(newCategoryId);
    if (!targetCategory) {
        throw new Error(`Target category ${newCategoryId} does not exist`);
    }

    const transactionRepo = getTransactionRepository();
    const allTransactions = await transactionRepo.getAll();

    let reassignedCount = 0;
    const updated: Transaction[] = allTransactions.map(t => {
        if (t.categoryId === oldCategoryId) {
            reassignedCount++;
            return { ...t, categoryId: newCategoryId };
        }
        return t;
    });

    if (reassignedCount > 0) {
        // Single atomic write
        const serialized = updated.map(serializeTransaction);
        await asyncStorageAdapter.set(StorageKeys.TRANSACTIONS, serialized);
        dataEvents.emit('transactions');
    }

    return reassignedCount;
}

// ─── Merge Categories ─────────────────────────────────────────────────

/**
 * Merge source category into target:
 * 1. Reassign all transactions from source → target
 * 2. Reassign all budgets from source → target
 * 3. Delete source category
 *
 * Ensures no orphan transactions or budgets.
 *
 * @returns { transactionsReassigned, budgetsReassigned }
 */
export async function mergeCategories(
    sourceId: string,
    targetId: string,
): Promise<{ transactionsReassigned: number; budgetsReassigned: number }> {
    if (sourceId === targetId) {
        throw new Error('Cannot merge a category into itself');
    }

    // Verify both categories exist
    const categoryRepo = getCategoryRepository();
    const [source, target] = await Promise.all([
        categoryRepo.getById(sourceId),
        categoryRepo.getById(targetId),
    ]);

    if (!source) {
        throw new Error(`Source category ${sourceId} does not exist`);
    }
    if (!target) {
        throw new Error(`Target category ${targetId} does not exist`);
    }

    // Step 1: Reassign transactions
    const transactionsReassigned = await reassignCategoryBulk(sourceId, targetId);

    // Step 2: Reassign budgets (merge or delete duplicates)
    const budgetRepo = getBudgetRepository();
    const allBudgets = await budgetRepo.getAll();
    let budgetsReassigned = 0;

    for (const budget of allBudgets) {
        if (budget.categoryId === sourceId) {
            // Check if target already has a budget for this month
            const existingTargetBudget = allBudgets.find(
                b => b.categoryId === targetId && b.month === budget.month,
            );

            if (existingTargetBudget) {
                // Target already has a budget for this month — delete the source budget
                await budgetRepo.delete(budget.id);
            } else {
                // Move the budget to the target category
                await budgetRepo.update({ ...budget, categoryId: targetId, updatedAt: new Date() });
            }
            budgetsReassigned++;
        }
    }

    if (budgetsReassigned > 0) {
        dataEvents.emit('budgets');
    }

    // Step 3: Delete source category
    await categoryRepo.delete(sourceId);
    dataEvents.emit('categories');

    return { transactionsReassigned, budgetsReassigned };
}
