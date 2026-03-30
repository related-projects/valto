/**
 * Export Service Tests
 *
 * Tests for generateCSV formatting and content.
 * PDF/sharing tests are skipped as they require native modules.
 */

import { TransactionType, type Transaction } from '../../domain/entities/Transaction';
import { WalletType, type Wallet } from '../../domain/entities/Wallet';
import { CategoryType, type Category } from '../../domain/entities/Category';
import { generateCSV } from '../services/export/TransactionExportService';

// ─── Fixtures ─────────────────────────────────────────────────────────

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
        amount: 50,
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
        const csv = generateCSV([], wallets, categories);
        expect(csv).toBe('date,type,amount,wallet,category,description');
    });

    it('generates correct CSV content', () => {
        const transactions = [
            makeTx({ id: 'tx-1', amount: 50, note: 'Lunch' }),
        ];
        const csv = generateCSV(transactions, wallets, categories);
        const lines = csv.split('\n');

        expect(lines).toHaveLength(2);
        expect(lines[0]).toBe('date,type,amount,wallet,category,description');
        expect(lines[1]).toBe('2026-02-15,expense,50.00,Cash,Food,Lunch');
    });

    it('resolves wallet and category names', () => {
        const transactions = [
            makeTx({ walletId: 'w-2', categoryId: 'cat-2', type: TransactionType.INCOME }),
        ];
        const csv = generateCSV(transactions, wallets, categories);
        const lines = csv.split('\n');

        expect(lines[1]).toContain('Bank Account');
        expect(lines[1]).toContain('Salary');
    });

    it('escapes commas in description', () => {
        const transactions = [
            makeTx({ note: 'Lunch, dinner, and drinks' }),
        ];
        const csv = generateCSV(transactions, wallets, categories);
        expect(csv).toContain('"Lunch, dinner, and drinks"');
    });

    it('escapes double quotes in description', () => {
        const transactions = [
            makeTx({ note: 'Buy "premium" plan' }),
        ];
        const csv = generateCSV(transactions, wallets, categories);
        expect(csv).toContain('"Buy ""premium"" plan"');
    });

    it('handles missing note gracefully', () => {
        const transactions = [
            makeTx({ note: undefined }),
        ];
        const csv = generateCSV(transactions, wallets, categories);
        const lines = csv.split('\n');
        // Last field should be empty
        expect(lines[1]).toMatch(/,$/);
    });

    it('handles multiple transactions', () => {
        const transactions = [
            makeTx({ id: 'tx-1', amount: 50 }),
            makeTx({ id: 'tx-2', amount: 100, date: new Date('2026-02-16') }),
            makeTx({ id: 'tx-3', amount: 200, date: new Date('2026-02-17') }),
        ];
        const csv = generateCSV(transactions, wallets, categories);
        const lines = csv.split('\n');
        expect(lines).toHaveLength(4); // header + 3 rows
    });

    it('falls back to ID when wallet name is unknown', () => {
        const transactions = [
            makeTx({ walletId: 'unknown-wallet' }),
        ];
        const csv = generateCSV(transactions, wallets, categories);
        expect(csv).toContain('unknown-wallet');
    });
});
