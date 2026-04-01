/**
 * TransactionRepository Query Method Tests
 *
 * Tests domain-specific query methods that complement existing basic CRUD tests:
 * pagination, filtering by wallet/category/type/date range, and count.
 */

import { InMemoryStorage } from '../../../tests/helpers/InMemoryStorage';
import { TransactionType } from '../../domain/entities/Transaction';
import { TransactionRepository } from '../repositories/TransactionRepository';
import { makeTransaction, resetFactoryCounters } from '../../test-utils/testFactories';

describe('TransactionRepository — Query Methods', () => {
    let storage: InMemoryStorage;
    let repo: TransactionRepository;

    beforeEach(() => {
        storage = new InMemoryStorage();
        repo = new TransactionRepository(storage);
        resetFactoryCounters();
    });

    // ─── Helper to seed multiple transactions ──────────────────────────

    async function seedTransactions(count: number) {
        for (let i = 0; i < count; i++) {
            await repo.save(makeTransaction({
                date: new Date(`2026-03-${String(i + 1).padStart(2, '0')}T12:00:00Z`),
            }));
        }
    }

    // ─── Pagination ────────────────────────────────────────────────────

    describe('getTransactionsPage', () => {
        it('returns first page with correct metadata', async () => {
            await seedTransactions(15);

            const result = await repo.getTransactionsPage(1, 10);
            expect(result.data).toHaveLength(10);
            expect(result.page).toBe(1);
            expect(result.limit).toBe(10);
            expect(result.total).toBe(15);
            expect(result.hasMore).toBe(true);
        });

        it('returns last page correctly', async () => {
            await seedTransactions(15);

            const result = await repo.getTransactionsPage(2, 10);
            expect(result.data).toHaveLength(5);
            expect(result.hasMore).toBe(false);
        });

        it('returns empty page beyond data', async () => {
            await seedTransactions(5);

            const result = await repo.getTransactionsPage(3, 10);
            expect(result.data).toHaveLength(0);
            expect(result.hasMore).toBe(false);
        });

        it('sorts by date descending', async () => {
            await repo.save(makeTransaction({ date: new Date('2026-03-01T12:00:00Z') }));
            await repo.save(makeTransaction({ date: new Date('2026-03-15T12:00:00Z') }));
            await repo.save(makeTransaction({ date: new Date('2026-03-10T12:00:00Z') }));

            const result = await repo.getTransactionsPage(1, 10);
            expect(result.data[0].date.getTime()).toBeGreaterThan(result.data[1].date.getTime());
            expect(result.data[1].date.getTime()).toBeGreaterThan(result.data[2].date.getTime());
        });

        it('handles empty repository', async () => {
            const result = await repo.getTransactionsPage(1, 10);
            expect(result.data).toHaveLength(0);
            expect(result.total).toBe(0);
            expect(result.hasMore).toBe(false);
        });
    });

    // ─── getCount ──────────────────────────────────────────────────────

    describe('getCount', () => {
        it('returns 0 for empty repository', async () => {
            expect(await repo.getCount()).toBe(0);
        });

        it('returns correct count', async () => {
            await seedTransactions(7);
            expect(await repo.getCount()).toBe(7);
        });
    });

    // ─── getByWalletId ─────────────────────────────────────────────────

    describe('getByWalletId', () => {
        it('filters by wallet', async () => {
            await repo.save(makeTransaction({ walletId: 'w-1' }));
            await repo.save(makeTransaction({ walletId: 'w-1' }));
            await repo.save(makeTransaction({ walletId: 'w-2' }));

            const result = await repo.getByWalletId('w-1');
            expect(result).toHaveLength(2);
            result.forEach(t => expect(t.walletId).toBe('w-1'));
        });

        it('returns empty for unknown wallet', async () => {
            await repo.save(makeTransaction({ walletId: 'w-1' }));
            const result = await repo.getByWalletId('w-999');
            expect(result).toEqual([]);
        });
    });

    // ─── getByCategoryId ───────────────────────────────────────────────

    describe('getByCategoryId', () => {
        it('filters by category', async () => {
            await repo.save(makeTransaction({ categoryId: 'cat-food' }));
            await repo.save(makeTransaction({ categoryId: 'cat-transport' }));
            await repo.save(makeTransaction({ categoryId: 'cat-food' }));

            const result = await repo.getByCategoryId('cat-food');
            expect(result).toHaveLength(2);
        });
    });

    // ─── getByType ─────────────────────────────────────────────────────

    describe('getByType', () => {
        it('filters by transaction type', async () => {
            await repo.save(makeTransaction({ type: TransactionType.EXPENSE }));
            await repo.save(makeTransaction({ type: TransactionType.INCOME }));
            await repo.save(makeTransaction({ type: TransactionType.EXPENSE }));
            await repo.save(makeTransaction({ type: TransactionType.TRANSFER }));

            const expenses = await repo.getByType(TransactionType.EXPENSE);
            expect(expenses).toHaveLength(2);

            const incomes = await repo.getByType(TransactionType.INCOME);
            expect(incomes).toHaveLength(1);

            const transfers = await repo.getByType(TransactionType.TRANSFER);
            expect(transfers).toHaveLength(1);
        });
    });

    // ─── getByDateRange ────────────────────────────────────────────────

    describe('getByDateRange', () => {
        it('filters transactions within range (inclusive)', async () => {
            await repo.save(makeTransaction({ date: new Date('2026-03-01T00:00:00Z') }));
            await repo.save(makeTransaction({ date: new Date('2026-03-15T00:00:00Z') }));
            await repo.save(makeTransaction({ date: new Date('2026-03-31T00:00:00Z') }));
            await repo.save(makeTransaction({ date: new Date('2026-04-01T00:00:00Z') }));

            const result = await repo.getByDateRange(
                new Date('2026-03-01T00:00:00Z'),
                new Date('2026-03-31T23:59:59Z'),
            );
            expect(result).toHaveLength(3);
        });

        it('returns empty for range with no data', async () => {
            await repo.save(makeTransaction({ date: new Date('2026-03-15T00:00:00Z') }));

            const result = await repo.getByDateRange(
                new Date('2026-06-01T00:00:00Z'),
                new Date('2026-06-30T23:59:59Z'),
            );
            expect(result).toEqual([]);
        });
    });
});
