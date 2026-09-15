/**
 * useExport Hook
 *
 * Provides export functionality with loading state management.
 * Wraps TransactionExportService for use in React components.
 *
 * There is deliberately no `error` state. Both operations reject, and
 * ExportScreen catches and presents the failure itself
 * (src/screens/ExportScreen.tsx handleExportCSV / handleExportPDF). A second
 * copy of the same failure held in hook state had no reader.
 */

import { useCallback, useState } from 'react';
import { container } from '../core/di/container';
import { shareCSV, shareMonthlyPDF } from '../data/services/export/TransactionExportService';

export function useExport() {
    const [loading, setLoading] = useState(false);

    const transactionRepo = container.transactionRepository;
    const walletRepo = container.walletRepository;
    const categoryRepo = container.categoryRepository;

    const exportCSV = useCallback(async () => {
        setLoading(true);
        try {
            const [transactions, wallets, categories] = await Promise.all([
                transactionRepo.getAll(),
                walletRepo.getAll(),
                categoryRepo.getAll(),
            ]);
            await shareCSV(transactions, wallets, categories);
        } finally {
            setLoading(false);
        }
    }, [transactionRepo, walletRepo, categoryRepo]);

    const exportMonthlyPDF = useCallback(async (year: number, month: number) => {
        setLoading(true);
        try {
            const startDate = new Date(year, month - 1, 1);
            const endDate = new Date(year, month, 0, 23, 59, 59, 999); // Last moment of month

            const [transactions, wallets, categories] = await Promise.all([
                transactionRepo.getByDateRange(startDate, endDate),
                walletRepo.getAll(),
                categoryRepo.getAll(),
            ]);
            await shareMonthlyPDF(year, month, transactions, wallets, categories);
        } finally {
            setLoading(false);
        }
    }, [transactionRepo, walletRepo, categoryRepo]);

    return {
        exportCSV,
        exportMonthlyPDF,
        loading,
    };
}
