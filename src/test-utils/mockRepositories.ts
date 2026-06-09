/**
 * Mock Repository Setup
 *
 * Pre-wired repository instances backed by an in-memory SQLite database
 * (createTestDb) for quick test scaffolding. Each call returns fresh instances
 * sharing one connection, plus a `runInTransaction` bound to that connection.
 */

import { createTestDb } from '../../tests/helpers/createTestDb';
import { BudgetRepository } from '../data/repositories/BudgetRepository';
import { CategoryRepository } from '../data/repositories/CategoryRepository';
import { RecurringTransactionRepository } from '../data/repositories/RecurringTransactionRepository';
import { TransactionRepository } from '../data/repositories/TransactionRepository';
import { WalletRepository } from '../data/repositories/WalletRepository';
import type { SqlDatabase } from '../data/storage/sql/SqlDatabase';
import type { RunInTransaction } from '../domain/useCases/types';

export interface MockRepositoryBundle {
    db: SqlDatabase;
    walletRepo: WalletRepository;
    transactionRepo: TransactionRepository;
    categoryRepo: CategoryRepository;
    budgetRepo: BudgetRepository;
    recurringRepo: RecurringTransactionRepository;
    runInTransaction: RunInTransaction;
    eventBus: {
        emit: jest.Mock;
        emitMultiple: jest.Mock;
        subscribe: jest.Mock;
    };
}

/**
 * Create a fresh set of repositories backed by an in-memory SQLite database.
 * Returns all repos + a mock event bus + the transaction runner.
 */
export async function createMockRepositories(): Promise<MockRepositoryBundle> {
    const db = await createTestDb();
    return {
        db,
        walletRepo: new WalletRepository(db),
        transactionRepo: new TransactionRepository(db),
        categoryRepo: new CategoryRepository(db),
        budgetRepo: new BudgetRepository(db),
        recurringRepo: new RecurringTransactionRepository(db),
        runInTransaction: (work) => db.runInTransaction(work),
        eventBus: {
            emit: jest.fn(),
            emitMultiple: jest.fn(),
            subscribe: jest.fn(() => jest.fn()),
        },
    };
}
