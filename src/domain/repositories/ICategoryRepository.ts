/**
 * Category Repository Interface (domain-level)
 *
 * The contract the domain (use cases) depends on for category persistence.
 * Implemented by the concrete CategoryRepository in src/data/.
 */

import type { Category, CreateCategoryDTO } from '../entities';
import type { IRepository } from './IRepository';

export interface ICategoryRepository extends IRepository<Category> {
    /** Create a category from a DTO (generates id). */
    create(dto: CreateCategoryDTO): Promise<Category>;
}
