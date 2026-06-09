/**
 * Domain Validator Tests
 *
 * Tests for TransactionValidator, WalletValidator, SettingsValidator.
 * Covers valid data, invalid data, and edge cases.
 */

import { TransactionType } from '../../domain/entities/Transaction';
import { WalletType } from '../../domain/entities/Wallet';
import { validateTransaction } from '../../domain/validators/TransactionValidator';
import { validateSettings } from '../../domain/validators/SettingsValidator';
import { validateWallet } from '../../domain/validators/WalletValidator';
import { ValidationError } from '../../domain/validators/ValidationError';

// ─── TransactionValidator ─────────────────────────────────────────────

describe('validateTransaction', () => {
    const validTransaction = {
        id: 'tx-1',
        type: TransactionType.EXPENSE,
        amount: 5000,
        categoryId: 'cat-1',
        walletId: 'w-1',
        date: new Date('2026-01-15'),
        createdAt: new Date('2026-01-15'),
    };

    it('passes for a valid transaction', () => {
        expect(() => validateTransaction(validTransaction)).not.toThrow();
    });

    it('throws for missing id', () => {
        expect(() => validateTransaction({ ...validTransaction, id: '' }))
            .toThrow(ValidationError);
    });

    it('throws for non-string id', () => {
        expect(() => validateTransaction({ ...validTransaction, id: null as any }))
            .toThrow(ValidationError);
    });

    it('throws for invalid transaction type', () => {
        expect(() => validateTransaction({ ...validTransaction, type: 'invalid' as any }))
            .toThrow(ValidationError);
    });

    it('throws for NaN amount', () => {
        expect(() => validateTransaction({ ...validTransaction, amount: NaN }))
            .toThrow(ValidationError);
    });

    it('throws for Infinity amount', () => {
        expect(() => validateTransaction({ ...validTransaction, amount: Infinity }))
            .toThrow(ValidationError);
    });

    it('throws for negative amount', () => {
        expect(() => validateTransaction({ ...validTransaction, amount: -100 }))
            .toThrow(ValidationError);
    });

    it('allows zero amount', () => {
        expect(() => validateTransaction({ ...validTransaction, amount: 0 })).not.toThrow();
    });

    it('throws for missing walletId', () => {
        expect(() => validateTransaction({ ...validTransaction, walletId: '' }))
            .toThrow(ValidationError);
    });

    it('throws for missing categoryId', () => {
        expect(() => validateTransaction({ ...validTransaction, categoryId: '' }))
            .toThrow(ValidationError);
    });

    it('throws for invalid date', () => {
        expect(() => validateTransaction({ ...validTransaction, date: new Date('invalid') }))
            .toThrow(ValidationError);
    });

    it('throws for non-Date date', () => {
        expect(() => validateTransaction({ ...validTransaction, date: '2026-01-01' as any }))
            .toThrow(ValidationError);
    });

    it('throws for invalid createdAt', () => {
        expect(() => validateTransaction({ ...validTransaction, createdAt: new Date('invalid') }))
            .toThrow(ValidationError);
    });

    it('includes entity and field in error', () => {
        try {
            validateTransaction({ ...validTransaction, amount: NaN });
        } catch (error) {
            expect(error).toBeInstanceOf(ValidationError);
            expect((error as ValidationError).entity).toBe('Transaction');
            expect((error as ValidationError).field).toBe('amount');
        }
    });
});

// ─── WalletValidator ──────────────────────────────────────────────────

describe('validateWallet', () => {
    const validWallet = {
        id: 'w-1',
        name: 'Cash Wallet',
        balance: 10000,
        type: WalletType.CASH,
        createdAt: new Date('2026-01-01'),
    };

    it('passes for a valid wallet', () => {
        expect(() => validateWallet(validWallet)).not.toThrow();
    });

    it('throws for empty id', () => {
        expect(() => validateWallet({ ...validWallet, id: '' }))
            .toThrow(ValidationError);
    });

    it('throws for empty name', () => {
        expect(() => validateWallet({ ...validWallet, name: '' }))
            .toThrow(ValidationError);
    });

    it('throws for whitespace-only name', () => {
        expect(() => validateWallet({ ...validWallet, name: '   ' }))
            .toThrow(ValidationError);
    });

    it('throws for NaN balance', () => {
        expect(() => validateWallet({ ...validWallet, balance: NaN }))
            .toThrow(ValidationError);
    });

    it('throws for Infinity balance', () => {
        expect(() => validateWallet({ ...validWallet, balance: Infinity }))
            .toThrow(ValidationError);
    });

    it('allows negative balance (valid for bank accounts)', () => {
        expect(() => validateWallet({ ...validWallet, balance: -500 })).not.toThrow();
    });

    it('throws for invalid type', () => {
        expect(() => validateWallet({ ...validWallet, type: 'crypto' as any }))
            .toThrow(ValidationError);
    });

    it('throws for invalid createdAt', () => {
        expect(() => validateWallet({ ...validWallet, createdAt: new Date('invalid') }))
            .toThrow(ValidationError);
    });
});

// ─── SettingsValidator ────────────────────────────────────────────────

describe('validateSettings', () => {
    const validSettings = {
        theme: 'dark' as const,
        currency: 'USD',
        currencyLocked: true,
        notificationsEnabled: false,
        language: 'en',
        dateFormat: 'MM/DD/YYYY' as const,
        firstDayOfWeek: 'monday' as const,
        decimalSeparator: 'dot' as const,
        onboardingCompleted: true,
    };

    it('passes for valid settings', () => {
        expect(() => validateSettings(validSettings)).not.toThrow();
    });

    it('throws for empty language', () => {
        expect(() => validateSettings({ ...validSettings, language: '' }))
            .toThrow(ValidationError);
    });

    it('throws for empty currency', () => {
        expect(() => validateSettings({ ...validSettings, currency: '' }))
            .toThrow(ValidationError);
    });

    it('throws for invalid theme', () => {
        expect(() => validateSettings({ ...validSettings, theme: 'neon' as any }))
            .toThrow(ValidationError);
    });

    it('throws for non-boolean notificationsEnabled', () => {
        expect(() => validateSettings({ ...validSettings, notificationsEnabled: 'yes' as any }))
            .toThrow(ValidationError);
    });

    it('throws for non-boolean currencyLocked', () => {
        expect(() => validateSettings({ ...validSettings, currencyLocked: 0 as any }))
            .toThrow(ValidationError);
    });

    it('throws for invalid dateFormat', () => {
        expect(() => validateSettings({ ...validSettings, dateFormat: 'YYYY/DD/MM' as any }))
            .toThrow(ValidationError);
    });

    it('throws for invalid firstDayOfWeek', () => {
        expect(() => validateSettings({ ...validSettings, firstDayOfWeek: 'saturday' as any }))
            .toThrow(ValidationError);
    });

    it('throws for invalid decimalSeparator', () => {
        expect(() => validateSettings({ ...validSettings, decimalSeparator: 'space' as any }))
            .toThrow(ValidationError);
    });
});
