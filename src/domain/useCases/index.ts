/**
 * Domain Use Cases — Barrel Export
 */

export { createTransaction, type CreateTransactionInput } from './createTransaction';
export { createWallet } from './createWallet';
export { deleteCategory } from './deleteCategory';
export { deleteTransaction } from './deleteTransaction';
export { InsufficientFundsError } from './errors';
export { transferFunds, type TransferFundsInput } from './transferFunds';
export { verifyFinancialIntegrity } from './verifyFinancialIntegrity';
export type { EventBus, UseCaseDeps } from './types';

