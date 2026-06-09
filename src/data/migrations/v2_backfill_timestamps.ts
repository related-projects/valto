/**
 * v2 — Backfill Missing Timestamps
 *
 * Ensures all wallets and transactions have a valid `createdAt` field.
 * Older records may lack this field if they were created before
 * the timestamp convention was established.
 *
 * Idempotent: only sets `createdAt` when missing/invalid.
 */

import type { SerializableTransaction } from '../../domain/entities/Transaction';
import type { SerializableWallet } from '../../domain/entities/Wallet';
import { StorageKeys } from '../storage/StorageKeys';
import type { Migration } from './migrationRunner';

export const v2_backfill_timestamps: Migration = {
    version: 2,
    name: 'backfill_timestamps',
    up: async (storage) => {
        const fallback = new Date().toISOString();

        // ── Transactions ──────────────────────────────────────────
        const transactions = await storage.get<SerializableTransaction[]>(StorageKeys.TRANSACTIONS);
        if (transactions && Array.isArray(transactions)) {
            let modified = false;
            const patched = transactions.map((tx) => {
                if (!tx.createdAt || isNaN(Date.parse(tx.createdAt))) {
                    modified = true;
                    return { ...tx, createdAt: fallback };
                }
                return tx;
            });
            if (modified) {
                await storage.set(StorageKeys.TRANSACTIONS, patched);
                console.log(`[Migration v2] Backfilled createdAt for transactions`);
            }
        }

        // ── Wallets ───────────────────────────────────────────────
        const wallets = await storage.get<SerializableWallet[]>(StorageKeys.WALLETS);
        if (wallets && Array.isArray(wallets)) {
            let modified = false;
            const patched = wallets.map((w) => {
                if (!w.createdAt || isNaN(Date.parse(w.createdAt))) {
                    modified = true;
                    return { ...w, createdAt: fallback };
                }
                return w;
            });
            if (modified) {
                await storage.set(StorageKeys.WALLETS, patched);
                console.log(`[Migration v2] Backfilled createdAt for wallets`);
            }
        }
    },
};
