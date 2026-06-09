/**
 * Mock Repository Setup
 *
 * Pre-wired repository instances backed by InMemoryStorage
 * for quick test scaffolding. Each call returns fresh instances.
 */

import { InMemoryStorage } from '../../tests/helpers/InMemoryStorage';
import { BudgetRepository } from '../data/repositories/BudgetRepository';
import { CategoryRepository } from '../data/repositories/CategoryRepository';
import { RecurringTransactionRepository } from '../data/repositories/RecurringTransactionRepository';
import { TransactionRepository } from '../data/repositories/TransactionRepository';
import { WalletRepository } from '../data/repositories/WalletRepository';

export interface MockRepositoryBundle {
    storage: InMemoryStorage;
    walletRepo: WalletRepository;
    transactionRepo: TransactionRepository;
    categoryRepo: CategoryRepository;
    budgetRepo: BudgetRepository;
    recurringRepo: RecurringTransactionRepository;
    eventBus: {
        emit: jest.Mock;
        emitMultiple: jest.Mock;
        subscribe: jest.Mock;
    };
}

/**
 * Create a fresh set of repositories backed by InMemoryStorage.
 * Returns all repos + a mock event bus.
 */
export function createMockRepositories(): MockRepositoryBundle {
    const storage = new InMemoryStorage();
    return {
        storage,
        walletRepo: new WalletRepository(storage),
        transactionRepo: new TransactionRepository(storage),
        categoryRepo: new CategoryRepository(storage),
        budgetRepo: new BudgetRepository(storage),
        recurringRepo: new RecurringTransactionRepository(storage),
        eventBus: {
            emit: jest.fn(),
            emitMultiple: jest.fn(),
            subscribe: jest.fn(() => jest.fn()),
        },
    };
}
