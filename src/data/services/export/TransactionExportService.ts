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
import { ledgerEffect } from '../../../domain/ledger/ledgerEffect';
import {
    TRANSFER_IN_CATEGORY_ID,
    TRANSFER_OUT_CATEGORY_ID,
    isTransferCategoryId,
} from '../../../domain/ledger/transferCategories';
import { loadSettings, type DateFormatPreference, type DecimalSeparator } from '../settingsService';
import i18n from '../../../localization/i18n';
import { formatAmount } from '../../../utils/formatAmount';
import { formatDate } from '../../../utils/formatDate';
import { MISSING_CATEGORY_LABEL_KEY } from '../../../utils/missingCategory';
import { centsToMajor } from '../../../utils/normalizeAmount';

// ─── CSV Export ───────────────────────────────────────────────────────

/**
 * Escape a CSV field value.
 * Wraps in double-quotes if the value contains commas, quotes, line feeds or
 * carriage returns (a lone CR ends the record for some readers).
 */
function escapeCSV(value: string): string {
    if (value.includes(',') || value.includes('"') || value.includes('\n') || value.includes('\r')) {
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
 * CSV dates, in the rows and in the file name: the device's local calendar day,
 * whatever the app date format setting. Stored dates are UTC instants, and the
 * UTC day of anything stored before 01:00 at UTC+1 (every recurring row) is the
 * previous one.
 */
const CSV_DATE_FORMAT: DateFormatPreference = 'YYYY-MM-DD';

/**
 * Generate a CSV string from transactions.
 * Resolves walletId/categoryId to human-readable names.
 * Amounts are emitted in `currency`'s minor-unit exponent (machine-readable),
 * with an ISO currency-code column so the amount's scale is self-describing.
 * Dates follow CSV_DATE_FORMAT. Verified by
 * src/data/__tests__/exportService.datesTransfersEscaping.test.ts (T1 local
 * day, T2 carriage return).
 */
export function generateCSV(
    transactions: Transaction[],
    wallets: Wallet[],
    categories: Category[],
    currency: CurrencyDefinition,
    t: TFunction,
): string {
    const walletNames = buildNameMap(wallets);
    const categoryNames = buildNameMap(categories);

    const header = 'date,type,amount,currency,wallet,category,description';

    const rows = transactions.map(tx => {
        const date = formatDate(tx.date, CSV_DATE_FORMAT);
        const amount = formatCsvAmount(tx.amount, currency.decimals);
        const wallet = escapeCSV(walletNames.get(tx.walletId) ?? tx.walletId);
        // A transfer leg carries a reserved id with no Category row, so it is
        // checked first: it is not a missing category and must not take that
        // label. It keeps its raw id, as this column's neighbour `tx.type` keeps
        // its raw enum - the CSV is the machine-readable export.
        const category = escapeCSV(
            isTransferCategoryId(tx.categoryId)
                ? tx.categoryId
                : categoryNames.get(tx.categoryId) ?? t(MISSING_CATEGORY_LABEL_KEY),
        );
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
    // Fixed to the persisted language, for the reason given in shareMonthlyPDF:
    // the export follows the app language, not the device locale.
    const t = i18n.getFixedT(settings.language);
    const csv = generateCSV(transactions, wallets, categories, currency, t);
    const filename = `valto_transactions_${formatDate(new Date(), CSV_DATE_FORMAT)}.csv`;
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

/** A transfer leg carries a reserved category id and no Category row, so it gets a label of its own. */
const TRANSFER_LEG_KEYS = new Map<string, string>([
    [TRANSFER_IN_CATEGORY_ID, 'export.report.transferIn'],
    [TRANSFER_OUT_CATEGORY_ID, 'export.report.transferOut'],
]);

/**
 * Escape user-entered text for HTML element content. `&` goes first so the
 * entities the other replacements write are not escaped again.
 */
function escapeHTML(value: string): string {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

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
 *
 * A row's sign and colour follow ledgerEffect, so a transfer's incoming leg
 * reads as a credit, and a transfer leg's category cell shows its own label.
 * Every user-entered value, and an id standing in for a missing name, is
 * HTML-escaped. Verified by
 * src/data/__tests__/exportService.datesTransfersEscaping.test.ts (T3 transfer
 * legs, T4 escaping).
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

            const credit = ledgerEffect(tx) > 0;
            const sign = credit ? '+' : '-';
            const color = credit ? '#22c55e' : '#ef4444';
            const legKey = TRANSFER_LEG_KEYS.get(tx.categoryId);
            const category = legKey
                ? t(legKey)
                : escapeHTML(categoryNames.get(tx.categoryId) ?? t(MISSING_CATEGORY_LABEL_KEY));
            return `
                <tr>
                    <td>${formatDate(tx.date, dateFormat)}</td>
                    <td>${t(TYPE_KEYS[tx.type])}</td>
                    <td style="color: ${color}; font-weight: 600;">${sign}${formatAmount(tx.amount, currency.symbol, separator, currency.decimals)}</td>
                    <td>${escapeHTML(walletNames.get(tx.walletId) ?? tx.walletId)}</td>
                    <td>${category}</td>
                    <td>${escapeHTML(tx.note ?? '')}</td>
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
