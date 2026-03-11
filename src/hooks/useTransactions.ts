/**
 * useTransactions Hook
 * 
 * React hook for managing transactions with the repository layer.
 * Delegates business orchestration to domain use cases.
 * Retains: UI state, loading/error, event subscription, data refresh.
 * 
 * Supports two modes:
 * - Full load: getAll() — used by dashboard and consumers needing full dataset
 * - Paginated: loadNextPage() — used by TransactionsScreen for lazy loading
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { getTransactionRepository, getUseCaseDeps } from '../core/di';
import { dataEvents } from '../core/events';
import { CreateTransactionDTO, Transaction } from '../domain/entities';
import {
    createTransaction as createTransactionUC,
    deleteTransaction as deleteTransactionUC,
} from '../domain/useCases';

const PAGE_SIZE = 20;

interface UseTransactionsResult {
    transactions: Transaction[];
    loading: boolean;
    error: string | null;
    createTransaction: (dto: CreateTransactionDTO) => Promise<Transaction>;
    deleteTransaction: (id: string) => Promise<void>;
    refreshTransactions: () => Promise<void>;
    /** Paginated loading — appends next page */
    loadNextPage: () => Promise<void>;
    /** Whether more pages are available */
    hasMore: boolean;
    /** Whether a page load is in progress */
    loadingMore: boolean;
}

/**
 * Hook for managing transactions
 */
export function useTransactions(): UseTransactionsResult {
    const [transactions, setTransactions] = useState<Transaction[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [hasMore, setHasMore] = useState(true);
    const [loadingMore, setLoadingMore] = useState(false);
    const pageRef = useRef(1);

    const transactionRepo = getTransactionRepository();

    /**
     * Load all transactions from repository (full load)
     */
    const loadTransactions = useCallback(async () => {
        try {
            setLoading(true);
            setError(null);
            const data = await transactionRepo.getAll();
            // Sort by date descending (newest first)
            const sorted = data.sort((a, b) => b.date.getTime() - a.date.getTime());
            setTransactions(sorted);
            // Reset pagination state on full reload
            pageRef.current = Math.ceil(sorted.length / PAGE_SIZE) || 1;
            setHasMore(false); // Full load means we have everything
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to load transactions');
            console.error('Failed to load transactions:', err);
        } finally {
            setLoading(false);
        }
    }, [transactionRepo]);

    /**
     * Load the next page of transactions (paginated / lazy loading)
     */
    const loadNextPage = useCallback(async () => {
        if (loadingMore || !hasMore) return;

        try {
            setLoadingMore(true);
            const nextPage = pageRef.current + 1;
            const result = await transactionRepo.getTransactionsPage(nextPage, PAGE_SIZE);

            setTransactions(prev => {
                // Deduplicate — merge without re-adding existing ids
                const existingIds = new Set(prev.map(t => t.id));
                const newItems = result.data.filter(t => !existingIds.has(t.id));
                return [...prev, ...newItems];
            });

            pageRef.current = nextPage;
            setHasMore(result.hasMore);
        } catch (err) {
            console.error('Failed to load next page:', err);
        } finally {
            setLoadingMore(false);
        }
    }, [transactionRepo, loadingMore, hasMore]);

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
        loadNextPage,
        hasMore,
        loadingMore,
    };
}
