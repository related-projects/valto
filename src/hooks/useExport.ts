/**
 * useExport Hook
 *
 * Provides export functionality with loading/error state management.
 * Wraps TransactionExportService for use in React components.
 */

import { useCallback, useState } from 'react';
import { container } from '../core/di/container';
import { shareCSV, shareMonthlyPDF } from '../data/services/export/TransactionExportService';

export function useExport() {
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const transactionRepo = container.transactionRepository;
    const walletRepo = container.walletRepository;
    const categoryRepo = container.categoryRepository;

    const exportCSV = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const [transactions, wallets, categories] = await Promise.all([
                transactionRepo.getAll(),
                walletRepo.getAll(),
                categoryRepo.getAll(),
            ]);
            await shareCSV(transactions, wallets, categories);
        } catch (err) {
            const msg = err instanceof Error ? err.message : 'CSV export failed';
            setError(msg);
            throw err;
        } finally {
            setLoading(false);
        }
    }, [transactionRepo, walletRepo, categoryRepo]);

    const exportMonthlyPDF = useCallback(async (year: number, month: number) => {
        setLoading(true);
        setError(null);
        try {
            const startDate = new Date(year, month - 1, 1);
            const endDate = new Date(year, month, 0, 23, 59, 59, 999); // Last moment of month

            const [transactions, wallets, categories] = await Promise.all([
                transactionRepo.getByDateRange(startDate, endDate),
                walletRepo.getAll(),
                categoryRepo.getAll(),
            ]);
            await shareMonthlyPDF(year, month, transactions, wallets, categories);
        } catch (err) {
            const msg = err instanceof Error ? err.message : 'PDF export failed';
            setError(msg);
            throw err;
        } finally {
            setLoading(false);
        }
    }, [transactionRepo, walletRepo, categoryRepo]);

    return {
        exportCSV,
        exportMonthlyPDF,
        loading,
        error,
    };
}
