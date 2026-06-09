/**
 * v5 Import Invariant & Reconciliation (Points 4 & 5 proof)
 *
 * Point 4: for every wallet migrated out of AsyncStorage, the recomputed ledger
 *   balance must equal the stored balance — no double-counting of
 *   opening_balance + transactions. v5 derives opening_balance = balance −
 *   Σ ledgerEffect(imported txns), which must make the invariant hold including
 *   for double-entry transfer legs.
 * Point 5: the import path must actually INVOKE reconcile() (otherwise the
 *   balance-auditing code is decorative), and post-import every wallet reconciles
 *   with zero drift.
 *
 * The fixture is seeded the way the legacy AsyncStorageAdapter stored data
 * (Serializable* arrays under StorageKeys), then v5.up runs against an in-memory
 * SQLite DB.
 */

import { createTestDb } from '../../../tests/helpers/createTestDb';
import { InMemoryStorage } from '../../../tests/helpers/InMemoryStorage';
import { SerializableTransaction, TransactionType } from '../../domain/entities/Transaction';
import { SerializableWallet, WalletType } from '../../domain/entities/Wallet';
import { v5_import_from_asyncstorage } from '../migrations/v5_import_from_asyncstorage';
import { WalletRepository } from '../repositories/WalletRepository';
import { StorageKeys } from '../storage/StorageKeys';
import type { SqlDatabase } from '../storage/sql/SqlDatabase';

const ISO = '2026-01-01T00:00:00.000Z';

// Two wallets whose stored balances already reflect their transactions,
// including a double-entry transfer (out of Cash, into Bank).
//   Cash: 100000 − 15000 (expense) + 5000 (income) − 25000 (transfer-out) = 65000
//   Bank: 0 + 25000 (transfer-in) = 25000
const wallets: SerializableWallet[] = [
    { id: 'w-cash', name: 'Cash', balance: 65000, type: WalletType.CASH, createdAt: ISO },
    { id: 'w-bank', name: 'Bank', balance: 25000, type: WalletType.BANK, createdAt: ISO },
];

const tx = (
    id: string,
    type: TransactionType,
    amount: number,
    categoryId: string,
    walletId: string,
): SerializableTransaction => ({ id, type, amount, categoryId, walletId, date: ISO, createdAt: ISO });

const transactions: SerializableTransaction[] = [
    tx('t-exp', TransactionType.EXPENSE, 15000, 'food', 'w-cash'),
    tx('t-inc', TransactionType.INCOME, 5000, 'salary', 'w-cash'),
    tx('t-tout', TransactionType.TRANSFER, 25000, 'transfer-out', 'w-cash'),
    tx('t-tin', TransactionType.TRANSFER, 25000, 'transfer-in', 'w-bank'),
];

describe('v5 import — recompute invariant & reconciliation', () => {
    let db: SqlDatabase;
    let storage: InMemoryStorage;

    beforeEach(async () => {
        db = await createTestDb();
        storage = new InMemoryStorage();
        await storage.set(StorageKeys.WALLETS, wallets);
        await storage.set(StorageKeys.TRANSACTIONS, transactions);
    });

    it('(Point 4) recompute == stored balance for every migrated wallet', async () => {
        await v5_import_from_asyncstorage.up({ storage, db });

        const walletRepo = new WalletRepository(db);
        for (const w of wallets) {
            const stored = (await walletRepo.getById(w.id))!.balance;
            expect(stored).toBe(w.balance);
            expect(await walletRepo.recomputeBalanceFromLedger(w.id)).toBe(stored);
        }
    });

    it('(Point 5) the import invokes reconcile() and leaves zero drift', async () => {
        const reconcileSpy = jest.spyOn(WalletRepository.prototype, 'reconcile');

        await v5_import_from_asyncstorage.up({ storage, db });

        expect(reconcileSpy).toHaveBeenCalled();

        // Post-import: an independent reconcile sees no drift anywhere.
        const drifts = await new WalletRepository(db).reconcile();
        expect(drifts).toHaveLength(2);
        for (const d of drifts) {
            expect(d.drift).toBe(0);
            expect(d.stored).toBe(d.computed);
        }

        reconcileSpy.mockRestore();
    });

    it('is idempotent: re-running the import does not double-count', async () => {
        await v5_import_from_asyncstorage.up({ storage, db });
        await v5_import_from_asyncstorage.up({ storage, db }); // flag set → no-op

        const walletRepo = new WalletRepository(db);
        for (const w of wallets) {
            expect((await walletRepo.getById(w.id))!.balance).toBe(w.balance);
            expect(await walletRepo.recomputeBalanceFromLedger(w.id)).toBe(w.balance);
        }
        // No duplicated transactions.
        const { rows } = await db.execute(`SELECT COUNT(*) AS c FROM transactions`);
        expect(Number(rows[0].c)).toBe(transactions.length);
    });
});
