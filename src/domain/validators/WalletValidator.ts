/**
 * Wallet Validator
 *
 * Pre-persistence validation for Wallet entities.
 * All checks are pure and side-effect-free.
 */

import { Wallet, WalletType } from '../entities/Wallet';
import { ValidationError } from './ValidationError';

const VALID_TYPES = Object.values(WalletType);

/**
 * Validate a Wallet entity before persistence.
 * Throws `ValidationError` on the first invalid field.
 */
export function validateWallet(wallet: Wallet): void {
    if (!wallet.id || typeof wallet.id !== 'string') {
        throw new ValidationError('Wallet', 'id', wallet.id, 'Wallet id must be a non-empty string');
    }

    if (!wallet.name || typeof wallet.name !== 'string' || wallet.name.trim().length === 0) {
        throw new ValidationError('Wallet', 'name', wallet.name, 'Wallet name must be a non-empty string');
    }

    if (typeof wallet.balance !== 'number' || !Number.isFinite(wallet.balance)) {
        throw new ValidationError('Wallet', 'balance', wallet.balance, 'Wallet balance must be a finite number');
    }

    if (!VALID_TYPES.includes(wallet.type)) {
        throw new ValidationError('Wallet', 'type', wallet.type, `Wallet type must be one of: ${VALID_TYPES.join(', ')}`);
    }

    if (!(wallet.createdAt instanceof Date) || isNaN(wallet.createdAt.getTime())) {
        throw new ValidationError('Wallet', 'createdAt', wallet.createdAt, 'Wallet createdAt must be a valid Date');
    }
}
