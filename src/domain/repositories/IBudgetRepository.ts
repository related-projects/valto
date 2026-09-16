/**
 * Budget Repository Interface (domain-level)
 *
 * The contract the domain (use cases) depends on for budget persistence.
 * Implemented by the concrete BudgetRepository in src/data/.
 */

import type { Budget } from '../entities';
import type { IRepository } from './IRepository';

export interface IBudgetRepository extends IRepository<Budget> {
    /** All budgets referencing a given category, across every month. */
    getByCategoryId(categoryId: string): Promise<Budget[]>;
}
