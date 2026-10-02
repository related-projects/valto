import { BudgetRepository } from '../../data/repositories/BudgetRepository';
import { CategoryRepository } from '../../data/repositories/CategoryRepository';
import { RecurringTransactionRepository } from '../../data/repositories/RecurringTransactionRepository';
import { TransactionRepository } from '../../data/repositories/TransactionRepository';
import { WalletRepository } from '../../data/repositories/WalletRepository';
import { getDb, onDatabaseClosed } from '../../data/storage/sql/database';
import type { UseCaseDeps } from '../../domain/useCases/types';
import { dataEvents } from '../events/dataEvents';

/**
 * Container for all repository instances
 */
class DIContainer {
    private _transactionRepository: TransactionRepository | null = null;
    private _walletRepository: WalletRepository | null = null;
    private _categoryRepository: CategoryRepository | null = null;
    private _budgetRepository: BudgetRepository | null = null;
    private _recurringTransactionRepository: RecurringTransactionRepository | null = null;

    /**
     * Get or create TransactionRepository instance
     */
    get transactionRepository(): TransactionRepository {
        if (!this._transactionRepository) {
            this._transactionRepository = new TransactionRepository(getDb());
        }
        return this._transactionRepository;
    }

    /**
     * Get or create WalletRepository instance
     */
    get walletRepository(): WalletRepository {
        if (!this._walletRepository) {
            this._walletRepository = new WalletRepository(getDb());
        }
        return this._walletRepository;
    }

    /**
     * Get or create CategoryRepository instance
     */
    get categoryRepository(): CategoryRepository {
        if (!this._categoryRepository) {
            this._categoryRepository = new CategoryRepository(getDb());
        }
        return this._categoryRepository;
    }

    /**
     * Get or create BudgetRepository instance
     */
    get budgetRepository(): BudgetRepository {
        if (!this._budgetRepository) {
            this._budgetRepository = new BudgetRepository(getDb());
        }
        return this._budgetRepository;
    }

    /**
     * Get or create RecurringTransactionRepository instance
     */
    get recurringTransactionRepository(): RecurringTransactionRepository {
        if (!this._recurringTransactionRepository) {
            this._recurringTransactionRepository = new RecurringTransactionRepository(getDb());
        }
        return this._recurringTransactionRepository;
    }

    /**
     * Reset all repository instances. Runs whenever the database is closed
     * (see onDatabaseClosed below); tests call it too.
     */
    reset(): void {
        this._transactionRepository = null;
        this._walletRepository = null;
        this._categoryRepository = null;
        this._budgetRepository = null;
        this._recurringTransactionRepository = null;
    }
}

/**
 * Singleton instance of the DI container
 */
export const container = new DIContainer();

/**
 * Emptied whenever the database connection is closed (REGISTRE V-110, Owner
 * decision 3, pass 74). Every repository above is built over the connection
 * live when it was first asked for; once that connection is closed - the
 * corrupted-store reset closes it before the next boot opens another - none of
 * them may be handed out again. Hooked to closeDatabase itself, so every path
 * that closes the connection is covered. Verified by
 * containerResetOnClose.test.ts - "V-110" and "V-110 (recovery reset)".
 */
onDatabaseClosed(() => container.reset());

/**
 * Convenience getters for repositories
 */
export const getTransactionRepository = () => container.transactionRepository;
export const getWalletRepository = () => container.walletRepository;
export const getCategoryRepository = () => container.categoryRepository;
export const getBudgetRepository = () => container.budgetRepository;
export const getRecurringTransactionRepository = () => container.recurringTransactionRepository;

/**
 * Get the dependency bundle for domain use cases
 */
export const getUseCaseDeps = (): UseCaseDeps => ({
    transactionRepo: container.transactionRepository,
    walletRepo: container.walletRepository,
    categoryRepo: container.categoryRepository,
    budgetRepo: container.budgetRepository,
    recurringRepo: container.recurringTransactionRepository,
    eventBus: dataEvents,
    // Atomic boundary backed by the single shared SQLite connection.
    runInTransaction: (work) => getDb().runInTransaction(work),
});
