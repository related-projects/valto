/**
 * RecurringTransactionValidator Unit Tests
 *
 * Direct validation tests for RecurringTransaction entities.
 * Tests each field constraint independently.
 */

import { TransactionType } from '../../domain/entities/Transaction';
import { RecurrenceFrequency } from '../../domain/entities/RecurringTransaction';
import { validateRecurringTransaction } from '../../domain/validators/RecurringTransactionValidator';
import { ValidationError } from '../../domain/validators/ValidationError';
import { makeRecurringRule, resetFactoryCounters } from '../../test-utils/testFactories';

beforeEach(() => {
    resetFactoryCounters();
});

describe('validateRecurringTransaction', () => {
    it('passes for a valid rule', () => {
        expect(() => validateRecurringTransaction(makeRecurringRule())).not.toThrow();
    });

    // ── id ────────────────────────────────────────────────────────────
    it('throws for empty id', () => {
        expect(() => validateRecurringTransaction(makeRecurringRule({ id: '' })))
            .toThrow(ValidationError);
    });

    it('throws for null id', () => {
        expect(() => validateRecurringTransaction(makeRecurringRule({ id: null as any })))
            .toThrow(ValidationError);
    });

    // ── type ──────────────────────────────────────────────────────────
    it('throws for invalid type', () => {
        expect(() => validateRecurringTransaction(makeRecurringRule({ type: 'refund' as any })))
            .toThrow(ValidationError);
    });

    it('accepts income type', () => {
        expect(() => validateRecurringTransaction(makeRecurringRule({ type: TransactionType.INCOME })))
            .not.toThrow();
    });

    it('accepts transfer type', () => {
        expect(() => validateRecurringTransaction(makeRecurringRule({ type: TransactionType.TRANSFER })))
            .not.toThrow();
    });

    // ── amount ────────────────────────────────────────────────────────
    it('throws for negative amount', () => {
        expect(() => validateRecurringTransaction(makeRecurringRule({ amount: -100 })))
            .toThrow(ValidationError);
    });

    it('throws for NaN amount', () => {
        expect(() => validateRecurringTransaction(makeRecurringRule({ amount: NaN })))
            .toThrow(ValidationError);
    });

    it('throws for Infinity amount', () => {
        expect(() => validateRecurringTransaction(makeRecurringRule({ amount: Infinity })))
            .toThrow(ValidationError);
    });

    it('throws for non-integer amount', () => {
        expect(() => validateRecurringTransaction(makeRecurringRule({ amount: 99.5 })))
            .toThrow(ValidationError);
    });

    it('allows zero amount', () => {
        expect(() => validateRecurringTransaction(makeRecurringRule({ amount: 0 })))
            .not.toThrow();
    });

    // ── walletId / categoryId ─────────────────────────────────────────
    it('throws for empty walletId', () => {
        expect(() => validateRecurringTransaction(makeRecurringRule({ walletId: '' })))
            .toThrow(ValidationError);
    });

    it('throws for empty categoryId', () => {
        expect(() => validateRecurringTransaction(makeRecurringRule({ categoryId: '' })))
            .toThrow(ValidationError);
    });

    // ── frequency ─────────────────────────────────────────────────────
    it('throws for invalid frequency', () => {
        expect(() => validateRecurringTransaction(makeRecurringRule({ frequency: 'biweekly' as any })))
            .toThrow(ValidationError);
    });

    it('accepts all valid frequencies', () => {
        for (const freq of Object.values(RecurrenceFrequency)) {
            expect(() => validateRecurringTransaction(makeRecurringRule({ frequency: freq })))
                .not.toThrow();
        }
    });

    // ── interval ──────────────────────────────────────────────────────
    it('throws for zero interval', () => {
        expect(() => validateRecurringTransaction(makeRecurringRule({ interval: 0 })))
            .toThrow(ValidationError);
    });

    it('throws for negative interval', () => {
        expect(() => validateRecurringTransaction(makeRecurringRule({ interval: -1 })))
            .toThrow(ValidationError);
    });

    it('throws for non-integer interval', () => {
        expect(() => validateRecurringTransaction(makeRecurringRule({ interval: 1.5 })))
            .toThrow(ValidationError);
    });

    // ── dates ─────────────────────────────────────────────────────────
    it('throws for invalid startDate', () => {
        expect(() => validateRecurringTransaction(makeRecurringRule({ startDate: new Date('invalid') })))
            .toThrow(ValidationError);
    });

    it('throws for non-Date startDate', () => {
        expect(() => validateRecurringTransaction(makeRecurringRule({ startDate: '2026-01-01' as any })))
            .toThrow(ValidationError);
    });

    it('throws for invalid endDate if provided', () => {
        expect(() => validateRecurringTransaction(makeRecurringRule({ endDate: new Date('invalid') })))
            .toThrow(ValidationError);
    });

    it('throws if endDate is before startDate', () => {
        expect(() => validateRecurringTransaction(makeRecurringRule({
            startDate: new Date('2026-06-01'),
            endDate: new Date('2026-01-01'),
        }))).toThrow(ValidationError);
    });

    it('throws if endDate equals startDate', () => {
        const same = new Date('2026-06-01');
        expect(() => validateRecurringTransaction(makeRecurringRule({
            startDate: same,
            endDate: same,
        }))).toThrow(ValidationError);
    });

    it('allows undefined endDate', () => {
        expect(() => validateRecurringTransaction(makeRecurringRule({ endDate: undefined })))
            .not.toThrow();
    });

    it('throws for invalid lastGeneratedDate', () => {
        expect(() => validateRecurringTransaction(makeRecurringRule({ lastGeneratedDate: new Date('invalid') })))
            .toThrow(ValidationError);
    });

    it('throws for invalid createdAt', () => {
        expect(() => validateRecurringTransaction(makeRecurringRule({ createdAt: new Date('invalid') })))
            .toThrow(ValidationError);
    });

    // ── error metadata ────────────────────────────────────────────────
    it('includes entity and field in error', () => {
        try {
            validateRecurringTransaction(makeRecurringRule({ amount: -1 }));
        } catch (error) {
            expect(error).toBeInstanceOf(ValidationError);
            expect((error as ValidationError).entity).toBe('RecurringTransaction');
            expect((error as ValidationError).field).toBe('amount');
        }
    });
});
