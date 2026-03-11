/**
 * Pagination Tests
 *
 * Tests for TransactionRepository.getTransactionsPage()
 * using InMemoryStorage for deterministic, fast execution.
 */

import { TransactionType, type Transaction } from '../../domain/entities/Transaction';
import { TransactionRepository } from '../../data/repositories/TransactionRepository';
import { InMemoryStorage } from '../../../tests/helpers/InMemoryStorage';

function makeTransaction(overrides: Partial<Transaction> = {}): Transaction {
    return {
        id: `tx-${Math.random().toString(36).slice(2, 8)}`,
        type: TransactionType.EXPENSE,
        amount: 1000,
        categoryId: 'cat-1',
        walletId: 'w-1',
        date: new Date('2026-01-15'),
        createdAt: new Date('2026-01-15'),
        ...overrides,
    };
}

describe('TransactionRepository.getTransactionsPage', () => {
    let storage: InMemoryStorage;
    let repo: TransactionRepository;

    beforeEach(() => {
        storage = new InMemoryStorage();
        repo = new TransactionRepository(storage);
    });

    it('returns empty result when no transactions exist', async () => {
        const result = await repo.getTransactionsPage(1, 10);
        expect(result.data).toEqual([]);
        expect(result.total).toBe(0);
        expect(result.hasMore).toBe(false);
        expect(result.page).toBe(1);
    });

    it('returns first page correctly', async () => {
        // Save 5 transactions
        for (let i = 0; i < 5; i++) {
            await repo.save(makeTransaction({
                id: `tx-${i}`,
                date: new Date(`2026-01-${10 + i}`),
            }));
        }

        const result = await repo.getTransactionsPage(1, 3);
        expect(result.data.length).toBe(3);
        expect(result.total).toBe(5);
        expect(result.hasMore).toBe(true);
        expect(result.page).toBe(1);
    });

    it('returns second page correctly', async () => {
        for (let i = 0; i < 5; i++) {
            await repo.save(makeTransaction({
                id: `tx-${i}`,
                date: new Date(`2026-01-${10 + i}`),
            }));
        }

        const result = await repo.getTransactionsPage(2, 3);
        expect(result.data.length).toBe(2);
        expect(result.total).toBe(5);
        expect(result.hasMore).toBe(false);
        expect(result.page).toBe(2);
    });

    it('returns sorted by date descending', async () => {
        await repo.save(makeTransaction({ id: 'tx-old', date: new Date('2026-01-01') }));
        await repo.save(makeTransaction({ id: 'tx-new', date: new Date('2026-03-01') }));
        await repo.save(makeTransaction({ id: 'tx-mid', date: new Date('2026-02-01') }));

        const result = await repo.getTransactionsPage(1, 10);
        expect(result.data[0].id).toBe('tx-new');
        expect(result.data[1].id).toBe('tx-mid');
        expect(result.data[2].id).toBe('tx-old');
    });

    it('handles page beyond available data', async () => {
        await repo.save(makeTransaction({ id: 'tx-1' }));

        const result = await repo.getTransactionsPage(5, 10);
        expect(result.data).toEqual([]);
        expect(result.hasMore).toBe(false);
    });

    it('handles limit of 1', async () => {
        await repo.save(makeTransaction({ id: 'tx-a', date: new Date('2026-01-01') }));
        await repo.save(makeTransaction({ id: 'tx-b', date: new Date('2026-02-01') }));

        const page1 = await repo.getTransactionsPage(1, 1);
        expect(page1.data.length).toBe(1);
        expect(page1.hasMore).toBe(true);

        const page2 = await repo.getTransactionsPage(2, 1);
        expect(page2.data.length).toBe(1);
        expect(page2.hasMore).toBe(false);
    });
});

describe('TransactionRepository.getCount', () => {
    let storage: InMemoryStorage;
    let repo: TransactionRepository;

    beforeEach(() => {
        storage = new InMemoryStorage();
        repo = new TransactionRepository(storage);
    });

    it('returns 0 when empty', async () => {
        expect(await repo.getCount()).toBe(0);
    });

    it('returns correct count after saves', async () => {
        await repo.save(makeTransaction({ id: 'tx-1' }));
        await repo.save(makeTransaction({ id: 'tx-2' }));
        expect(await repo.getCount()).toBe(2);
    });
});
