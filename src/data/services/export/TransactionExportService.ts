/**
 * Transaction Export Service
 *
 * Handles CSV export, PDF monthly report generation, and native sharing.
 *
 * Dependencies:
 * - expo-file-system: write temp files
 * - expo-print: HTML -> PDF conversion
 * - expo-sharing: native share sheet
 */

import * as FileSystem from 'expo-file-system/legacy';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import type { TFunction } from 'i18next';
import { TransactionType, type Transaction } from '../../../domain/entities/Transaction';
import type { Wallet } from '../../../domain/entities/Wallet';
import type { Category } from '../../../domain/entities/Category';
import { getCurrencyByCode, type CurrencyDefinition } from '../../../domain/constants/currencies';
import { loadSettings, type DateFormatPreference, type DecimalSeparator } from '../settingsService';
import i18n from '../../../localization/i18n';
import { formatAmount } from '../../../utils/formatAmount';
import { formatDate } from '../../../utils/formatDate';
import { centsToMajor } from '../../../utils/normalizeAmount';

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
 * Format an integer minor-unit amount as a machine-readable number for CSV:
 * dot decimal separator, no thousands grouping, no currency symbol, and exactly
 * `decimals` fraction digits (0 decimals -> no decimal point). Reuses the shared
 * minor->major scale helper so no scaling logic is duplicated here.
 */
function formatCsvAmount(amountMinor: number, decimals: number): string {
    return centsToMajor(amountMinor, decimals).toFixed(decimals);
}

/**
 * Generate a CSV string from transactions.
 * Resolves walletId/categoryId to human-readable names.
 * Amounts are emitted in `currency`'s minor-unit exponent (machine-readable),
 * with an ISO currency-code column so the amount's scale is self-describing.
 */
export function generateCSV(
    transactions: Transaction[],
    wallets: Wallet[],
    categories: Category[],
    currency: CurrencyDefinition,
): string {
    const walletNames = buildNameMap(wallets);
    const categoryNames = buildNameMap(categories);

    const header = 'date,type,amount,currency,wallet,category,description';

    const rows = transactions.map(tx => {
        const date = tx.date.toISOString().split('T')[0]; // YYYY-MM-DD
        const amount = formatCsvAmount(tx.amount, currency.decimals);
        const wallet = escapeCSV(walletNames.get(tx.walletId) ?? tx.walletId);
        const category = escapeCSV(categoryNames.get(tx.categoryId) ?? tx.categoryId);
        const description = escapeCSV(tx.note ?? '');
        return `${date},${tx.type},${amount},${currency.code},${wallet},${category},${description}`;
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
    const settings = await loadSettings();
    const currency = getCurrencyByCode(settings.currency);
    const csv = generateCSV(transactions, wallets, categories, currency);
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

/** Same keys the ExportScreen month selector shows, so the report names the month the user picked. */
const MONTH_KEYS = [
    'export.months.january', 'export.months.february', 'export.months.march',
    'export.months.april', 'export.months.may', 'export.months.june',
    'export.months.july', 'export.months.august', 'export.months.september',
    'export.months.october', 'export.months.november', 'export.months.december',
] as const;

const TYPE_KEYS: Record<TransactionType, string> = {
    [TransactionType.INCOME]: 'modals.addTransaction.income',
    [TransactionType.EXPENSE]: 'modals.addTransaction.expense',
    [TransactionType.TRANSFER]: 'modals.addTransaction.transfer',
};

/**
 * Generate an HTML string for a monthly PDF report.
 * Amounts render as the app displays them: `currency` symbol, the user's
 * decimal `separator`, and the currency's minor-unit `decimals`.
 * Exported for unit testing (pure string build, no native modules).
 *
 * Every label comes from `t`, fixed to the app language by the caller; a key an
 * incomplete bundle lacks falls back to English. The month name comes from the
 * bundle and row dates from the user's `dateFormat` read with local getters, so
 * nothing here reads the device locale or prints a UTC day. Verified by
 * src/data/__tests__/exportService.language.test.ts (T1 fr, T2 zh fallback,
 * T3 UTC+1 day shift).
 */
export function generateReportHTML(
    year: number,
    month: number,
    transactions: Transaction[],
    wallets: Wallet[],
    categories: Category[],
    currency: CurrencyDefinition,
    separator: DecimalSeparator,
    dateFormat: DateFormatPreference,
    t: TFunction,
): string {
    const walletNames = buildNameMap(wallets);
    const categoryNames = buildNameMap(categories);

    const period = `${t(MONTH_KEYS[month - 1])} ${year}`;

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
                    <td>${formatDate(tx.date, dateFormat)}</td>
                    <td>${t(TYPE_KEYS[tx.type])}</td>
                    <td style="color: ${color}; font-weight: 600;">${sign}${formatAmount(tx.amount, currency.symbol, separator, currency.decimals)}</td>
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
    <h1>${t('export.report.title', { period })}</h1>
    <p class="subtitle">${t('export.report.generatedBy')}</p>

    <div class="summary">
        <div class="stat stat-income">
            <div class="stat-label">${t('transactions.income')}</div>
            <div class="stat-value" style="color: #22c55e;">+${formatAmount(totalIncome, currency.symbol, separator, currency.decimals)}</div>
        </div>
        <div class="stat stat-expense">
            <div class="stat-label">${t('transactions.expenses')}</div>
            <div class="stat-value" style="color: #ef4444;">-${formatAmount(totalExpense, currency.symbol, separator, currency.decimals)}</div>
        </div>
        <div class="stat stat-net">
            <div class="stat-label">${t('reports.financialSummary.netBalance')}</div>
            <div class="stat-value" style="color: ${netColor};">${netBalance >= 0 ? '+' : ''}${formatAmount(netBalance, currency.symbol, separator, currency.decimals)}</div>
        </div>
    </div>

    <table>
        <thead>
            <tr>
                <th>${t('modals.addTransaction.date')}</th>
                <th>${t('modals.addTransaction.type')}</th>
                <th>${t('modals.addTransaction.amount')}</th>
                <th>${t('modals.addTransaction.wallet')}</th>
                <th>${t('modals.addTransaction.category')}</th>
                <th>${t('export.report.description')}</th>
            </tr>
        </thead>
        <tbody>
            ${rows || `<tr><td colspan="6" style="text-align:center; padding:16px; color:#999;">${t('reports.financialSummary.noActivity')}</td></tr>`}
        </tbody>
    </table>

    <div class="footer">${t('export.report.footer', { period })}</div>
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
    const settings = await loadSettings();
    const currency = getCurrencyByCode(settings.currency);
    // The persisted language is the one app/_layout.tsx hands to i18n at startup;
    // fixing `t` to it keeps the report off the device locale (exportService.language.test.ts).
    const t = i18n.getFixedT(settings.language);
    const html = generateReportHTML(
        year, month, transactions, wallets, categories, currency,
        settings.decimalSeparator, settings.dateFormat, t,
    );

    const { uri } = await Print.printToFileAsync({
        html,
        base64: false,
    });

    if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, {
            mimeType: 'application/pdf',
            dialogTitle: t('export.pdfTitle'),
            UTI: 'com.adobe.pdf',
        });
    } else {
        throw new Error('Sharing is not available on this device');
    }
}
