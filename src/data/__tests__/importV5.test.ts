/**
 * v5 Import Invariant & Balance Audit (Points 4 & 5 proof)
 *
 * Point 4: for every wallet migrated out of AsyncStorage, the recomputed ledger
 *   balance must equal the stored balance - no double-counting of
 *   opening_balance + transactions. v5 derives opening_balance = balance -
 *   Σ ledgerEffect(imported txns), which must make the invariant hold including
 *   for double-entry transfer legs.
 * Point 5: the import path must actually INVOKE auditBalances() (otherwise the
 *   balance-auditing code is decorative), and post-import every wallet must show
 *   zero drift. The import is detect-only - it never rewrites a stored balance,
 *   so zero drift here is the derivation's doing, not a cleanup pass.
 *
 * The fixture is seeded the way the legacy AsyncStorageAdapter stored data
 * (Serializable* arrays under StorageKeys), then v5.up runs against an in-memory
 * SQLite DB.
 */

import { createTestDb } from '../../../tests/helpers/createTestDb';
import { InMemoryStorage } from '../../../tests/helpers/InMemoryStorage';
import { SerializableBudget } from '../../domain/entities/Budget';
import { CategoryType, SerializableCategory } from '../../domain/entities/Category';
import {
    RecurrenceFrequency,
    SerializableRecurringTransaction,
} from '../../domain/entities/RecurringTransaction';
import { SerializableTransaction, TransactionType } from '../../domain/entities/Transaction';
import { SerializableWallet, WalletType } from '../../domain/entities/Wallet';
import { v5_import_from_asyncstorage } from '../migrations/v5_import_from_asyncstorage';
import { WalletRepository } from '../repositories/WalletRepository';
import { StorageKeys } from '../storage/StorageKeys';
import type { SqlDatabase } from '../storage/sql/SqlDatabase';

const ISO = '2026-01-01T00:00:00.000Z';

// Two wallets whose stored balances already reflect their transactions,
// including a double-entry transfer (out of Cash, into Bank).
//   Cash: 100000 - 15000 (expense) + 5000 (income) - 25000 (transfer-out) = 65000
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

// The remaining three keys v5 reads. Seeded so the fixture matches a real
// pre-v5 install's residue rather than only its wallets and transactions -
// which is what v6's purge precondition has to hold against.
const categories: SerializableCategory[] = [
    { id: 'food', name: 'Food', type: CategoryType.EXPENSE, icon: 'cart', color: '#FF5722' },
    { id: 'salary', name: 'Salary', type: CategoryType.INCOME },
    { id: 'transfer-out', name: 'Transfer Out', type: CategoryType.EXPENSE },
    { id: 'transfer-in', name: 'Transfer In', type: CategoryType.INCOME },
];

const budgets: SerializableBudget[] = [
    { id: 'b-food', categoryId: 'food', month: '2026-01', limitAmount: 50000, createdAt: ISO, updatedAt: ISO },
];

const recurring: SerializableRecurringTransaction[] = [
    {
        id: 'rr-rent',
        type: TransactionType.EXPENSE,
        amount: 30000,
        walletId: 'w-cash',
        categoryId: 'food',
        description: 'Rent',
        startDate: ISO,
        frequency: RecurrenceFrequency.MONTHLY,
        interval: 1,
        lastGeneratedDate: ISO,
        isPaused: false,
        createdAt: ISO,
    },
];

describe('v5 import — recompute invariant & balance audit', () => {
    let db: SqlDatabase;
    let storage: InMemoryStorage;

    beforeEach(async () => {
        db = await createTestDb();
        storage = new InMemoryStorage();
        await storage.set(StorageKeys.WALLETS, wallets);
        await storage.set(StorageKeys.TRANSACTIONS, transactions);
        await storage.set(StorageKeys.CATEGORIES, categories);
        await storage.set(StorageKeys.BUDGETS, budgets);
        await storage.set(StorageKeys.RECURRING_RULES, recurring);
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

    it('(Point 5) the import invokes auditBalances() and leaves zero drift', async () => {
        const auditSpy = jest.spyOn(WalletRepository.prototype, 'auditBalances');

        await v5_import_from_asyncstorage.up({ storage, db });

        expect(auditSpy).toHaveBeenCalled();

        // Post-import: an independent audit sees no drift anywhere.
        const drifts = await new WalletRepository(db).auditBalances();
        expect(drifts).toHaveLength(2);
        for (const d of drifts) {
            expect(d.drift).toBe(0);
            expect(d.stored).toBe(d.computed);
        }

        auditSpy.mockRestore();
    });

    it('imports all five keys and leaves the key-value source in place for v6', async () => {
        await v5_import_from_asyncstorage.up({ storage, db });

        // Everything reached SQLite.
        const count = async (table: string) =>
            Number((await db.execute(`SELECT COUNT(*) AS c FROM ${table}`)).rows[0].c);
        expect(await count('wallets')).toBe(wallets.length);
        expect(await count('transactions')).toBe(transactions.length);
        expect(await count('categories')).toBe(categories.length);
        expect(await count('budgets')).toBe(budgets.length);
        expect(await count('recurring_rules')).toBe(recurring.length);

        // v5 deletes nothing - this is the residue v6 is responsible for, and
        // the flag below is the proof v6 keys its purge on.
        expect(await storage.get(StorageKeys.WALLETS)).not.toBeNull();
        expect(await storage.get(StorageKeys.TRANSACTIONS)).not.toBeNull();
        expect(await storage.get(StorageKeys.CATEGORIES)).not.toBeNull();
        expect(await storage.get(StorageKeys.BUDGETS)).not.toBeNull();
        expect(await storage.get(StorageKeys.RECURRING_RULES)).not.toBeNull();
        expect(await storage.get('@valto:sqlite_imported')).toBe(true);
    });

    it('is idempotent: re-running the import does not double-count', async () => {
        await v5_import_from_asyncstorage.up({ storage, db });
        await v5_import_from_asyncstorage.up({ storage, db }); // flag set -> no-op

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
