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
import { loadSettings } from '../data/services/settingsService';
import { periodBounds, toPeriodKey, toPeriodStartDay } from '../domain/period';

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
            // First and last moment of the period, local time (src/domain/period),
            // for the stored month start day - the one shareMonthlyPDF names the
            // report and its file with (C20).
            const startDay = toPeriodStartDay((await loadSettings()).monthStartDay);
            const { start: startDate, end: endDate } = periodBounds(
                toPeriodKey({ year, month }),
                startDay,
            );

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
