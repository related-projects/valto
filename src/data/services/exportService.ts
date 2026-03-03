/**
 * Export Service
 *
 * Provides CSV export of transaction data with proper formatting.
 * Uses expo-file-system for temp file creation and expo-sharing for sharing.
 */

import { File as ExpoFile, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import {
    getCategoryRepository,
    getTransactionRepository,
    getWalletRepository,
} from '../../core/di';
import { Category, Transaction, Wallet } from '../../domain/entities';

// ─── CSV Column Definition ────────────────────────────────────────────

const CSV_COLUMNS = ['Date', 'Type', 'Amount', 'Category', 'Wallet', 'Note'] as const;

// ─── Pure Formatting (testable) ───────────────────────────────────────

/**
 * Format a date to ISO date string (YYYY-MM-DD)
 */
export function formatDateForCSV(date: Date): string {
    const year = date.getUTCFullYear();
    const month = String(date.getUTCMonth() + 1).padStart(2, '0');
    const day = String(date.getUTCDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

/**
 * Format an amount with exactly 2 decimal places for CSV
 */
export function formatAmountForCSV(amountMinorUnits: number): string {
    return (amountMinorUnits / 100).toFixed(2);
}

/**
 * Escape a CSV field value (wrap in quotes if it contains commas, quotes, or newlines)
 */
export function escapeCSVField(value: string): string {
    if (value.includes(',') || value.includes('"') || value.includes('\n')) {
        return `"${value.replace(/"/g, '""')}"`;
    }
    return value;
}

/**
 * Pure function: format transactions into a CSV string.
 * Deterministic column order: Date, Type, Amount, Category, Wallet, Note
 */
export function formatTransactionsToCSV(
    transactions: Transaction[],
    categories: Category[],
    wallets: Wallet[],
): string {
    const categoryMap = new Map(categories.map(c => [c.id, c.name]));
    const walletMap = new Map(wallets.map(w => [w.id, w.name]));

    // Header row
    const header = CSV_COLUMNS.join(',');

    // Sort by date descending for readability
    const sorted = [...transactions].sort(
        (a, b) => b.date.getTime() - a.date.getTime(),
    );

    // Data rows
    const rows = sorted.map(t => {
        const fields = [
            formatDateForCSV(t.date),
            t.type,
            formatAmountForCSV(t.amount),
            escapeCSVField(categoryMap.get(t.categoryId) || 'Unknown'),
            escapeCSVField(walletMap.get(t.walletId) || 'Unknown'),
            escapeCSVField(t.note || ''),
        ];
        return fields.join(',');
    });

    return [header, ...rows].join('\n');
}

// ─── Service Function ─────────────────────────────────────────────────

/**
 * Export all transactions to a CSV file and open the share dialog.
 * Returns the CSV content string (useful for testing).
 */
export async function exportTransactionsToCSV(): Promise<string> {
    const [transactions, categories, wallets] = await Promise.all([
        getTransactionRepository().getAll(),
        getCategoryRepository().getAll(),
        getWalletRepository().getAll(),
    ]);

    const csv = formatTransactionsToCSV(transactions, categories, wallets);

    // Write to temp file
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `valto-transactions-${timestamp}.csv`;
    const file = new ExpoFile(Paths.cache, filename);

    file.write(csv);

    // Share the file
    if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(file.uri, {
            mimeType: 'text/csv',
            dialogTitle: 'Export Transactions',
            UTI: 'public.comma-separated-values-text',
        });
    }

    return csv;
}
