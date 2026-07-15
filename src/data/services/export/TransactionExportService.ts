/**
 * Transaction Export Service
 *
 * Handles CSV export, PDF monthly report generation, and native sharing.
 *
 * Dependencies:
 * - expo-file-system: write temp files
 * - expo-print: HTML → PDF conversion
 * - expo-sharing: native share sheet
 */

import * as FileSystem from 'expo-file-system/legacy';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import type { Transaction } from '../../../domain/entities/Transaction';
import type { Wallet } from '../../../domain/entities/Wallet';
import type { Category } from '../../../domain/entities/Category';

// ─── CSV Export ───────────────────────────────────────────────────────

/**
 * Escape a CSV field value.
 * Wraps in double-quotes if the value contains commas, quotes, or newlines.
 */
function escapeCSV(value: string): string {
    if (value.includes(',') || value.includes('"') || value.includes('\n')) {
        return `"${value.replace(/"/g, '""')}"`;
    }
    return value;
}

/**
 * Build a name lookup map from an array of entities with `id` and `name`.
 */
function buildNameMap(items: Array<{ id: string; name: string }>): Map<string, string> {
    const map = new Map<string, string>();
    for (const item of items) {
        map.set(item.id, item.name);
    }
    return map;
}

/**
 * Generate a CSV string from transactions.
 * Resolves walletId/categoryId to human-readable names.
 */
export function generateCSV(
    transactions: Transaction[],
    wallets: Wallet[],
    categories: Category[],
): string {
    const walletNames = buildNameMap(wallets);
    const categoryNames = buildNameMap(categories);

    const header = 'date,type,amount,wallet,category,description';

    const rows = transactions.map(tx => {
        const date = tx.date.toISOString().split('T')[0]; // YYYY-MM-DD
        const wallet = escapeCSV(walletNames.get(tx.walletId) ?? tx.walletId);
        const category = escapeCSV(categoryNames.get(tx.categoryId) ?? tx.categoryId);
        const description = escapeCSV(tx.note ?? '');
        return `${date},${tx.type},${tx.amount.toFixed(2)},${wallet},${category},${description}`;
    });

    return [header, ...rows].join('\n');
}

/**
 * Write CSV string to a temp file and share via native share sheet.
 */
export async function shareCSV(
    transactions: Transaction[],
    wallets: Wallet[],
    categories: Category[],
): Promise<void> {
    const csv = generateCSV(transactions, wallets, categories);
    const filename = `valto_transactions_${new Date().toISOString().split('T')[0]}.csv`;
    const fileUri = `${FileSystem.cacheDirectory}${filename}`;

    await FileSystem.writeAsStringAsync(fileUri, csv, {
        encoding: FileSystem.EncodingType.UTF8,
    });

    if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(fileUri, {
            mimeType: 'text/csv',
            dialogTitle: 'Export Transactions',
            UTI: 'public.comma-separated-values-text',
        });
    } else {
        throw new Error('Sharing is not available on this device');
    }
}

// ─── PDF Report ───────────────────────────────────────────────────────

/**
 * Generate an HTML string for a monthly PDF report.
 */
function generateReportHTML(
    year: number,
    month: number,
    transactions: Transaction[],
    wallets: Wallet[],
    categories: Category[],
): string {
    const walletNames = buildNameMap(wallets);
    const categoryNames = buildNameMap(categories);

    const monthName = new Date(year, month - 1, 1).toLocaleString('default', { month: 'long' });

    let totalIncome = 0;
    let totalExpense = 0;

    const rows = transactions
        .sort((a, b) => a.date.getTime() - b.date.getTime())
        .map(tx => {
            if (tx.type === 'income') totalIncome += tx.amount;
            else if (tx.type === 'expense') totalExpense += tx.amount;

            const sign = tx.type === 'income' ? '+' : '-';
            const color = tx.type === 'income' ? '#22c55e' : '#ef4444';
            return `
                <tr>
                    <td>${tx.date.toISOString().split('T')[0]}</td>
                    <td>${tx.type}</td>
                    <td style="color: ${color}; font-weight: 600;">${sign}${tx.amount.toFixed(2)}</td>
                    <td>${walletNames.get(tx.walletId) ?? tx.walletId}</td>
                    <td>${categoryNames.get(tx.categoryId) ?? tx.categoryId}</td>
                    <td>${tx.note ?? ''}</td>
                </tr>`;
        })
        .join('');

    const netBalance = totalIncome - totalExpense;
    const netColor = netBalance >= 0 ? '#22c55e' : '#ef4444';

    return `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: -apple-system, 'Helvetica Neue', Arial, sans-serif; color: #1a1a2e; padding: 32px; }
        h1 { font-size: 24px; color: #1a1a2e; margin-bottom: 4px; }
        .subtitle { font-size: 14px; color: #666; margin-bottom: 24px; }
        .summary { display: flex; gap: 16px; margin-bottom: 24px; }
        .stat {
            flex: 1; padding: 16px; border-radius: 12px; text-align: center;
        }
        .stat-income { background: #f0fdf4; border: 1px solid #bbf7d0; }
        .stat-expense { background: #fef2f2; border: 1px solid #fecaca; }
        .stat-net { background: #f8fafc; border: 1px solid #e2e8f0; }
        .stat-label { font-size: 12px; color: #666; text-transform: uppercase; letter-spacing: 0.5px; }
        .stat-value { font-size: 20px; font-weight: 700; margin-top: 4px; }
        table { width: 100%; border-collapse: collapse; font-size: 13px; }
        th { background: #f1f5f9; padding: 10px 8px; text-align: left; font-weight: 600; border-bottom: 2px solid #e2e8f0; }
        td { padding: 8px; border-bottom: 1px solid #f1f5f9; }
        tr:nth-child(even) td { background: #fafafa; }
        .footer { margin-top: 24px; font-size: 11px; color: #999; text-align: center; }
    </style>
</head>
<body>
    <h1>Monthly Report — ${monthName} ${year}</h1>
    <p class="subtitle">Generated by Valto</p>

    <div class="summary">
        <div class="stat stat-income">
            <div class="stat-label">Income</div>
            <div class="stat-value" style="color: #22c55e;">+${totalIncome.toFixed(2)}</div>
        </div>
        <div class="stat stat-expense">
            <div class="stat-label">Expenses</div>
            <div class="stat-value" style="color: #ef4444;">-${totalExpense.toFixed(2)}</div>
        </div>
        <div class="stat stat-net">
            <div class="stat-label">Net Balance</div>
            <div class="stat-value" style="color: ${netColor};">${netBalance >= 0 ? '+' : ''}${netBalance.toFixed(2)}</div>
        </div>
    </div>

    <table>
        <thead>
            <tr>
                <th>Date</th>
                <th>Type</th>
                <th>Amount</th>
                <th>Wallet</th>
                <th>Category</th>
                <th>Description</th>
            </tr>
        </thead>
        <tbody>
            ${rows || '<tr><td colspan="6" style="text-align:center; padding:16px; color:#999;">No transactions for this month</td></tr>'}
        </tbody>
    </table>

    <div class="footer">Valto Financial Report • ${monthName} ${year}</div>
</body>
</html>`;
}

/**
 * Generate and share a PDF monthly report.
 */
export async function shareMonthlyPDF(
    year: number,
    month: number,
    transactions: Transaction[],
    wallets: Wallet[],
    categories: Category[],
): Promise<void> {
    const html = generateReportHTML(year, month, transactions, wallets, categories);

    const { uri } = await Print.printToFileAsync({
        html,
        base64: false,
    });

    if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, {
            mimeType: 'application/pdf',
            dialogTitle: 'Monthly Report',
            UTI: 'com.adobe.pdf',
        });
    } else {
        throw new Error('Sharing is not available on this device');
    }
}
