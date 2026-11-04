/**
 * V-128 control: migration v5 keeps importing amounts above the cap
 *
 * The cap on entered amounts (999 999 999 999 minor units) applies to entry
 * only; the v5 import of the legacy key-value store takes what an older build
 * stored, as it is (REGISTRE V-128, Owner decision 1; policy 10). This is a
 * control, not a regression test: the import took these values before the fix
 * and must go on taking them after it.
 *
 * Seeded the way the legacy AsyncStorageAdapter stored data, as
 * importV5.test.ts does, with every amount past the cap and below
 * Number.MAX_SAFE_INTEGER, so each is held exactly.
 */

import { CAP_MINOR } from '../../../tests/helpers/amountCapCases';
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
import { BudgetRepository } from '../repositories/BudgetRepository';
import { RecurringTransactionRepository } from '../repositories/RecurringTransactionRepository';
import { TransactionRepository } from '../repositories/TransactionRepository';
import { WalletRepository } from '../repositories/WalletRepository';
import { StorageKeys } from '../storage/StorageKeys';

const ISO = '2026-01-01T00:00:00.000Z';
const OVER = CAP_MINOR + 1;
const FAR_OVER = 123_456_789_123_456;

const wallets: SerializableWallet[] = [
    { id: 'w-bank', name: 'Bank', balance: FAR_OVER, type: WalletType.BANK, createdAt: ISO },
];

const transactions: SerializableTransaction[] = [
    { id: 't-inc', type: TransactionType.INCOME, amount: OVER, categoryId: 'salary', walletId: 'w-bank', date: ISO, createdAt: ISO },
];

const categories: SerializableCategory[] = [
    { id: 'salary', name: 'Salary', type: CategoryType.INCOME },
    { id: 'rent', name: 'Rent', type: CategoryType.EXPENSE },
];

const budgets: SerializableBudget[] = [
    { id: 'b-rent', categoryId: 'rent', month: '2026-01', limitAmount: OVER, createdAt: ISO, updatedAt: ISO },
];

const recurring: SerializableRecurringTransaction[] = [
    {
        id: 'rr-rent',
        type: TransactionType.EXPENSE,
        amount: FAR_OVER,
        walletId: 'w-bank',
        categoryId: 'rent',
        description: 'Rent',
        startDate: ISO,
        frequency: RecurrenceFrequency.MONTHLY,
        interval: 1,
        lastGeneratedDate: ISO,
        isPaused: false,
        createdAt: ISO,
    },
];

describe('V-128 control: v5 keeps importing amounts above the cap', () => {
    it('control: a balance, a transaction, a budget limit and a rule amount above the cap are imported exactly', async () => {
        const db = await createTestDb();
        const storage = new InMemoryStorage();
        await storage.set(StorageKeys.WALLETS, wallets);
        await storage.set(StorageKeys.TRANSACTIONS, transactions);
        await storage.set(StorageKeys.CATEGORIES, categories);
        await storage.set(StorageKeys.BUDGETS, budgets);
        await storage.set(StorageKeys.RECURRING_RULES, recurring);

        await v5_import_from_asyncstorage.up({ storage, db });

        const walletRepo = new WalletRepository(db);
        expect((await walletRepo.getById('w-bank'))?.balance).toBe(FAR_OVER);
        expect((await new TransactionRepository(db).getById('t-inc'))?.amount).toBe(OVER);
        expect((await new BudgetRepository(db).getById('b-rent'))?.limitAmount).toBe(OVER);
        expect((await new RecurringTransactionRepository(db).getById('rr-rent'))?.amount).toBe(FAR_OVER);
        expect(await walletRepo.recomputeBalanceFromLedger('w-bank')).toBe(FAR_OVER);
    });
});
