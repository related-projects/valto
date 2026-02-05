/**
 * useWallets Hook
 * 
 * React hook for managing wallets with the repository layer.
 * Provides wallet CRUD operations, transfers, and balance calculations for UI components.
 * Subscribes to wallet data events for cross-component reactivity.
 */

import { useCallback, useEffect, useState } from 'react';
import { getTransactionRepository, getWalletRepository } from '../core/di';
import { dataEvents } from '../core/events';
import { CreateWalletDTO, UpdateWalletDTO, Wallet, WalletType } from '../domain/entities';

interface UseWalletsResult {
    wallets: Wallet[];
    loading: boolean;
    error: string | null;
    getTotalBalance: () => number;
    getWalletsByType: (type: WalletType) => Wallet[];
    refreshWallets: () => Promise<void>;
    createWallet: (dto: CreateWalletDTO) => Promise<Wallet>;
    updateWallet: (dto: UpdateWalletDTO) => Promise<Wallet>;
    deleteWallet: (id: string) => Promise<void>;
    transferBetweenWallets: (fromId: string, toId: string, amount: number) => Promise<void>;
    hasTransactions: (walletId: string) => Promise<boolean>;
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
     * Create a new wallet
     */
    const createWallet = useCallback(async (dto: CreateWalletDTO): Promise<Wallet> => {
        try {
            // Validate name
            if (!dto.name || dto.name.trim().length === 0) {
                throw new Error('Wallet name is required');
            }

            // Validate initial balance
            if (dto.balance < 0) {
                throw new Error('Initial balance must be 0 or greater');
            }

            const wallet = await walletRepo.create(dto);
            await loadWallets();

            // Emit wallet change event for other components
            dataEvents.emit('wallets');

            return wallet;
        } catch (err) {
            const errorMessage = err instanceof Error ? err.message : 'Failed to create wallet';
            setError(errorMessage);
            throw new Error(errorMessage);
        }
    }, [walletRepo, loadWallets]);

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
     * Transfer money between two wallets
     * Updates both wallet balances atomically
     */
    const transferBetweenWallets = useCallback(async (
        fromId: string,
        toId: string,
        amount: number
    ): Promise<void> => {
        try {
            // Validate amount
            if (amount <= 0) {
                throw new Error('Transfer amount must be greater than 0');
            }

            // Validate source and destination are different
            if (fromId === toId) {
                throw new Error('Source and destination wallets must be different');
            }

            // Get source wallet to check balance
            const sourceWallet = await walletRepo.getById(fromId);
            if (!sourceWallet) {
                throw new Error('Source wallet not found');
            }

            // Check if source has sufficient balance
            if (sourceWallet.balance < amount) {
                throw new Error('Insufficient balance in source wallet');
            }

            // Get destination wallet to verify it exists
            const destWallet = await walletRepo.getById(toId);
            if (!destWallet) {
                throw new Error('Destination wallet not found');
            }

            // Perform atomic updates: subtract from source, add to destination
            await walletRepo.updateBalance(fromId, -amount);
            await walletRepo.updateBalance(toId, amount);

            // Refresh wallets state
            await loadWallets();

            // Emit wallet change event for other components
            dataEvents.emit('wallets');
        } catch (err) {
            const errorMessage = err instanceof Error ? err.message : 'Failed to transfer between wallets';
            setError(errorMessage);
            throw new Error(errorMessage);
        }
    }, [walletRepo, loadWallets]);

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
    };
}

