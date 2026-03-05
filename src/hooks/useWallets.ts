/**
 * useWallets Hook
 * 
 * React hook for managing wallets with the repository layer.
 * Delegates business orchestration to domain use cases.
 * Retains: UI state, loading/error, event subscription, data queries.
 */

import { useCallback, useEffect, useState } from 'react';
import { getTransactionRepository, getUseCaseDeps, getWalletRepository } from '../core/di';
import { dataEvents } from '../core/events';
import { TransactionType, UpdateWalletDTO, Wallet, WalletType } from '../domain/entities';
import {
    createWallet as createWalletUC,
    transferFunds as transferFundsUC,
} from '../domain/useCases';

interface UseWalletsResult {
    wallets: Wallet[];
    loading: boolean;
    error: string | null;
    getTotalBalance: () => number;
    getWalletsByType: (type: WalletType) => Wallet[];
    refreshWallets: () => Promise<void>;
    createWallet: (dto: import('../domain/entities').CreateWalletDTO) => Promise<Wallet>;
    updateWallet: (dto: UpdateWalletDTO) => Promise<Wallet>;
    deleteWallet: (id: string) => Promise<void>;
    transferBetweenWallets: (fromId: string, toId: string, amount: number) => Promise<void>;
    hasTransactions: (walletId: string) => Promise<boolean>;
    verifyFinancialIntegrity: () => Promise<boolean>;
}

/**
 * Hook for managing wallets
 */
export function useWallets(): UseWalletsResult {
    const [wallets, setWallets] = useState<Wallet[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const walletRepo = getWalletRepository();
    const transactionRepo = getTransactionRepository();

    /**
     * Load all wallets from repository
     */
    const loadWallets = useCallback(async () => {
        try {
            setLoading(true);
            setError(null);
            const data = await walletRepo.getAll();
            setWallets(data);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to load wallets');
            console.error('Failed to load wallets:', err);
        } finally {
            setLoading(false);
        }
    }, [walletRepo]);

    /**
     * Calculate total balance across all wallets
     */
    const getTotalBalance = useCallback((): number => {
        return wallets.reduce((sum, wallet) => sum + wallet.balance, 0);
    }, [wallets]);

    /**
     * Get wallets filtered by type
     */
    const getWalletsByType = useCallback((type: WalletType): Wallet[] => {
        return wallets.filter(wallet => wallet.type === type);
    }, [wallets]);

    /**
     * Refresh wallets from repository
     */
    const refreshWallets = useCallback(async () => {
        await loadWallets();
    }, [loadWallets]);

    /**
     * Create a new wallet (delegates to use case)
     */
    const createWallet = useCallback(async (dto: import('../domain/entities').CreateWalletDTO): Promise<Wallet> => {
        try {
            const deps = getUseCaseDeps();
            const wallet = await createWalletUC(deps, dto);
            await loadWallets();
            return wallet;
        } catch (err) {
            const errorMessage = err instanceof Error ? err.message : 'Failed to create wallet';
            setError(errorMessage);
            throw new Error(errorMessage);
        }
    }, [loadWallets]);

    /**
     * Update an existing wallet
     */
    const updateWallet = useCallback(async (dto: UpdateWalletDTO): Promise<Wallet> => {
        try {
            // Validate name if provided
            if (dto.name !== undefined && dto.name.trim().length === 0) {
                throw new Error('Wallet name cannot be empty');
            }

            // Validate balance if provided
            if (dto.balance !== undefined && dto.balance < 0) {
                throw new Error('Balance cannot be negative');
            }

            const wallet = await walletRepo.updateFromDTO(dto);
            await loadWallets();

            // Emit wallet change event for other components
            dataEvents.emit('wallets');

            return wallet;
        } catch (err) {
            const errorMessage = err instanceof Error ? err.message : 'Failed to update wallet';
            setError(errorMessage);
            throw new Error(errorMessage);
        }
    }, [walletRepo, loadWallets]);

    /**
     * Check if wallet has any transactions
     */
    const hasTransactions = useCallback(async (walletId: string): Promise<boolean> => {
        try {
            const transactions = await transactionRepo.getByWalletId(walletId);
            return transactions.length > 0;
        } catch (err) {
            console.error('Failed to check wallet transactions:', err);
            return false;
        }
    }, [transactionRepo]);

    /**
     * Delete a wallet
     */
    const deleteWallet = useCallback(async (id: string): Promise<void> => {
        try {
            await walletRepo.delete(id);
            await loadWallets();

            // Emit wallet change event for other components
            dataEvents.emit('wallets');
        } catch (err) {
            const errorMessage = err instanceof Error ? err.message : 'Failed to delete wallet';
            setError(errorMessage);
            throw new Error(errorMessage);
        }
    }, [walletRepo, loadWallets]);

    /**
     * Transfer money between two wallets (delegates to use case)
     */
    const transferBetweenWallets = useCallback(async (
        fromId: string,
        toId: string,
        amount: number
    ): Promise<void> => {
        try {
            const deps = getUseCaseDeps();
            await transferFundsUC(deps, { fromWalletId: fromId, toWalletId: toId, amount });

            // Refresh local state
            await loadWallets();
        } catch (err) {
            const errorMessage = err instanceof Error ? err.message : 'Failed to transfer between wallets';
            setError(errorMessage);
            throw new Error(errorMessage);
        }
    }, [loadWallets]);

    /**
     * Dev-only validation function to sum all wallet balances 
     * and check if they equal (Total Income - Total Expenses).
     */
    const verifyFinancialIntegrity = useCallback(async (): Promise<boolean> => {
        try {
            const allWallets = await walletRepo.getAll();
            const allTransactions = await transactionRepo.getAll();

            const sumWallets = allWallets.reduce((acc, w) => acc + w.balance, 0);

            let calculatedBalance = 0;
            allTransactions.forEach(t => {
                if (t.type === TransactionType.INCOME) calculatedBalance += t.amount;
                if (t.type === TransactionType.EXPENSE) calculatedBalance -= t.amount;
            });

            if (sumWallets !== calculatedBalance) {
                console.warn(`[Financial Integrity] Mismatch! Real Wallets sum to ${sumWallets}, but Transactions state implies ${calculatedBalance}`);
                return false;
            }

            return true;
        } catch (err) {
            console.error('Failed financial integrity check', err);
            return false;
        }
    }, [walletRepo, transactionRepo]);

    // Load wallets on mount and subscribe to wallet events
    useEffect(() => {
        loadWallets();

        // Subscribe to wallet change events from other components
        const unsubscribe = dataEvents.subscribe('wallets', () => {
            loadWallets();
        });

        return unsubscribe;
    }, [loadWallets]);

    return {
        wallets,
        loading,
        error,
        getTotalBalance,
        getWalletsByType,
        refreshWallets,
        createWallet,
        updateWallet,
        deleteWallet,
        transferBetweenWallets,
        hasTransactions,
        verifyFinancialIntegrity,
    };
}
