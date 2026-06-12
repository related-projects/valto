/**
 * Category Service Tests
 *
 * Tests reassignCategoryBulk and mergeCategories operations.
 */

import { createTestDb } from '../../../tests/helpers/createTestDb';
import type { SqlDatabase } from '../storage/sql/SqlDatabase';
import { BudgetRepository } from '../repositories/BudgetRepository';
import { CategoryRepository } from '../repositories/CategoryRepository';
import { TransactionRepository } from '../repositories/TransactionRepository';
import { CategoryType, TransactionType } from '../../domain/entities';

let mockDb: SqlDatabase;
let mockCategoryRepo: CategoryRepository;
let mockTransactionRepo: TransactionRepository;
let mockBudgetRepo: BudgetRepository;

const mockEmit = jest.fn();

jest.mock('../../core/di', () => ({
    getCategoryRepository: () => mockCategoryRepo,
    getTransactionRepository: () => mockTransactionRepo,
    getBudgetRepository: () => mockBudgetRepo,
}));

jest.mock('../../core/events', () => ({
    dataEvents: {
        emit: (...args: any[]) => mockEmit(...args),
        emitMultiple: jest.fn(),
    },
}));

// Import after mocks
import { reassignCategoryBulk, mergeCategories } from '../services/categoryService';

describe('categoryService', () => {
    beforeEach(async () => {
        mockDb = await createTestDb();
        mockCategoryRepo = new CategoryRepository(mockDb);
        mockTransactionRepo = new TransactionRepository(mockDb);
        mockBudgetRepo = new BudgetRepository(mockDb);
        mockEmit.mockClear();
    });

    describe('reassignCategoryBulk', () => {
        it('reassigns transactions from old to new category', async () => {
            const oldCat = await mockCategoryRepo.create({ name: 'Old', type: CategoryType.EXPENSE });
            const newCat = await mockCategoryRepo.create({ name: 'New', type: CategoryType.EXPENSE });

            await mockTransactionRepo.create({
                type: TransactionType.EXPENSE,
                amount: 5000,
                categoryId: oldCat.id,
                walletId: 'w-1',
                date: new Date(),
            });

            await mockTransactionRepo.create({
                type: TransactionType.EXPENSE,
                amount: 3000,
                categoryId: oldCat.id,
                walletId: 'w-1',
                date: new Date(),
            });

            const count = await reassignCategoryBulk(oldCat.id, newCat.id);

            expect(count).toBe(2);
            expect(mockEmit).toHaveBeenCalledWith('transactions');
        });

        it('returns 0 when reassigning same category', async () => {
            const cat = await mockCategoryRepo.create({ name: 'Same', type: CategoryType.EXPENSE });
            const count = await reassignCategoryBulk(cat.id, cat.id);
            expect(count).toBe(0);
        });

        it('throws when target category does not exist', async () => {
            const oldCat = await mockCategoryRepo.create({ name: 'Old', type: CategoryType.EXPENSE });
            await expect(
                reassignCategoryBulk(oldCat.id, 'non-existent')
            ).rejects.toThrow('does not exist');
        });

        it('does not emit events when no transactions reassigned', async () => {
            const oldCat = await mockCategoryRepo.create({ name: 'Old', type: CategoryType.EXPENSE });
            const newCat = await mockCategoryRepo.create({ name: 'New', type: CategoryType.EXPENSE });

            await reassignCategoryBulk(oldCat.id, newCat.id);
            expect(mockEmit).not.toHaveBeenCalledWith('transactions');
        });
    });

    describe('mergeCategories', () => {
        it('reassigns transactions and budgets, deletes source', async () => {
            const source = await mockCategoryRepo.create({ name: 'Source', type: CategoryType.EXPENSE });
            const target = await mockCategoryRepo.create({ name: 'Target', type: CategoryType.EXPENSE });

            await mockTransactionRepo.create({
                type: TransactionType.EXPENSE,
                amount: 5000,
                categoryId: source.id,
                walletId: 'w-1',
                date: new Date(),
            });

            await mockBudgetRepo.create({
                categoryId: source.id,
                month: '2026-03',
                limitAmount: 50000,
            });

            const result = await mergeCategories(source.id, target.id);

            expect(result.transactionsReassigned).toBe(1);
            expect(result.budgetsReassigned).toBe(1);

            // Source category should be deleted
            const remaining = await mockCategoryRepo.getAll();
            expect(remaining.find(c => c.id === source.id)).toBeUndefined();

            expect(mockEmit).toHaveBeenCalledWith('categories');
        });

        it('throws when merging category into itself', async () => {
            const cat = await mockCategoryRepo.create({ name: 'Self', type: CategoryType.EXPENSE });
            await expect(
                mergeCategories(cat.id, cat.id)
            ).rejects.toThrow('Cannot merge a category into itself');
        });

        it('throws when source does not exist', async () => {
            const target = await mockCategoryRepo.create({ name: 'Target', type: CategoryType.EXPENSE });
            await expect(
                mergeCategories('non-existent', target.id)
            ).rejects.toThrow('does not exist');
        });

        it('throws when target does not exist', async () => {
            const source = await mockCategoryRepo.create({ name: 'Source', type: CategoryType.EXPENSE });
            await expect(
                mergeCategories(source.id, 'non-existent')
            ).rejects.toThrow('does not exist');
        });

        it('handles duplicate budgets by deleting source budget', async () => {
            const source = await mockCategoryRepo.create({ name: 'Source', type: CategoryType.EXPENSE });
            const target = await mockCategoryRepo.create({ name: 'Target', type: CategoryType.EXPENSE });

            // Both have budgets for the same month
            await mockBudgetRepo.create({ categoryId: source.id, month: '2026-03', limitAmount: 30000 });
            await mockBudgetRepo.create({ categoryId: target.id, month: '2026-03', limitAmount: 50000 });

            const result = await mergeCategories(source.id, target.id);
            expect(result.budgetsReassigned).toBe(1);

            // Should only have the target budget remaining
            const budgets = await mockBudgetRepo.getAll();
            const march = budgets.filter(b => b.month === '2026-03');
            expect(march.length).toBe(1);
            expect(march[0].categoryId).toBe(target.id);
        });
    });
});
