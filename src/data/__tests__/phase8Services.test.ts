/**
 * Phase 8 Services Tests
 *
 * Tests for CSV export, backup/restore, category merge, and reset.
 * Uses in-memory storage mock via the existing test setup.
 */

import {
    BackupSnapshot,
    validateSnapshot,
} from '../../data/services/backupService';
import {
    escapeCSVField,
    formatAmountForCSV,
    formatDateForCSV,
    formatTransactionsToCSV,
} from '../../data/services/exportService';
import { CategoryType, TransactionType } from '../../domain/entities';

// ─── CSV Export Tests ─────────────────────────────────────────────────

describe('CSV Export', () => {
    describe('formatDateForCSV', () => {
        it('formats date to YYYY-MM-DD', () => {
            expect(formatDateForCSV(new Date('2026-03-15T10:30:00Z'))).toBe('2026-03-15');
        });

        it('pads single-digit months and days', () => {
            expect(formatDateForCSV(new Date('2026-01-05T00:00:00Z'))).toBe('2026-01-05');
        });
    });

    describe('formatAmountForCSV', () => {
        it('converts minor units to decimal with 2 places', () => {
            expect(formatAmountForCSV(123456)).toBe('1234.56');
        });

        it('handles zero', () => {
            expect(formatAmountForCSV(0)).toBe('0.00');
        });

        it('handles small amounts', () => {
            expect(formatAmountForCSV(99)).toBe('0.99');
        });
    });

    describe('escapeCSVField', () => {
        it('returns plain string unchanged', () => {
            expect(escapeCSVField('hello')).toBe('hello');
        });

        it('wraps string with commas in quotes', () => {
            expect(escapeCSVField('hello, world')).toBe('"hello, world"');
        });

        it('escapes quotes inside the string', () => {
            expect(escapeCSVField('say "hello"')).toBe('"say ""hello"""');
        });

        it('handles newlines', () => {
            expect(escapeCSVField('line1\nline2')).toBe('"line1\nline2"');
        });
    });

    describe('formatTransactionsToCSV', () => {
        it('produces correct header and data rows', () => {
            const transactions = [
                {
                    id: 't1',
                    type: TransactionType.EXPENSE,
                    amount: 150000,
                    categoryId: 'c1',
                    walletId: 'w1',
                    date: new Date('2026-03-10T00:00:00Z'),
                    note: 'Grocery shopping',
                    createdAt: new Date(),
                },
            ];
            const categories = [{ id: 'c1', name: 'Food', type: CategoryType.EXPENSE, icon: '🍕', color: '#FF0000' }];
            const wallets = [{ id: 'w1', name: 'Cash', balance: 0, type: 'cash' as any, createdAt: new Date() }];

            const csv = formatTransactionsToCSV(transactions, categories, wallets);
            const lines = csv.split('\n');

            expect(lines[0]).toBe('Date,Type,Amount,Category,Wallet,Note');
            expect(lines[1]).toBe('2026-03-10,expense,1500.00,Food,Cash,Grocery shopping');
        });

        it('handles empty transactions', () => {
            const csv = formatTransactionsToCSV([], [], []);
            expect(csv).toBe('Date,Type,Amount,Category,Wallet,Note');
        });

        it('sorts by date descending', () => {
            const transactions = [
                {
                    id: 't1',
                    type: TransactionType.EXPENSE,
                    amount: 10000,
                    categoryId: 'c1',
                    walletId: 'w1',
                    date: new Date('2026-01-01T00:00:00Z'),
                    createdAt: new Date(),
                },
                {
                    id: 't2',
                    type: TransactionType.INCOME,
                    amount: 20000,
                    categoryId: 'c1',
                    walletId: 'w1',
                    date: new Date('2026-03-01T00:00:00Z'),
                    createdAt: new Date(),
                },
            ];
            const categories = [{ id: 'c1', name: 'Test', type: CategoryType.EXPENSE, icon: undefined, color: undefined }];
            const wallets = [{ id: 'w1', name: 'Wallet', balance: 0, type: 'bank' as any, createdAt: new Date() }];

            const csv = formatTransactionsToCSV(transactions, categories, wallets);
            const lines = csv.split('\n');

            // Most recent first
            expect(lines[1]).toContain('2026-03-01');
            expect(lines[2]).toContain('2026-01-01');
        });

        it('escapes category names with special characters', () => {
            const transactions = [
                {
                    id: 't1',
                    type: TransactionType.EXPENSE,
                    amount: 10000,
                    categoryId: 'c1',
                    walletId: 'w1',
                    date: new Date('2026-01-01T00:00:00Z'),
                    createdAt: new Date(),
                },
            ];
            const categories = [{ id: 'c1', name: 'Food, Drink', type: CategoryType.EXPENSE }];
            const wallets = [{ id: 'w1', name: 'My Wallet', balance: 0, type: 'cash' as any, createdAt: new Date() }];

            const csv = formatTransactionsToCSV(transactions, categories, wallets);
            const lines = csv.split('\n');

            // Category with comma should be quoted
            expect(lines[1]).toContain('"Food, Drink"');
        });
    });
});

// ─── Backup Validation Tests ──────────────────────────────────────────

describe('Backup Validation', () => {
    const validSnapshot: BackupSnapshot = {
        version: 1,
        createdAt: '2026-03-01T00:00:00Z',
        appVersion: '1.0.0',
        data: {
            wallets: [
                { id: 'w1', name: 'Cash', balance: 100000, type: 'cash' as any, createdAt: '2026-01-01T00:00:00Z' },
            ],
            transactions: [
                {
                    id: 't1', type: TransactionType.EXPENSE, amount: 5000,
                    categoryId: 'c1', walletId: 'w1',
                    date: '2026-02-01T00:00:00Z', createdAt: '2026-02-01T00:00:00Z',
                },
            ],
            categories: [
                { id: 'c1', name: 'Food', type: CategoryType.EXPENSE },
            ],
            budgets: [
                {
                    id: 'b1', categoryId: 'c1', month: '2026-02',
                    limitAmount: 50000, createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z',
                },
            ],
        },
    };

    it('validates a correct snapshot', () => {
        const result = validateSnapshot(validSnapshot);
        expect(result.valid).toBe(true);
        expect(result.errors).toHaveLength(0);
    });

    it('rejects null input', () => {
        const result = validateSnapshot(null);
        expect(result.valid).toBe(false);
    });

    it('rejects missing version', () => {
        const bad = { ...validSnapshot, version: undefined } as any;
        const result = validateSnapshot(bad);
        expect(result.valid).toBe(false);
        expect(result.errors.some((e: string) => e.includes('version'))).toBe(true);
    });

    it('rejects missing data object', () => {
        const bad = { ...validSnapshot, data: undefined } as any;
        const result = validateSnapshot(bad);
        expect(result.valid).toBe(false);
    });

    it('rejects non-array data fields', () => {
        const bad = {
            ...validSnapshot,
            data: { ...validSnapshot.data, wallets: 'not-an-array' },
        } as any;
        const result = validateSnapshot(bad);
        expect(result.valid).toBe(false);
        expect(result.errors.some((e: string) => e.includes('wallets'))).toBe(true);
    });

    it('detects orphaned transaction referencing non-existent wallet', () => {
        const bad: BackupSnapshot = {
            ...validSnapshot,
            data: {
                ...validSnapshot.data,
                transactions: [
                    {
                        id: 't1', type: TransactionType.EXPENSE, amount: 5000,
                        categoryId: 'c1', walletId: 'nonexistent',
                        date: '2026-02-01T00:00:00Z', createdAt: '2026-02-01T00:00:00Z',
                    },
                ],
            },
        };
        const result = validateSnapshot(bad);
        expect(result.valid).toBe(false);
        expect(result.errors.some((e: string) => e.includes('wallet'))).toBe(true);
    });

    it('detects orphaned transaction referencing non-existent category', () => {
        const bad: BackupSnapshot = {
            ...validSnapshot,
            data: {
                ...validSnapshot.data,
                transactions: [
                    {
                        id: 't1', type: TransactionType.EXPENSE, amount: 5000,
                        categoryId: 'nonexistent', walletId: 'w1',
                        date: '2026-02-01T00:00:00Z', createdAt: '2026-02-01T00:00:00Z',
                    },
                ],
            },
        };
        const result = validateSnapshot(bad);
        expect(result.valid).toBe(false);
        expect(result.errors.some((e: string) => e.includes('category'))).toBe(true);
    });

    it('detects orphaned budget referencing non-existent category', () => {
        const bad: BackupSnapshot = {
            ...validSnapshot,
            data: {
                ...validSnapshot.data,
                budgets: [
                    {
                        id: 'b1', categoryId: 'nonexistent', month: '2026-02',
                        limitAmount: 50000, createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z',
                    },
                ],
            },
        };
        const result = validateSnapshot(bad);
        expect(result.valid).toBe(false);
        expect(result.errors.some((e: string) => e.includes('category'))).toBe(true);
    });

    it('validates snapshot with empty data arrays', () => {
        const empty: BackupSnapshot = {
            version: 1,
            createdAt: '2026-03-01T00:00:00Z',
            appVersion: '1.0.0',
            data: {
                wallets: [],
                transactions: [],
                categories: [],
                budgets: [],
            },
        };
        const result = validateSnapshot(empty);
        expect(result.valid).toBe(true);
    });
});
