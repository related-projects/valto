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
import { UpdateWalletDTO, Wallet, WalletType } from '../domain/entities';
import {
    createWallet as createWalletUC,
    deleteWallet as deleteWalletUC,
    transferFunds as transferFundsUC,
    type TransferFundsInput,
} from '../domain/useCases';

/** What a transfer may carry besides its wallets and amount (REGISTRE V-129). */
type TransferOptions = Pick<TransferFundsInput, 'date' | 'note'>;

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
    transferBetweenWallets: (fromId: string, toId: string, amount: number, options?: TransferOptions) => Promise<void>;
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
     * Create a new wallet (delegates to use case)
     */
    const createWallet = useCallback(async (dto: import('../domain/entities').CreateWalletDTO): Promise<Wallet> => {
        try {
            const deps = getUseCaseDeps();
            const wallet = await createWalletUC(deps, dto);
            await loadWallets();
            return wallet;
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to create wallet');
            // Rethrow the ORIGINAL error. A hook never constructs an Error from
            // an Error it caught: doing so destroys `instanceof` before the UI
            // can branch on it. See useWallets.test.ts
            // 'createWallet preserves the typed error class'.
            throw err;
        }
    }, [loadWallets]);

    /**
     * Update an existing wallet
     */
    const updateWallet = useCallback(async (dto: UpdateWalletDTO): Promise<Wallet> => {
        try {
            // No validation here. The empty-name rule is validateWallet
            // (src/domain/validators/WalletValidator.ts), and the negative-balance
            // rule is validateWalletBalance (src/domain/entities/Wallet.ts), which
            // permits overdraft on bank and savings wallets. Both run inside
            // walletRepo.updateFromDTO. A copy in this hook could only disagree
            // with them, and the copy that used to sit here did: it refused a
            // negative balance for every wallet type.
            //
            // Through the runner (REGISTRE V-109): an edit made while another
            // transaction is open waits for it to end instead of landing inside
            // it and being erased by its rollback. Verified by
            // writesThroughRunner.test.ts - "V-109 c5".
            const wallet = await getUseCaseDeps().runInTransaction(() => walletRepo.updateFromDTO(dto));
            await loadWallets();

            // Emit wallet change event for other components
            dataEvents.emit('wallets');

            return wallet;
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to update wallet');
            // Rethrow the ORIGINAL error - see createWallet above.
            throw err;
        }
    }, [walletRepo, loadWallets]);

    /**
     * Check if wallet has any transactions.
     *
     * A lookup that fails answers true: "may have transactions". The delete
     * dialog is chosen from this answer, and false would tell the user the
     * wallet has none when nobody knows (pass 101, neighbour a, Owner decisions
     * 24/11, decision 2); true gives the cautious "Delete Anyway" warning.
     */
    const hasTransactions = useCallback(async (walletId: string): Promise<boolean> => {
        try {
            const transactions = await transactionRepo.getByWalletId(walletId);
            return transactions.length > 0;
        } catch (err) {
            console.error('Failed to check wallet transactions:', err);
            return true;
        }
    }, [transactionRepo]);

    /**
     * Delete a wallet (delegates to use case)
     *
     * The use case owns the refusal to delete the last wallet, and emits the
     * 'wallets' event on success.
     */
    const deleteWallet = useCallback(async (id: string): Promise<void> => {
        try {
            const deps = getUseCaseDeps();
            await deleteWalletUC(deps, id);
            await loadWallets();
        } catch (err) {
            const errorMessage = err instanceof Error ? err.message : 'Failed to delete wallet';
            setError(errorMessage);
            // Rethrow the ORIGINAL error so typed domain errors (e.g.
            // LastWalletError) survive to the UI for localized handling.
            throw err;
        }
    }, [loadWallets]);

    /**
     * Transfer money between two wallets (delegates to use case)
     *
     * `options` carries the date and note the user entered; without them the
     * use case records the present instant and the fixed notes.
     */
    const transferBetweenWallets = useCallback(async (
        fromId: string,
        toId: string,
        amount: number,
        options?: TransferOptions,
    ): Promise<void> => {
        try {
            const deps = getUseCaseDeps();
            await transferFundsUC(deps, {
                fromWalletId: fromId,
                toWalletId: toId,
                amount,
                date: options?.date,
                note: options?.note,
            });

            // Refresh local state
            await loadWallets();
        } catch (err) {
            const errorMessage = err instanceof Error ? err.message : 'Failed to transfer between wallets';
            setError(errorMessage);
            // Rethrow the ORIGINAL error so typed domain errors (e.g.
            // InsufficientFundsError) survive to the UI for localized handling.
            throw err;
        }
    }, [loadWallets]);

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
