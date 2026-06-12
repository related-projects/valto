/**
 * CategoryRepository Unit Tests
 *
 * Tests CRUD operations, validation, and domain-specific query methods.
 */

import { createTestDb } from '../../../tests/helpers/createTestDb';
import type { SqlDatabase } from '../storage/sql/SqlDatabase';
import { CategoryType } from '../../domain/entities/Category';
import { CategoryRepository } from '../repositories/CategoryRepository';
import { RepositoryError, RepositoryErrorType } from '../repositories/IRepository';
import { makeCategory, resetFactoryCounters } from '../../test-utils/testFactories';

describe('CategoryRepository', () => {
    let storage: SqlDatabase;
    let repo: CategoryRepository;

    beforeEach(async () => {
        storage = await createTestDb();
        repo = new CategoryRepository(storage);
        resetFactoryCounters();
    });

    // ─── CRUD ──────────────────────────────────────────────────────────

    it('getAll returns empty array initially', async () => {
        const categories = await repo.getAll();
        expect(categories).toEqual([]);
    });

    it('create + getAll persists category', async () => {
        const cat = await repo.create({
            name: 'Food',
            type: CategoryType.EXPENSE,
            icon: '🍔',
            color: '#FF5722',
        });

        expect(cat.id).toBeDefined();
        expect(cat.name).toBe('Food');
        expect(cat.type).toBe(CategoryType.EXPENSE);

        const all = await repo.getAll();
        expect(all).toHaveLength(1);
    });

    it('getById returns correct category', async () => {
        const created = await repo.create({
            name: 'Transport',
            type: CategoryType.EXPENSE,
        });

        const found = await repo.getById(created.id);
        expect(found).not.toBeNull();
        expect(found!.name).toBe('Transport');
    });

    it('getById returns null for non-existent ID', async () => {
        const found = await repo.getById('non-existent');
        expect(found).toBeNull();
    });

    it('update modifies existing category', async () => {
        const created = await repo.create({
            name: 'Food',
            type: CategoryType.EXPENSE,
        });

        const updated = await repo.update({
            ...created,
            name: 'Groceries',
        });

        expect(updated.name).toBe('Groceries');

        const fetched = await repo.getById(created.id);
        expect(fetched!.name).toBe('Groceries');
    });

    it('update throws NOT_FOUND for non-existent category', async () => {
        const cat = makeCategory({ id: 'non-existent' });
        try {
            await repo.update(cat);
            fail('Should have thrown');
        } catch (error) {
            expect(error).toBeInstanceOf(RepositoryError);
            expect((error as RepositoryError).type).toBe(RepositoryErrorType.NOT_FOUND);
        }
    });

    it('delete removes category', async () => {
        const created = await repo.create({
            name: 'Temp',
            type: CategoryType.EXPENSE,
        });

        await repo.delete(created.id);

        const all = await repo.getAll();
        expect(all).toHaveLength(0);
    });

    it('delete throws NOT_FOUND for non-existent category', async () => {
        try {
            await repo.delete('non-existent');
            fail('Should have thrown');
        } catch (error) {
            expect(error).toBeInstanceOf(RepositoryError);
            expect((error as RepositoryError).type).toBe(RepositoryErrorType.NOT_FOUND);
        }
    });

    // ─── Duplicate ID ──────────────────────────────────────────────────

    it('save rejects duplicate ID', async () => {
        const cat = makeCategory({ id: 'dup-id' });
        await repo.save(cat);

        try {
            await repo.save(cat);
            fail('Should have thrown');
        } catch (error) {
            expect(error).toBeInstanceOf(RepositoryError);
            expect((error as RepositoryError).type).toBe(RepositoryErrorType.DUPLICATE_ERROR);
        }
    });

    // ─── Validation ────────────────────────────────────────────────────

    it('save rejects empty id', async () => {
        await expect(repo.save(makeCategory({ id: '' }))).rejects.toMatchObject({
            type: RepositoryErrorType.VALIDATION_ERROR,
        });
    });

    it('save rejects null id', async () => {
        await expect(repo.save(makeCategory({ id: null as any }))).rejects.toMatchObject({
            type: RepositoryErrorType.VALIDATION_ERROR,
        });
    });

    it('save rejects empty name', async () => {
        await expect(repo.save(makeCategory({ name: '' }))).rejects.toMatchObject({
            type: RepositoryErrorType.VALIDATION_ERROR,
        });
    });

    it('save rejects whitespace-only name', async () => {
        await expect(repo.save(makeCategory({ name: '   ' }))).rejects.toMatchObject({
            type: RepositoryErrorType.VALIDATION_ERROR,
        });
    });

    it('update rejects empty name', async () => {
        const cat = makeCategory();
        await repo.save(cat);

        await expect(repo.update({ ...cat, name: '' })).rejects.toMatchObject({
            type: RepositoryErrorType.VALIDATION_ERROR,
        });
    });

    // ─── updateFromDTO ─────────────────────────────────────────────────

    it('updateFromDTO modifies name', async () => {
        const created = await repo.create({
            name: 'Food',
            type: CategoryType.EXPENSE,
        });

        const updated = await repo.updateFromDTO({
            id: created.id,
            name: 'Groceries',
        });

        expect(updated.name).toBe('Groceries');
        expect(updated.type).toBe(CategoryType.EXPENSE); // unchanged
    });

    it('updateFromDTO rejects non-existent category', async () => {
        await expect(
            repo.updateFromDTO({ id: 'non-existent', name: 'Foo' })
        ).rejects.toMatchObject({
            type: RepositoryErrorType.NOT_FOUND,
        });
    });

    // ─── Domain Queries ────────────────────────────────────────────────

    it('getByType filters correctly', async () => {
        await repo.create({ name: 'Food', type: CategoryType.EXPENSE });
        await repo.create({ name: 'Salary', type: CategoryType.INCOME });
        await repo.create({ name: 'Transport', type: CategoryType.EXPENSE });

        const expenses = await repo.getByType(CategoryType.EXPENSE);
        expect(expenses).toHaveLength(2);
        expenses.forEach(c => expect(c.type).toBe(CategoryType.EXPENSE));

        const incomes = await repo.getByType(CategoryType.INCOME);
        expect(incomes).toHaveLength(1);
    });

    it('getExpenseCategories returns only expenses', async () => {
        await repo.create({ name: 'Food', type: CategoryType.EXPENSE });
        await repo.create({ name: 'Salary', type: CategoryType.INCOME });

        const expenses = await repo.getExpenseCategories();
        expect(expenses).toHaveLength(1);
        expect(expenses[0].name).toBe('Food');
    });

    it('getIncomeCategories returns only incomes', async () => {
        await repo.create({ name: 'Food', type: CategoryType.EXPENSE });
        await repo.create({ name: 'Salary', type: CategoryType.INCOME });

        const incomes = await repo.getIncomeCategories();
        expect(incomes).toHaveLength(1);
        expect(incomes[0].name).toBe('Salary');
    });

    it('getByType returns empty for no matches', async () => {
        await repo.create({ name: 'Food', type: CategoryType.EXPENSE });
        const incomes = await repo.getByType(CategoryType.INCOME);
        expect(incomes).toEqual([]);
    });
});
