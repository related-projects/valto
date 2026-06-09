/**
 * BudgetRepository Unit Tests
 *
 * Tests CRUD operations, business rule enforcement, and domain queries.
 */

import { createTestDb } from '../../../tests/helpers/createTestDb';
import type { SqlDatabase } from '../storage/sql/SqlDatabase';
import { BudgetRepository } from '../repositories/BudgetRepository';
import { RepositoryError, RepositoryErrorType } from '../repositories/IRepository';
import { makeBudget, resetFactoryCounters } from '../../test-utils/testFactories';

describe('BudgetRepository', () => {
    let storage: SqlDatabase;
    let repo: BudgetRepository;

    beforeEach(async () => {
        storage = await createTestDb();
        repo = new BudgetRepository(storage);
        resetFactoryCounters();
    });

    // ─── CRUD ──────────────────────────────────────────────────────────

    it('getAll returns empty array initially', async () => {
        const budgets = await repo.getAll();
        expect(budgets).toEqual([]);
    });

    it('create + getAll persists budget', async () => {
        const budget = await repo.create({
            categoryId: 'cat-food',
            month: '2026-03',
            limitAmount: 50000,
        });

        expect(budget.id).toBeDefined();
        expect(budget.categoryId).toBe('cat-food');
        expect(budget.limitAmount).toBe(50000);
        expect(budget.month).toBe('2026-03');
        expect(budget.createdAt).toBeInstanceOf(Date);
        expect(budget.updatedAt).toBeInstanceOf(Date);

        const all = await repo.getAll();
        expect(all).toHaveLength(1);
    });

    it('getById returns correct budget', async () => {
        const created = await repo.create({
            categoryId: 'cat-food',
            month: '2026-03',
            limitAmount: 50000,
        });

        const found = await repo.getById(created.id);
        expect(found).not.toBeNull();
        expect(found!.categoryId).toBe('cat-food');
    });

    it('getById returns null for non-existent ID', async () => {
        const found = await repo.getById('non-existent');
        expect(found).toBeNull();
    });

    it('update modifies existing budget', async () => {
        const created = await repo.create({
            categoryId: 'cat-food',
            month: '2026-03',
            limitAmount: 50000,
        });

        const updated = await repo.update({
            ...created,
            limitAmount: 75000,
        });

        expect(updated.limitAmount).toBe(75000);

        const fetched = await repo.getById(created.id);
        expect(fetched!.limitAmount).toBe(75000);
    });

    it('update throws NOT_FOUND for non-existent budget', async () => {
        const budget = makeBudget({ id: 'non-existent' });
        try {
            await repo.update(budget);
            fail('Should have thrown');
        } catch (error) {
            expect(error).toBeInstanceOf(RepositoryError);
            expect((error as RepositoryError).type).toBe(RepositoryErrorType.NOT_FOUND);
        }
    });

    it('delete removes budget', async () => {
        const created = await repo.create({
            categoryId: 'cat-food',
            month: '2026-03',
            limitAmount: 50000,
        });

        await repo.delete(created.id);

        const all = await repo.getAll();
        expect(all).toHaveLength(0);
    });

    it('delete throws NOT_FOUND for non-existent budget', async () => {
        try {
            await repo.delete('non-existent');
            fail('Should have thrown');
        } catch (error) {
            expect(error).toBeInstanceOf(RepositoryError);
            expect((error as RepositoryError).type).toBe(RepositoryErrorType.NOT_FOUND);
        }
    });

    // ─── Duplicate Protection ──────────────────────────────────────────

    it('save rejects duplicate ID', async () => {
        const budget = makeBudget();
        await repo.save(budget);

        try {
            await repo.save(budget);
            fail('Should have thrown');
        } catch (error) {
            expect(error).toBeInstanceOf(RepositoryError);
            expect((error as RepositoryError).type).toBe(RepositoryErrorType.DUPLICATE_ERROR);
        }
    });

    it('save rejects duplicate category+month combination', async () => {
        const first = makeBudget({ id: 'b-1', categoryId: 'cat-food', month: '2026-03' });
        const second = makeBudget({ id: 'b-2', categoryId: 'cat-food', month: '2026-03' });

        await repo.save(first);

        try {
            await repo.save(second);
            fail('Should have thrown');
        } catch (error) {
            expect(error).toBeInstanceOf(RepositoryError);
            expect((error as RepositoryError).type).toBe(RepositoryErrorType.DUPLICATE_ERROR);
        }
    });

    it('allows same category in different months', async () => {
        await repo.save(makeBudget({ id: 'b-1', categoryId: 'cat-food', month: '2026-03' }));
        await repo.save(makeBudget({ id: 'b-2', categoryId: 'cat-food', month: '2026-04' }));

        const all = await repo.getAll();
        expect(all).toHaveLength(2);
    });

    // ─── Create Validation ─────────────────────────────────────────────

    it('create rejects invalid month format', async () => {
        try {
            await repo.create({ categoryId: 'cat-1', month: '2026/03', limitAmount: 50000 });
            fail('Should have thrown');
        } catch (error) {
            expect(error).toBeInstanceOf(RepositoryError);
            expect((error as RepositoryError).type).toBe(RepositoryErrorType.VALIDATION_ERROR);
        }
    });

    it('create rejects zero limit', async () => {
        try {
            await repo.create({ categoryId: 'cat-1', month: '2026-03', limitAmount: 0 });
            fail('Should have thrown');
        } catch (error) {
            expect(error).toBeInstanceOf(RepositoryError);
            expect((error as RepositoryError).type).toBe(RepositoryErrorType.VALIDATION_ERROR);
        }
    });

    it('create rejects negative limit', async () => {
        try {
            await repo.create({ categoryId: 'cat-1', month: '2026-03', limitAmount: -100 });
            fail('Should have thrown');
        } catch (error) {
            expect(error).toBeInstanceOf(RepositoryError);
            expect((error as RepositoryError).type).toBe(RepositoryErrorType.VALIDATION_ERROR);
        }
    });

    // ─── updateFromDTO ─────────────────────────────────────────────────

    it('updateFromDTO modifies limit amount', async () => {
        const created = await repo.create({
            categoryId: 'cat-1',
            month: '2026-03',
            limitAmount: 50000,
        });

        const updated = await repo.updateFromDTO({
            id: created.id,
            limitAmount: 75000,
        });

        expect(updated.limitAmount).toBe(75000);
        expect(updated.updatedAt.getTime()).toBeGreaterThanOrEqual(created.updatedAt.getTime());
    });

    it('updateFromDTO rejects non-existent budget', async () => {
        await expect(
            repo.updateFromDTO({ id: 'non-existent', limitAmount: 50000 })
        ).rejects.toMatchObject({
            type: RepositoryErrorType.NOT_FOUND,
        });
    });

    it('updateFromDTO rejects invalid month format', async () => {
        const created = await repo.create({
            categoryId: 'cat-1',
            month: '2026-03',
            limitAmount: 50000,
        });

        await expect(
            repo.updateFromDTO({ id: created.id, month: 'March2026' })
        ).rejects.toMatchObject({
            type: RepositoryErrorType.VALIDATION_ERROR,
        });
    });

    it('updateFromDTO rejects zero limit', async () => {
        const created = await repo.create({
            categoryId: 'cat-1',
            month: '2026-03',
            limitAmount: 50000,
        });

        await expect(
            repo.updateFromDTO({ id: created.id, limitAmount: 0 })
        ).rejects.toMatchObject({
            type: RepositoryErrorType.VALIDATION_ERROR,
        });
    });

    // ─── Domain Queries ────────────────────────────────────────────────

    it('getByMonth filters correctly', async () => {
        await repo.create({ categoryId: 'cat-1', month: '2026-03', limitAmount: 50000 });
        await repo.create({ categoryId: 'cat-2', month: '2026-03', limitAmount: 30000 });
        await repo.create({ categoryId: 'cat-1', month: '2026-04', limitAmount: 60000 });

        const march = await repo.getByMonth('2026-03');
        expect(march).toHaveLength(2);

        const april = await repo.getByMonth('2026-04');
        expect(april).toHaveLength(1);
    });

    it('getByMonth returns empty for month with no budgets', async () => {
        const result = await repo.getByMonth('2026-12');
        expect(result).toEqual([]);
    });

    it('getByCategoryAndMonth returns matching budget', async () => {
        await repo.create({ categoryId: 'cat-food', month: '2026-03', limitAmount: 80000 });

        const found = await repo.getByCategoryAndMonth('cat-food', '2026-03');
        expect(found).not.toBeNull();
        expect(found!.limitAmount).toBe(80000);
    });

    it('getByCategoryAndMonth returns null for no match', async () => {
        const found = await repo.getByCategoryAndMonth('cat-food', '2026-06');
        expect(found).toBeNull();
    });
});
