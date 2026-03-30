/**
 * RecurringTransaction Validator
 *
 * Pre-persistence validation for RecurringTransaction entities.
 * All checks are pure and side-effect-free.
 */

import { TransactionType } from '../entities/Transaction';
import { RecurrenceFrequency, RecurringTransaction } from '../entities/RecurringTransaction';
import { ValidationError } from './ValidationError';

const VALID_TYPES = Object.values(TransactionType);
const VALID_FREQUENCIES = Object.values(RecurrenceFrequency);

/**
 * Validate a RecurringTransaction entity before persistence.
 * Throws `ValidationError` on the first invalid field.
 */
export function validateRecurringTransaction(rule: RecurringTransaction): void {
    if (!rule.id || typeof rule.id !== 'string') {
        throw new ValidationError('RecurringTransaction', 'id', rule.id, 'Rule id must be a non-empty string');
    }

    if (!VALID_TYPES.includes(rule.type)) {
        throw new ValidationError('RecurringTransaction', 'type', rule.type, `Rule type must be one of: ${VALID_TYPES.join(', ')}`);
    }

    if (typeof rule.amount !== 'number' || !Number.isFinite(rule.amount) || rule.amount < 0 || !Number.isInteger(rule.amount)) {
        throw new ValidationError('RecurringTransaction', 'amount', rule.amount, 'Rule amount must be a non-negative integer (minor units / cents)');
    }

    if (!rule.walletId || typeof rule.walletId !== 'string') {
        throw new ValidationError('RecurringTransaction', 'walletId', rule.walletId, 'Rule walletId must be a non-empty string');
    }

    if (!rule.categoryId || typeof rule.categoryId !== 'string') {
        throw new ValidationError('RecurringTransaction', 'categoryId', rule.categoryId, 'Rule categoryId must be a non-empty string');
    }

    if (!VALID_FREQUENCIES.includes(rule.frequency)) {
        throw new ValidationError('RecurringTransaction', 'frequency', rule.frequency, `Rule frequency must be one of: ${VALID_FREQUENCIES.join(', ')}`);
    }

    if (typeof rule.interval !== 'number' || !Number.isInteger(rule.interval) || rule.interval < 1) {
        throw new ValidationError('RecurringTransaction', 'interval', rule.interval, 'Rule interval must be a positive integer');
    }

    if (!(rule.startDate instanceof Date) || isNaN(rule.startDate.getTime())) {
        throw new ValidationError('RecurringTransaction', 'startDate', rule.startDate, 'Rule startDate must be a valid Date');
    }

    if (rule.endDate !== undefined && rule.endDate !== null) {
        if (!(rule.endDate instanceof Date) || isNaN(rule.endDate.getTime())) {
            throw new ValidationError('RecurringTransaction', 'endDate', rule.endDate, 'Rule endDate must be a valid Date if provided');
        }
        if (rule.endDate <= rule.startDate) {
            throw new ValidationError('RecurringTransaction', 'endDate', rule.endDate, 'Rule endDate must be after startDate');
        }
    }

    if (!(rule.lastGeneratedDate instanceof Date) || isNaN(rule.lastGeneratedDate.getTime())) {
        throw new ValidationError('RecurringTransaction', 'lastGeneratedDate', rule.lastGeneratedDate, 'Rule lastGeneratedDate must be a valid Date');
    }

    if (!(rule.createdAt instanceof Date) || isNaN(rule.createdAt.getTime())) {
        throw new ValidationError('RecurringTransaction', 'createdAt', rule.createdAt, 'Rule createdAt must be a valid Date');
    }
}
