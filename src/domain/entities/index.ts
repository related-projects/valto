/**
 * Domain Entities Export
 * 
 * Central export point for all domain entities, types, and utilities.
 * This follows the Clean Architecture principle of keeping domain logic
 * independent from infrastructure and UI concerns.
 */

// Transaction exports
export {
    TransactionType, deserializeTransaction, serializeTransaction, type CreateTransactionDTO, type SerializableTransaction, type Transaction, type UpdateTransactionDTO
} from './Transaction';

// Wallet exports
export {
    WalletType, deserializeWallet, serializeWallet, validateWalletBalance, type CreateWalletDTO, type SerializableWallet, type UpdateWalletDTO, type Wallet
} from './Wallet';

// Category exports
export {
    CategoryType, deserializeCategory, serializeCategory, type Category,
    type CreateCategoryDTO, type SerializableCategory, type UpdateCategoryDTO
} from './Category';

// Budget exports
export {
    deserializeBudget, getCurrentMonth, isValidBudgetMonth, serializeBudget,
    type Budget, type CreateBudgetDTO, type SerializableBudget, type UpdateBudgetDTO
} from './Budget';

