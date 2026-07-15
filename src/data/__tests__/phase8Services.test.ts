/**
 * Phase 9 Services Tests
 *
 * Tests for backup validation, settings persistence, and schema compatibility.
 */

import {
    BackupSnapshot,
    CURRENT_SCHEMA_VERSION,
    validateSnapshot,
} from '../../data/services/backupService';
import {
    getDefaultSettings
} from '../../data/services/settingsService';
import {
    DEFAULT_CURRENCY_CODE,
    getCurrencyByCode,
    SUPPORTED_CURRENCIES,
} from '../../domain/constants/currencies';
import { CategoryType, TransactionType } from '../../domain/entities';

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
            settings: {
                theme: 'dark',
                currency: 'EUR',
                currencyLocked: false,
                notificationsEnabled: false,
                language: 'en',
                dateFormat: 'MM/DD/YYYY',
                firstDayOfWeek: 'monday',
                decimalSeparator: 'dot',
                onboardingCompleted: false,
            },
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

    it('rejects future schema version', () => {
        const futureSnapshot = { ...validSnapshot, version: CURRENT_SCHEMA_VERSION + 1 };
        const result = validateSnapshot(futureSnapshot);
        expect(result.valid).toBe(false);
        expect(result.errors.some((e: string) => e.includes('newer'))).toBe(true);
    });

    it('accepts snapshot with unknown extra fields (forward-compat)', () => {
        const extraFields = {
            ...validSnapshot,
            unknownField: 'should be ignored',
            data: {
                ...validSnapshot.data,
                unknownArray: [1, 2, 3],
            },
        };
        const result = validateSnapshot(extraFields);
        expect(result.valid).toBe(true);
    });

    it('accepts snapshot without settings (backward-compat)', () => {
        const noSettings = {
            ...validSnapshot,
            data: {
                wallets: validSnapshot.data.wallets,
                transactions: validSnapshot.data.transactions,
                categories: validSnapshot.data.categories,
                budgets: validSnapshot.data.budgets,
                // No settings field
            },
        };
        const result = validateSnapshot(noSettings);
        expect(result.valid).toBe(true);
    });
});

// ─── Settings Service Tests ───────────────────────────────────────────

describe('Settings Service', () => {
    describe('getDefaultSettings', () => {
        it('returns correct defaults', () => {
            const defaults = getDefaultSettings();
            expect(defaults.theme).toBe('system');
            expect(defaults.currency).toBe('USD');
            expect(defaults.currencyLocked).toBe(false);
            expect(defaults.notificationsEnabled).toBe(false);
            expect(typeof defaults.language).toBe('string');
        });

        it('returns a new object each call (no shared reference)', () => {
            const a = getDefaultSettings();
            const b = getDefaultSettings();
            expect(a).toEqual(b);
            expect(a).not.toBe(b);
        });
    });
});

// ─── Currency Tests ───────────────────────────────────────────────────

describe('Currency System', () => {
    it('has at least 10 supported currencies', () => {
        expect(SUPPORTED_CURRENCIES.length).toBeGreaterThanOrEqual(10);
    });

    it('includes USD as default', () => {
        expect(DEFAULT_CURRENCY_CODE).toBe('USD');
        const usd = getCurrencyByCode('USD');
        expect(usd.symbol).toBe('$');
        expect(usd.name).toBe('US Dollar');
    });

    it('returns correct currency by code', () => {
        const eur = getCurrencyByCode('EUR');
        expect(eur.code).toBe('EUR');
        expect(eur.symbol).toBe('€');
    });

    it('falls back to USD for unknown code', () => {
        const unknown = getCurrencyByCode('XYZ');
        expect(unknown.code).toBe('USD');
    });

    it('all currencies have required fields', () => {
        for (const c of SUPPORTED_CURRENCIES) {
            expect(c.code).toBeTruthy();
            expect(c.symbol).toBeTruthy();
            expect(c.name).toBeTruthy();
        }
    });
});
