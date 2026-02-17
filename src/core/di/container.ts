/**
 * Dependency Injection Container
 * 
 * Centralized container for managing repository instances.
 * This provides a simple DI mechanism without external dependencies.
 * 
 * Architecture Note:
 * This container follows the Singleton pattern and provides lazy initialization
 * of repositories. It ensures that all parts of the app use the same repository
 * instances, maintaining data consistency.
 */

import { BudgetRepository } from '../../data/repositories/BudgetRepository';
import { CategoryRepository } from '../../data/repositories/CategoryRepository';
import { TransactionRepository } from '../../data/repositories/TransactionRepository';
import { WalletRepository } from '../../data/repositories/WalletRepository';
import { asyncStorageAdapter } from '../../data/storage';

/**
 * Container for all repository instances
 */
class DIContainer {
    private _transactionRepository: TransactionRepository | null = null;
    private _walletRepository: WalletRepository | null = null;
    private _categoryRepository: CategoryRepository | null = null;
    private _budgetRepository: BudgetRepository | null = null;

    /**
     * Get or create TransactionRepository instance
     */
    get transactionRepository(): TransactionRepository {
        if (!this._transactionRepository) {
            this._transactionRepository = new TransactionRepository(asyncStorageAdapter);
        }
        return this._transactionRepository;
    }

    /**
     * Get or create WalletRepository instance
     */
    get walletRepository(): WalletRepository {
        if (!this._walletRepository) {
            this._walletRepository = new WalletRepository(asyncStorageAdapter);
        }
        return this._walletRepository;
    }

    /**
     * Get or create CategoryRepository instance
     */
    get categoryRepository(): CategoryRepository {
        if (!this._categoryRepository) {
            this._categoryRepository = new CategoryRepository(asyncStorageAdapter);
        }
        return this._categoryRepository;
    }

    /**
     * Get or create BudgetRepository instance
     */
    get budgetRepository(): BudgetRepository {
        if (!this._budgetRepository) {
            this._budgetRepository = new BudgetRepository(asyncStorageAdapter);
        }
        return this._budgetRepository;
    }

    /**
     * Reset all repository instances (useful for testing)
     */
    reset(): void {
        this._transactionRepository = null;
        this._walletRepository = null;
        this._categoryRepository = null;
        this._budgetRepository = null;
    }
}

/**
 * Singleton instance of the DI container
 */
export const container = new DIContainer();

/**
 * Convenience getters for repositories
 */
export const getTransactionRepository = () => container.transactionRepository;
export const getWalletRepository = () => container.walletRepository;
export const getCategoryRepository = () => container.categoryRepository;
export const getBudgetRepository = () => container.budgetRepository;
