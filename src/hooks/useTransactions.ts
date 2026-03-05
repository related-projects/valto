/**
 * useTransactions Hook
 * 
 * React hook for managing transactions with the repository layer.
 * Delegates business orchestration to domain use cases.
 * Retains: UI state, loading/error, event subscription, data refresh.
 */

import { useCallback, useEffect, useState } from 'react';
import { getTransactionRepository, getUseCaseDeps } from '../core/di';
import { dataEvents } from '../core/events';
import { CreateTransactionDTO, Transaction } from '../domain/entities';
import {
    createTransaction as createTransactionUC,
    deleteTransaction as deleteTransactionUC,
} from '../domain/useCases';

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
     * Create a new transaction (delegates to use case)
     */
    const createTransaction = useCallback(async (dto: CreateTransactionDTO): Promise<Transaction> => {
        try {
            const deps = getUseCaseDeps();
            const transaction = await createTransactionUC(deps, dto);

            // Refresh local state
            await loadTransactions();

            return transaction;
        } catch (err) {
            const errorMessage = err instanceof Error ? err.message : 'Failed to create transaction';
            setError(errorMessage);
            throw new Error(errorMessage);
        }
    }, [loadTransactions]);

    /**
     * Delete a transaction (delegates to use case)
     */
    const deleteTransaction = useCallback(async (id: string): Promise<void> => {
        try {
            const deps = getUseCaseDeps();
            await deleteTransactionUC(deps, id);

            // Refresh local state
            await loadTransactions();
        } catch (err) {
            const errorMessage = err instanceof Error ? err.message : 'Failed to delete transaction';
            setError(errorMessage);
            throw new Error(errorMessage);
        }
    }, [loadTransactions]);

    /**
     * Refresh transactions from repository
     */
    const refreshTransactions = useCallback(async () => {
        await loadTransactions();
    }, [loadTransactions]);

    // Load transactions on mount and subscribe to events
    useEffect(() => {
        loadTransactions();

        // Subscribe to transaction change events from other components
        const unsubscribe = dataEvents.subscribe('transactions', () => {
            loadTransactions();
        });

        return unsubscribe;
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
