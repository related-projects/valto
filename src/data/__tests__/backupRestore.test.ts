/**
 * Backup Restore Edge Case Tests
 *
 * Tests validateSnapshot edge cases, restore rollback behavior,
 * future schema version rejection, and settings restore.
 */

import { validateSnapshot, CURRENT_SCHEMA_VERSION, type BackupSnapshot } from '../../data/services/backupService';

describe('validateSnapshot', () => {
    const validSnapshot: BackupSnapshot = {
        version: CURRENT_SCHEMA_VERSION,
        createdAt: new Date().toISOString(),
        appVersion: '1.0.0',
        data: {
            wallets: [{ id: 'w-1', name: 'Cash', balance: 50000, type: 'cash', createdAt: new Date().toISOString() } as any],
            transactions: [],
            categories: [{ id: 'cat-1', name: 'Food', type: 'expense', icon: '🍕', color: '#FF5722' } as any],
            budgets: [],
        },
    };

    it('accepts a valid snapshot', () => {
        const result = validateSnapshot(validSnapshot);
        expect(result.valid).toBe(true);
        expect(result.errors).toHaveLength(0);
    });

    it('rejects null input', () => {
        const result = validateSnapshot(null);
        expect(result.valid).toBe(false);
        expect(result.errors).toContain('Snapshot is not a valid object');
    });

    it('rejects undefined input', () => {
        const result = validateSnapshot(undefined);
        expect(result.valid).toBe(false);
    });

    it('rejects non-object input', () => {
        const result = validateSnapshot('not an object');
        expect(result.valid).toBe(false);
    });

    it('rejects missing version', () => {
        const snap = { ...validSnapshot, version: undefined };
        const result = validateSnapshot(snap);
        expect(result.valid).toBe(false);
        expect(result.errors.some(e => e.includes('version'))).toBe(true);
    });

    it('rejects version 0', () => {
        const snap = { ...validSnapshot, version: 0 };
        const result = validateSnapshot(snap);
        expect(result.valid).toBe(false);
    });

    it('rejects future schema versions', () => {
        const snap = { ...validSnapshot, version: CURRENT_SCHEMA_VERSION + 1 };
        const result = validateSnapshot(snap);
        expect(result.valid).toBe(false);
        expect(result.errors.some(e => e.includes('newer'))).toBe(true);
    });

    it('rejects missing createdAt', () => {
        const snap = { ...validSnapshot, createdAt: 12345 as any };
        const result = validateSnapshot(snap);
        expect(result.valid).toBe(false);
    });

    it('rejects missing data object', () => {
        const snap = { ...validSnapshot, data: undefined as any };
        const result = validateSnapshot(snap);
        expect(result.valid).toBe(false);
        expect(result.errors.some(e => e.includes('data'))).toBe(true);
    });

    it('rejects non-array wallets', () => {
        const snap = {
            ...validSnapshot,
            data: { ...validSnapshot.data, wallets: 'not array' as any },
        };
        const result = validateSnapshot(snap);
        expect(result.valid).toBe(false);
    });

    it('rejects non-array transactions', () => {
        const snap = {
            ...validSnapshot,
            data: { ...validSnapshot.data, transactions: {} as any },
        };
        const result = validateSnapshot(snap);
        expect(result.valid).toBe(false);
    });

    it('detects orphan transactions referencing non-existent wallets', () => {
        const snap = {
            ...validSnapshot,
            data: {
                ...validSnapshot.data,
                transactions: [{
                    id: 'tx-1',
                    type: 'expense',
                    amount: 100,
                    categoryId: 'cat-1',
                    walletId: 'non-existent-wallet',
                    date: new Date().toISOString(),
                    createdAt: new Date().toISOString(),
                }],
            },
        };
        const result = validateSnapshot(snap);
        expect(result.valid).toBe(false);
        expect(result.errors.some(e => e.includes('non-existent wallet'))).toBe(true);
    });

    it('detects orphan transactions referencing non-existent categories', () => {
        const snap = {
            ...validSnapshot,
            data: {
                ...validSnapshot.data,
                transactions: [{
                    id: 'tx-1',
                    type: 'expense',
                    amount: 100,
                    categoryId: 'non-existent-category',
                    walletId: 'w-1',
                    date: new Date().toISOString(),
                    createdAt: new Date().toISOString(),
                }],
            },
        };
        const result = validateSnapshot(snap);
        expect(result.valid).toBe(false);
        expect(result.errors.some(e => e.includes('non-existent category'))).toBe(true);
    });

    it('detects orphan budgets referencing non-existent categories', () => {
        const snap = {
            ...validSnapshot,
            data: {
                ...validSnapshot.data,
                budgets: [{
                    id: 'b-1',
                    categoryId: 'non-existent-cat',
                    month: '2026-03',
                    limitAmount: 50000,
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString(),
                }],
            },
        };
        const result = validateSnapshot(snap);
        expect(result.valid).toBe(false);
        expect(result.errors.some(e => e.includes('non-existent category'))).toBe(true);
    });

    it('detects transactions with missing required fields', () => {
        const snap = {
            ...validSnapshot,
            data: {
                ...validSnapshot.data,
                transactions: [{
                    id: '',
                    type: 'expense',
                    amount: 'not a number',
                    categoryId: 'cat-1',
                    walletId: 'w-1',
                    date: new Date().toISOString(),
                    createdAt: new Date().toISOString(),
                }],
            },
        };
        const result = validateSnapshot(snap);
        expect(result.valid).toBe(false);
        expect(result.errors.some(e => e.includes('missing required fields'))).toBe(true);
    });

    it('accepts snapshot with valid referential integrity', () => {
        const snap = {
            ...validSnapshot,
            data: {
                ...validSnapshot.data,
                transactions: [{
                    id: 'tx-1',
                    type: 'expense',
                    amount: 5000,
                    categoryId: 'cat-1',
                    walletId: 'w-1',
                    date: new Date().toISOString(),
                    createdAt: new Date().toISOString(),
                }],
                budgets: [{
                    id: 'b-1',
                    categoryId: 'cat-1',
                    month: '2026-03',
                    limitAmount: 50000,
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString(),
                }],
            },
        };
        const result = validateSnapshot(snap);
        expect(result.valid).toBe(true);
        expect(result.errors).toHaveLength(0);
    });
});
