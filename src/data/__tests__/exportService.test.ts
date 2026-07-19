/**
 * Export Service Tests
 *
 * Tests for generateCSV and generateReportHTML formatting and content.
 * Amounts are stored as integer minor units and formatted per the active
 * currency's `decimals`. Native sharing (Print/Sharing/FileSystem) is not
 * exercised here; the pure string builders are tested directly.
 */

import { TransactionType, type Transaction } from '../../domain/entities/Transaction';
import { WalletType, type Wallet } from '../../domain/entities/Wallet';
import { CategoryType, type Category } from '../../domain/entities/Category';
import { getCurrencyByCode } from '../../domain/constants/currencies';
import { generateCSV, generateReportHTML } from '../services/export/TransactionExportService';

// ─── Fixtures ─────────────────────────────────────────────────────────

const usd = getCurrencyByCode('USD'); // decimals 2
const xof = getCurrencyByCode('XOF'); // decimals 0
const kwd = getCurrencyByCode('KWD'); // decimals 3

const wallets: Wallet[] = [
    { id: 'w-1', name: 'Cash', balance: 5000, type: WalletType.CASH, createdAt: new Date('2026-01-01') },
    { id: 'w-2', name: 'Bank Account', balance: 20000, type: WalletType.BANK, createdAt: new Date('2026-01-01') },
];

const categories: Category[] = [
    { id: 'cat-1', name: 'Food', type: CategoryType.EXPENSE },
    { id: 'cat-2', name: 'Salary', type: CategoryType.INCOME },
];

function makeTx(overrides: Partial<Transaction> = {}): Transaction {
    return {
        id: 'tx-1',
        type: TransactionType.EXPENSE,
        amount: 5000, // integer minor units (= 50.00 at 2 decimals)
        walletId: 'w-1',
        categoryId: 'cat-1',
        date: new Date('2026-02-15'),
        createdAt: new Date('2026-02-15'),
        ...overrides,
    };
}

// ─── Tests ────────────────────────────────────────────────────────────

describe('generateCSV', () => {
    it('produces correct header row', () => {
        const csv = generateCSV([], wallets, categories, usd);
        expect(csv).toBe('date,type,amount,currency,wallet,category,description');
    });

    it('generates correct CSV content', () => {
        const transactions = [
            makeTx({ id: 'tx-1', amount: 5000, note: 'Lunch' }),
        ];
        const csv = generateCSV(transactions, wallets, categories, usd);
        const lines = csv.split('\n');

        expect(lines).toHaveLength(2);
        expect(lines[0]).toBe('date,type,amount,currency,wallet,category,description');
        expect(lines[1]).toBe('2026-02-15,expense,50.00,USD,Cash,Food,Lunch');
    });

    it('resolves wallet and category names', () => {
        const transactions = [
            makeTx({ walletId: 'w-2', categoryId: 'cat-2', type: TransactionType.INCOME }),
        ];
        const csv = generateCSV(transactions, wallets, categories, usd);
        const lines = csv.split('\n');

        expect(lines[1]).toContain('Bank Account');
        expect(lines[1]).toContain('Salary');
    });

    it('escapes commas in description', () => {
        const transactions = [
            makeTx({ note: 'Lunch, dinner, and drinks' }),
        ];
        const csv = generateCSV(transactions, wallets, categories, usd);
        expect(csv).toContain('"Lunch, dinner, and drinks"');
    });

    it('escapes double quotes in description', () => {
        const transactions = [
            makeTx({ note: 'Buy "premium" plan' }),
        ];
        const csv = generateCSV(transactions, wallets, categories, usd);
        expect(csv).toContain('"Buy ""premium"" plan"');
    });

    it('handles missing note gracefully', () => {
        const transactions = [
            makeTx({ note: undefined }),
        ];
        const csv = generateCSV(transactions, wallets, categories, usd);
        const lines = csv.split('\n');
        // Last field (description) should be empty
        expect(lines[1]).toMatch(/,$/);
    });

    it('handles multiple transactions', () => {
        const transactions = [
            makeTx({ id: 'tx-1', amount: 5000 }),
            makeTx({ id: 'tx-2', amount: 10000, date: new Date('2026-02-16') }),
            makeTx({ id: 'tx-3', amount: 20000, date: new Date('2026-02-17') }),
        ];
        const csv = generateCSV(transactions, wallets, categories, usd);
        const lines = csv.split('\n');
        expect(lines).toHaveLength(4); // header + 3 rows
    });

    it('falls back to ID when wallet name is unknown', () => {
        const transactions = [
            makeTx({ walletId: 'unknown-wallet' }),
        ];
        const csv = generateCSV(transactions, wallets, categories, usd);
        expect(csv).toContain('unknown-wallet');
    });
});

describe('generateCSV — currency-aware machine-readable amounts', () => {
    // Amount is the 3rd column; currency code is the 4th.
    const amountField = (csv: string) => csv.split('\n')[1].split(',')[2];
    const currencyField = (csv: string) => csv.split('\n')[1].split(',')[3];

    // DoD-1: XOF has 0 decimals — an amount with no subunit must NOT gain ".00".
    // Against the old hardcoded `toFixed(2)` this produced "1000.00" (a failing assert).
    it('XOF (0 decimals): 1000 minor exports as "1000" with no decimal point', () => {
        const csv = generateCSV([makeTx({ amount: 1000 })], wallets, categories, xof);
        expect(amountField(csv)).toBe('1000');
        expect(currencyField(csv)).toBe('XOF');
        expect(csv).not.toContain('1000.00');
    });

    // DoD-2
    it('USD (2 decimals): 1250 minor exports as "12.50"', () => {
        const csv = generateCSV([makeTx({ amount: 1250 })], wallets, categories, usd);
        expect(amountField(csv)).toBe('12.50');
        expect(currencyField(csv)).toBe('USD');
    });

    it('KWD (3 decimals): 1500 minor exports as "1.500" (three fraction digits)', () => {
        const csv = generateCSV([makeTx({ amount: 1500 })], wallets, categories, kwd);
        expect(amountField(csv)).toBe('1.500');
        expect(currencyField(csv)).toBe('KWD');
    });

    // DoD-3: CSV amounts always use a dot decimal separator so the file survives
    // import into a comma-delimited spreadsheet, even when the user prefers a comma
    // separator. The comma preference genuinely flips the human PDF output below, but
    // it cannot reach the CSV: generateCSV takes no separator param by design.
    it('uses a dot decimal separator even when the user prefers comma (PDF flips, CSV does not)', () => {
        const tx = makeTx({ amount: 200050, type: TransactionType.INCOME }); // 2000.50

        // Human-facing PDF honours the comma preference…
        const html = generateReportHTML(2026, 2, [tx], wallets, categories, usd, 'comma');
        expect(html).toContain('2.000,50');

        // …but the machine-readable CSV stays dot-separated and import-safe.
        const csv = generateCSV([tx], wallets, categories, usd);
        const line = csv.split('\n')[1];
        expect(amountField(csv)).toBe('2000.50');
        expect(line).not.toContain('2000,50');
        expect(line.split(',')).toHaveLength(7); // amount is one field; no stray comma
    });
});

describe('generateReportHTML — currency-aware amounts', () => {
    // DoD-4: amounts render with the currency symbol, the user's separator, and the
    // currency's decimals.
    it('renders amounts with the currency symbol and decimals (USD)', () => {
        const income = makeTx({ id: 'i-1', amount: 1250, type: TransactionType.INCOME, walletId: 'w-2', categoryId: 'cat-2' });
        const expense = makeTx({ id: 'e-1', amount: 500, type: TransactionType.EXPENSE });
        const html = generateReportHTML(2026, 2, [income, expense], wallets, categories, usd, 'dot');

        expect(html).toContain(`+${usd.symbol}12.50`); // income line & income total
        expect(html).toContain(`-${usd.symbol}5.00`);  // expense line & expense total
    });

    it('honours the currency decimals for a 3-decimal currency (KWD)', () => {
        const html = generateReportHTML(
            2026, 2,
            [makeTx({ amount: 1500, type: TransactionType.INCOME })],
            wallets, categories, kwd, 'dot',
        );
        expect(html).toContain(`${kwd.symbol}1.500`);
    });

    it('applies the user decimal separator (comma)', () => {
        const html = generateReportHTML(
            2026, 2,
            [makeTx({ amount: 200050, type: TransactionType.INCOME })],
            wallets, categories, usd, 'comma',
        );
        expect(html).toContain(`${usd.symbol}2.000,50`);
    });

    // DoD-5: totals use the same exponent as the line items (no mixed scaling).
    it('totals share the line-item exponent', () => {
        const html = generateReportHTML(
            2026, 2,
            [
                makeTx({ id: 'i-1', amount: 1250, type: TransactionType.INCOME, walletId: 'w-2', categoryId: 'cat-2' }),
                makeTx({ id: 'e-1', amount: 500, type: TransactionType.EXPENSE }),
            ],
            wallets, categories, usd, 'dot',
        );
        // Income total 1250 → 12.50, Expense total 500 → 5.00, Net 750 → 7.50 — all 2-decimal.
        expect(html).toContain(`+${usd.symbol}12.50`);
        expect(html).toContain(`-${usd.symbol}5.00`);
        expect(html).toContain(`+${usd.symbol}7.50`);
    });
});
