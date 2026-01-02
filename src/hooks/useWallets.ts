/**
 * useWallets Hook
 * 
 * React hook for managing wallets with the repository layer.
 * Provides wallet operations and balance calculations for UI components.
 */

import { useCallback, useEffect, useState } from 'react';
import { getWalletRepository } from '../core/di';
import { Wallet, WalletType } from '../domain/entities';

interface UseWalletsResult {
    wallets: Wallet[];
    loading: boolean;
    error: string | null;
    getTotalBalance: () => number;
    getWalletsByType: (type: WalletType) => Wallet[];
    refreshWallets: () => Promise<void>;
}

/**
 * Hook for managing wallets
 */
export function useWallets(): UseWalletsResult {
    const [wallets, setWallets] = useState<Wallet[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const walletRepo = getWalletRepository();

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

    // Load wallets on mount
    useEffect(() => {
        loadWallets();
    }, [loadWallets]);

    return {
        wallets,
        loading,
        error,
        getTotalBalance,
        getWalletsByType,
        refreshWallets,
    };
}
