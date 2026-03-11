/**
 * v3 — Normalize Transaction Amounts
 *
 * Ensures all transaction `amount` fields are non-negative.
 * Historical data may contain negative amounts if the sign was
 * baked into the value instead of being derived from `type`.
 *
 * Idempotent: `Math.abs` on an already-positive number is a no-op.
 */

import type { SerializableTransaction } from '../../domain/entities/Transaction';
import { StorageKeys } from '../storage/StorageKeys';
import type { Migration } from './migrationRunner';

export const v3_normalize_amounts: Migration = {
    version: 3,
    name: 'normalize_amounts',
    up: async (storage) => {
        const transactions = await storage.get<SerializableTransaction[]>(StorageKeys.TRANSACTIONS);
        if (!transactions || !Array.isArray(transactions)) return;

        let modified = false;
        const patched = transactions.map((tx) => {
            if (typeof tx.amount === 'number' && tx.amount < 0) {
                modified = true;
                return { ...tx, amount: Math.abs(tx.amount) };
            }
            return tx;
        });

        if (modified) {
            await storage.set(StorageKeys.TRANSACTIONS, patched);
            console.log(`[Migration v3] Normalized negative transaction amounts`);
        }
    },
};
