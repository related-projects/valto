/**
 * useTransactions Hook
 * 
 * React hook for managing transactions with the repository layer.
 * Provides CRUD operations and loading states for UI components.
 */

import { useCallback, useEffect, useState } from 'react';
import { getTransactionRepository, getWalletRepository } from '../core/di';
import {
    CreateTransactionDTO,
    Transaction,
    TransactionType
} from '../domain/entities';

interface UseTransactionsResult {
    transactions: Transaction[];
    loading: boolean;
    error: string | null;
    createTransaction: (dto: CreateTransactionDTO) => Promise<Transaction>;
    deleteTransaction: (id: string) => Promise<void>;
    refreshTransactions: () => Promise<void>;
}

/**
 * Hook for managing transactions
 */
export function useTransactions(): UseTransactionsResult {
    const [transactions, setTransactions] = useState<Transaction[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const transactionRepo = getTransactionRepository();
    const walletRepo = getWalletRepository();

    /**
     * Load all transactions from repository
     */
    const loadTransactions = useCallback(async () => {
        try {
            setLoading(true);
            setError(null);
            const data = await transactionRepo.getAll();
            // Sort by date descending (newest first)
            const sorted = data.sort((a, b) => b.date.getTime() - a.date.getTime());
            setTransactions(sorted);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to load transactions');
            console.error('Failed to load transactions:', err);
        } finally {
            setLoading(false);
        }
    }, [transactionRepo]);

    /**
     * Create a new transaction and update wallet balance
     */
    const createTransaction = useCallback(async (dto: CreateTransactionDTO): Promise<Transaction> => {
        try {
            // Create the transaction
            const transaction = await transactionRepo.create(dto);

            // Update wallet balance
            const amount = dto.type === TransactionType.EXPENSE ? -dto.amount : dto.amount;
            await walletRepo.updateBalance(dto.walletId, amount);

            // Refresh transactions list
            await loadTransactions();

            return transaction;
        } catch (err) {
            const errorMessage = err instanceof Error ? err.message : 'Failed to create transaction';
            setError(errorMessage);
            throw new Error(errorMessage);
        }
    }, [transactionRepo, walletRepo, loadTransactions]);

    /**
     * Delete a transaction and revert wallet balance
     */
    const deleteTransaction = useCallback(async (id: string): Promise<void> => {
        try {
            // Get the transaction to revert balance
            const transaction = await transactionRepo.getById(id);

            if (transaction) {
                // Revert wallet balance (opposite of creation)
                const amount = transaction.type === TransactionType.EXPENSE ? transaction.amount : -transaction.amount;
                await walletRepo.updateBalance(transaction.walletId, amount);
            }

            // Delete the transaction
            await transactionRepo.delete(id);

            // Refresh transactions list
            await loadTransactions();
        } catch (err) {
            const errorMessage = err instanceof Error ? err.message : 'Failed to delete transaction';
            setError(errorMessage);
            throw new Error(errorMessage);
        }
    }, [transactionRepo, walletRepo, loadTransactions]);

    /**
     * Refresh transactions from repository
     */
    const refreshTransactions = useCallback(async () => {
        await loadTransactions();
    }, [loadTransactions]);

    // Load transactions on mount
    useEffect(() => {
        loadTransactions();
    }, [loadTransactions]);

    return {
        transactions,
        loading,
        error,
        createTransaction,
        deleteTransaction,
        refreshTransactions,
    };
}
