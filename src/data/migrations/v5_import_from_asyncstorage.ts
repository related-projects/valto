/**
 * v5 — One-Time Import: AsyncStorage → SQLite
 *
 * Moves existing financial data out of the legacy key-value store into the
 * relational SQLite tables, so upgrading users keep their data. Idempotent:
 *  - `INSERT OR IGNORE` (id is PRIMARY KEY) makes re-runs no-ops, and
 *  - a guard flag short-circuits after the first successful import.
 *
 * Opening-balance anchor: an imported wallet's stored balance already reflects
 * all its historical transactions, so we derive
 *     opening_balance = balance − Σ ledgerEffect(imported txns of the wallet)
 * which makes recomputeBalanceFromLedger concord with the stored balance
 * immediately after import.
 *
 * The legacy AsyncStorage keys are left untouched (read-only source); the
 * AsyncStorageAdapter is retained solely for this import and for the
 * still-KV settings/security/seed data.
 */

import { deserializeBudget, SerializableBudget } from '../../domain/entities/Budget';
import { deserializeCategory, SerializableCategory } from '../../domain/entities/Category';
import {
    deserializeRecurringTransaction,
    SerializableRecurringTransaction,
} from '../../domain/entities/RecurringTransaction';
import {
    deserializeTransaction,
    SerializableTransaction,
} from '../../domain/entities/Transaction';
import { deserializeWallet, SerializableWallet } from '../../domain/entities/Wallet';
import { ledgerEffect } from '../repositories/ledger';
import { WalletRepository } from '../repositories/WalletRepository';
import {
    budgetMapper,
    categoryMapper,
    recurringMapper,
    sqlInsert,
    transactionMapper,
} from '../storage/sql/mappers';
import { StorageKeys } from '../storage/StorageKeys';
import type { Migration } from './migrationRunner';

const IMPORT_FLAG = '@valto:sqlite_imported';

export const v5_import_from_asyncstorage: Migration = {
    version: 5,
    name: 'import_from_asyncstorage',
    up: async ({ storage, db }) => {
        const alreadyImported = await storage.get<boolean>(IMPORT_FLAG);
        if (alreadyImported) {
            return;
        }

        const wallets = (
            (await storage.get<SerializableWallet[]>(StorageKeys.WALLETS)) ?? []
        ).map(deserializeWallet);
        const transactions = (
            (await storage.get<SerializableTransaction[]>(StorageKeys.TRANSACTIONS)) ?? []
        ).map(deserializeTransaction);
        const categories = (
            (await storage.get<SerializableCategory[]>(StorageKeys.CATEGORIES)) ?? []
        ).map(deserializeCategory);
        const budgets = (
            (await storage.get<SerializableBudget[]>(StorageKeys.BUDGETS)) ?? []
        ).map(deserializeBudget);
        const recurring = (
            (await storage.get<SerializableRecurringTransaction[]>(StorageKeys.RECURRING_RULES)) ?? []
        ).map(deserializeRecurringTransaction);

        // Wallets need an explicit opening_balance, so insert them directly.
        for (const w of wallets) {
            const ledgerSum = transactions
                .filter((t) => t.walletId === w.id)
                .reduce((sum, t) => sum + ledgerEffect(t), 0);
            const openingBalance = w.balance - ledgerSum;

            await db.execute(
                `INSERT OR IGNORE INTO wallets
                    (id, name, balance, opening_balance, type, color, created_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?)`,
                [
                    w.id,
                    w.name,
                    w.balance,
                    openingBalance,
                    w.type,
                    w.color ?? null,
                    w.createdAt.toISOString(),
                ],
            );
        }

        for (const c of categories) await sqlInsert(db, categoryMapper, c, true);
        for (const t of transactions) await sqlInsert(db, transactionMapper, t, true);
        for (const b of budgets) await sqlInsert(db, budgetMapper, b, true);
        for (const r of recurring) await sqlInsert(db, recurringMapper, r, true);

        // Audit every migrated wallet against its ledger. This is the real
        // runtime entry point for the balance-auditing code (recompute/audit
        // are otherwise only exercised in tests). The opening_balance anchor set
        // above makes the invariant hold by construction, so drift must be zero.
        //
        // Detect-only, on purpose: a non-zero drift here would mean the
        // opening_balance derivation above is broken. Healing it by rewriting
        // the stored balance would hide that bug rather than surface it, so we
        // report and leave the data exactly as imported.
        const walletRepo = new WalletRepository(db);
        const drifted = (await walletRepo.auditBalances()).filter((a) => a.drift !== 0);
        if (drifted.length > 0) {
            console.warn(
                `[import] Balance drift after v5 import — opening_balance derivation is suspect: ` +
                    drifted
                        .map((a) => `${a.walletId} (stored ${a.stored}, ledger ${a.computed}, drift ${a.drift})`)
                        .join(', '),
            );
        }

        await storage.set(IMPORT_FLAG, true);
        console.log(
            `[Migration v5] Imported ${wallets.length} wallets, ${transactions.length} transactions, ` +
                `${categories.length} categories, ${budgets.length} budgets, ${recurring.length} recurring rules`,
        );
    },
};
