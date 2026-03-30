/**
 * Transaction Validator
 *
 * Pre-persistence validation for Transaction entities.
 * All checks are pure and side-effect-free.
 */

import { Transaction, TransactionType } from '../entities/Transaction';
import { ValidationError } from './ValidationError';

const VALID_TYPES = Object.values(TransactionType);

/**
 * Validate a Transaction entity before persistence.
 * Throws `ValidationError` on the first invalid field.
 */
export function validateTransaction(tx: Transaction): void {
    if (!tx.id || typeof tx.id !== 'string') {
        throw new ValidationError('Transaction', 'id', tx.id, 'Transaction id must be a non-empty string');
    }

    if (!VALID_TYPES.includes(tx.type)) {
        throw new ValidationError('Transaction', 'type', tx.type, `Transaction type must be one of: ${VALID_TYPES.join(', ')}`);
    }

    if (typeof tx.amount !== 'number' || !Number.isFinite(tx.amount) || tx.amount < 0 || !Number.isInteger(tx.amount)) {
        throw new ValidationError('Transaction', 'amount', tx.amount, 'Transaction amount must be a non-negative integer (minor units / cents)');
    }

    if (!tx.walletId || typeof tx.walletId !== 'string') {
        throw new ValidationError('Transaction', 'walletId', tx.walletId, 'Transaction walletId must be a non-empty string');
    }

    if (!tx.categoryId || typeof tx.categoryId !== 'string') {
        throw new ValidationError('Transaction', 'categoryId', tx.categoryId, 'Transaction categoryId must be a non-empty string');
    }

    if (!(tx.date instanceof Date) || isNaN(tx.date.getTime())) {
        throw new ValidationError('Transaction', 'date', tx.date, 'Transaction date must be a valid Date');
    }

    if (!(tx.createdAt instanceof Date) || isNaN(tx.createdAt.getTime())) {
        throw new ValidationError('Transaction', 'createdAt', tx.createdAt, 'Transaction createdAt must be a valid Date');
    }
}
