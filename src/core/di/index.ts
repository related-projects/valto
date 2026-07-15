/**
 * Dependency Injection Exports
 * 
 * Central export point for DI container and repository getters.
 */

export {
    container, getBudgetRepository, getCategoryRepository, getTransactionRepository,
    getUseCaseDeps, getWalletRepository
} from './container';

