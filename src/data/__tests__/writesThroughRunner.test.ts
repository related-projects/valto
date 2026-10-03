/**
 * V-109: every production write goes through the runner.
 *
 * The audited defect: a write made outside runInTransaction is sent straight to
 * the shared connection. When another chain holds a transaction open at that
 * moment, the write lands inside it and shares its fate - it is reported as
 * saved, then erased when that transaction rolls back.
 *
 * Each case holds the outer transaction open with a GatedDatabase, makes the
 * user's write through the production path (use case, hook or service), then
 * lets the outer transaction roll back. The write must either be durably in the
 * database afterwards, or be rejected with an error - never reported as saved
 * and then lost.
 *
 * Deterministic: better-sqlite3 resolves each statement immediately, and the
 * gate holds the outer transaction on a known statement, so the user's write
 * always starts while that transaction is open.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { renderHook, waitFor } from '@testing-library/react-native';
import { GatedDatabase } from '../../../tests/helpers/GatedDatabase';
import { createTestDb } from '../../../tests/helpers/createTestDb';
import { container, getUseCaseDeps } from '../../core/di/container';
import {
    CategoryType,
    RecurrenceFrequency,
    TransactionType,
    WalletType,
    type CreateRecurringTransactionDTO,
} from '../../domain/entities';
import { getCurrentMonth } from '../../domain/entities/Budget';
import { createWallet } from '../../domain/useCases/createWallet';
import { deleteWallet } from '../../domain/useCases/deleteWallet';
import { useOnboarding } from '../../features/onboarding/hooks/useOnboarding';
import { useBudgets } from '../../hooks/useBudgets';
import { useCategories } from '../../hooks/useCategories';
import { useRecurringRules } from '../../hooks/useRecurringRules';
import { useWallets } from '../../hooks/useWallets';
import { BudgetRepository } from '../repositories/BudgetRepository';
import { RecurringTransactionRepository } from '../repositories/RecurringTransactionRepository';
import { defaultCategories } from '../seed/seedData';
import { initializeSeedData } from '../seed/seedService';
import { CURRENT_SCHEMA_VERSION, restoreFromSnapshot, type BackupSnapshot } from '../services/backupService';
import { processRecurringRules, type RecurringEngineDeps } from '../services/RecurringTransactionEngine';
import { getDefaultSettings } from '../services/settingsService';
import { ensureUsableState } from '../services/usableStateService';
import { __setDatabaseForTests } from '../storage/sql/database';
import type { SqlDatabase } from '../storage/sql/SqlDatabase';

// jest.mock calls are hoisted above the imports by babel-jest.
jest.mock('expo-notifications', () => ({
    getPermissionsAsync: jest.fn().mockResolvedValue({ status: 'denied' }),
    requestPermissionsAsync: jest.fn(),
    scheduleNotificationAsync: jest.fn().mockResolvedValue('mock-id'),
    cancelAllScheduledNotificationsAsync: jest.fn().mockResolvedValue(undefined),
    cancelScheduledNotificationAsync: jest.fn().mockResolvedValue(undefined),
    setNotificationChannelAsync: jest.fn().mockResolvedValue(undefined),
    setNotificationHandler: jest.fn(),
    SchedulableTriggerInputTypes: { TIME_INTERVAL: 'timeInterval', DAILY: 'daily' },
    AndroidImportance: { HIGH: 6 },
}));

jest.mock('expo-document-picker', () => ({ getDocumentAsync: jest.fn() }));
jest.mock('expo-sharing', () => ({
    shareAsync: jest.fn().mockResolvedValue(undefined),
    isAvailableAsync: jest.fn().mockResolvedValue(true),
}));

// Inert event bus: no subscriber reloads while a transaction is held open.
jest.mock('../../core/events/dataEvents', () => ({
    dataEvents: {
        emit: jest.fn(),
        emitMultiple: jest.fn(),
        subscribe: jest.fn(() => jest.fn()),
    },
}));

const ISO = '2026-01-01T00:00:00.000Z';
const CASH = 'w-cash';
const BANK = 'w-bank';

const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

/** Local noon `days` from today, so a rule's due days do not depend on the zone. */
const localNoon = (days: number): Date => {
    const d = new Date();
    d.setHours(12, 0, 0, 0);
    d.setDate(d.getDate() + days);
    return d;
};

const categories = [
    { id: 'food', name: 'Food', type: CategoryType.EXPENSE },
    { id: 'salary', name: 'Salary', type: CategoryType.INCOME },
];

/** One valid transaction first, then one the domain validator refuses. */
const refusedTransactions = [
    {
        id: 't-exp',
        type: TransactionType.EXPENSE,
        amount: 15000,
        categoryId: 'food',
        walletId: CASH,
        date: ISO,
        createdAt: ISO,
    },
    {
        id: 't-bad',
        type: TransactionType.EXPENSE,
        amount: -5000,
        categoryId: 'food',
        walletId: CASH,
        date: ISO,
        createdAt: ISO,
    },
];

/** A current-format file refused on its second transaction. */
const v2RefusedMidway = (): BackupSnapshot => ({
    version: CURRENT_SCHEMA_VERSION,
    createdAt: ISO,
    appVersion: '1.0.0',
    data: {
        wallets: [{ id: CASH, name: 'Cash', balance: 85000, type: WalletType.CASH, createdAt: ISO }],
        transactions: refusedTransactions,
        categories,
        budgets: [],
        recurringRules: [],
        settings: getDefaultSettings(),
    },
});

/**
 * A v1 file refused on its second transaction. A v1 file carries no rules, so
 * the restore leaves the recurring_rules table as it found it, and carries the
 * same two wallets as the live install.
 */
const v1RefusedMidway = (): BackupSnapshot =>
    ({
        version: 1,
        createdAt: ISO,
        appVersion: '1.0.0',
        data: {
            wallets: [
                { id: CASH, name: 'Cash', balance: 85000, type: WalletType.CASH, createdAt: ISO },
                { id: BANK, name: 'Bank', balance: 20000, type: WalletType.BANK, createdAt: ISO },
            ],
            transactions: refusedTransactions,
            categories,
            budgets: [],
            settings: getDefaultSettings(),
        },
    }) as unknown as BackupSnapshot;

const ruleDto = (overrides: Partial<CreateRecurringTransactionDTO> = {}): CreateRecurringTransactionDTO => ({
    type: TransactionType.INCOME,
    amount: 1000,
    walletId: CASH,
    categoryId: 'salary',
    description: 'Pay',
    // Nothing due: no catch-up runs before a pause.
    startDate: localNoon(10),
    frequency: RecurrenceFrequency.DAILY,
    interval: 1,
    ...overrides,
});

/** The engine's dependencies, assembled as the rules screen assembles them. */
const engineDeps = (): RecurringEngineDeps => ({
    recurringRepo: container.recurringTransactionRepository,
    transactionRepo: container.transactionRepository,
    walletRepo: container.walletRepository,
    categoryRepo: container.categoryRepository,
    eventBus: { emit: jest.fn(), emitMultiple: jest.fn() },
    runInTransaction: getUseCaseDeps().runInTransaction,
});

let inner: SqlDatabase;

/** Point the production DI container at `db`. */
function use(db: SqlDatabase): void {
    __setDatabaseForTests(db);
    container.reset();
}

async function renderRules() {
    const hook = renderHook(() => useRecurringRules());
    await waitFor(() => expect(hook.result.current.loading).toBe(false));
    return hook;
}

/** Either durably present, or rejected with an error - never reported as saved and then lost. */
function expectNeverSavedThenLost(outcome: PromiseSettledResult<unknown>, persisted: boolean): void {
    const reportedSaved = outcome.status === 'fulfilled';
    expect({ reportedSaved, persisted }).not.toEqual({ reportedSaved: true, persisted: false });
    expect(outcome.status === 'fulfilled' || outcome.reason instanceof Error).toBe(true);
}

async function ruleRow(id: string) {
    const { rows } = await inner.execute('SELECT id, is_paused, description FROM recurring_rules WHERE id = ?', [id]);
    return rows[0];
}

/**
 * Run `action` while another chain holds a transaction open, then make that
 * transaction throw and roll back. Returns how `action` settled.
 *
 * The action is given a few ticks to issue its statements before the outer
 * transaction fails: a write that does not wait for it lands inside it.
 */
async function duringFailingTransaction<T>(action: () => Promise<T>): Promise<PromiseSettledResult<T>> {
    let fail!: () => void;
    const failing = new Promise<void>((resolve) => {
        fail = resolve;
    });
    let markOpen!: () => void;
    const opened = new Promise<void>((resolve) => {
        markOpen = resolve;
    });
    const outer = Promise.allSettled([
        inner.runInTransaction(async () => {
            await inner.execute('SELECT 1');
            markOpen();
            await failing;
            throw new Error('outer transaction fails');
        }),
    ]);
    await opened;

    const done = Promise.allSettled([action()]);
    await Promise.race([done, (async () => {
        for (let i = 0; i < 5; i++) await flush();
    })()]);

    fail();
    const [outerResult] = await outer;
    expect(outerResult.status).toBe('rejected');
    const [result] = await done;
    return result;
}

async function count(sql: string, params: unknown[] = []): Promise<number> {
    const { rows } = await inner.execute(sql, params);
    return rows.length;
}

beforeEach(async () => {
    jest.clearAllMocks();
    await AsyncStorage.clear();
    // Write guard armed (REGISTRE V-109): every write below and in the
    // production paths under test must run inside a transaction.
    inner = await createTestDb({ writeGuard: true });
    await inner.runInTransaction(async () => {
        await inner.execute(
            `INSERT INTO wallets (id, name, balance, opening_balance, type, color, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?), (?, ?, ?, ?, ?, ?, ?)`,
            [CASH, 'Cash', 50000, 50000, 'cash', null, ISO, BANK, 'Bank', 30000, 30000, 'bank', null, ISO],
        );
        await inner.execute(`INSERT INTO categories (id, name, type) VALUES (?, ?, ?), (?, ?, ?)`, [
            'food', 'Food', 'expense', 'salary', 'Salary', 'income',
        ]);
    });
});

afterEach(() => {
    __setDatabaseForTests(null);
    container.reset();
});

describe('V-109 a. repro A: a wallet created while a restore is open', () => {
    it('V-109 a: a wallet created while a restore is held open is in the ledger after the restore rolls back', async () => {
        const gated = new GatedDatabase(inner, /^\s*INSERT INTO transactions/i);
        use(gated);

        const restore = Promise.allSettled([restoreFromSnapshot(v2RefusedMidway())]);
        await gated.reached;

        // The user creates a wallet from the Wallets tab: useWallets passes
        // getUseCaseDeps() to the use case.
        const created = Promise.allSettled([
            createWallet(getUseCaseDeps(), { name: 'Savings', balance: 12345, type: WalletType.SAVINGS }),
        ]);
        await flush();

        gated.release();
        const [restoreResult] = await restore;
        expect(restoreResult.status).toBe('rejected');
        expect(String((restoreResult as PromiseRejectedResult).reason)).toMatch(/Restore refused/);

        const [createResult] = await created;
        expect(createResult.status).toBe('fulfilled');
        const { rows } = await inner.execute(
            'SELECT name, balance, opening_balance FROM wallets WHERE name = ?',
            ['Savings'],
        );
        expect(rows).toEqual([{ name: 'Savings', balance: 12345, opening_balance: 12345 }]);

        // The refused restore still left the pre-restore wallet as it was.
        const cash = await inner.execute('SELECT balance FROM wallets WHERE id = ?', [CASH]);
        expect(Number(cash.rows[0].balance)).toBe(50000);
    });
});

describe('V-109 b. repro B: a rule deleted during its own catch-up', () => {
    it('V-109 b: a rule deleted while its catch-up holds an occurrence open stays deleted', async () => {
        // A daily rule that started 3 days ago: 4 occurrences are due.
        const rule = await inner.runInTransaction(() =>
            new RecurringTransactionRepository(inner).create(ruleDto({ walletId: BANK, startDate: localNoon(-3) })),
        );

        // Held on the first occurrence's rule-number write, inside its transaction.
        const gated = new GatedDatabase(inner, /^\s*UPDATE recurring_rules SET last_generated_index/i);
        use(gated);
        const { result } = await renderRules();

        const engine = processRecurringRules(engineDeps());
        await gated.reached;

        const deleted = Promise.allSettled([result.current.deleteRule(rule.id)]);
        await flush();

        gated.release();
        await engine;
        const [deleteResult] = await deleted;

        expect(deleteResult.status).toBe('fulfilled');
        expect(await ruleRow(rule.id)).toBeUndefined();
    });
});

describe('V-109 c. a write made while a restore is open, the restore then rolling back', () => {
    it('V-109 c1: a rule created during the restore is never reported saved and then lost', async () => {
        const gated = new GatedDatabase(inner, /^\s*INSERT INTO transactions/i);
        use(gated);
        const { result } = await renderRules();

        const restore = Promise.allSettled([restoreFromSnapshot(v1RefusedMidway())]);
        await gated.reached;

        const created = Promise.allSettled([result.current.createRule(ruleDto())]);
        await flush();
        gated.release();
        expect((await restore)[0].status).toBe('rejected');

        const [outcome] = await created;
        const { rows } = await inner.execute('SELECT id FROM recurring_rules WHERE description = ?', ['Pay']);
        expectNeverSavedThenLost(outcome, rows.length === 1);
    });

    it('V-109 c2: a rule paused during the restore is never reported paused and then active again', async () => {
        const rule = await inner.runInTransaction(() => new RecurringTransactionRepository(inner).create(ruleDto()));
        const gated = new GatedDatabase(inner, /^\s*INSERT INTO transactions/i);
        use(gated);
        const { result } = await renderRules();

        const restore = Promise.allSettled([restoreFromSnapshot(v1RefusedMidway())]);
        await gated.reached;

        const paused = Promise.allSettled([result.current.pauseRule(rule.id)]);
        await flush();
        gated.release();
        expect((await restore)[0].status).toBe('rejected');

        const [outcome] = await paused;
        expectNeverSavedThenLost(outcome, Number((await ruleRow(rule.id))?.is_paused) === 1);
    });

    it('V-109 c3: a rule resumed during the restore is never reported resumed and then paused again', async () => {
        const rule = await inner.runInTransaction(async () => {
            const repo = new RecurringTransactionRepository(inner);
            const created = await repo.create(ruleDto());
            return repo.pauseRule(created.id);
        });
        const gated = new GatedDatabase(inner, /^\s*INSERT INTO transactions/i);
        use(gated);
        const { result } = await renderRules();

        const restore = Promise.allSettled([restoreFromSnapshot(v1RefusedMidway())]);
        await gated.reached;

        const resumed = Promise.allSettled([result.current.resumeRule(rule.id)]);
        await flush();
        gated.release();
        expect((await restore)[0].status).toBe('rejected');

        const [outcome] = await resumed;
        expectNeverSavedThenLost(outcome, Number((await ruleRow(rule.id))?.is_paused) === 0);
    });

    it('V-109 c4: a wallet deleted during the restore is never reported deleted and then back', async () => {
        const gated = new GatedDatabase(inner, /^\s*INSERT INTO transactions/i);
        use(gated);

        const restore = Promise.allSettled([restoreFromSnapshot(v1RefusedMidway())]);
        await gated.reached;

        // EditWalletModal -> useWallets passes getUseCaseDeps() to the use case.
        const deleted = Promise.allSettled([deleteWallet(getUseCaseDeps(), BANK)]);
        await flush();
        gated.release();
        expect((await restore)[0].status).toBe('rejected');

        const [outcome] = await deleted;
        const { rows } = await inner.execute('SELECT id FROM wallets WHERE id = ?', [BANK]);
        expectNeverSavedThenLost(outcome, rows.length === 0);
    });
});

describe('V-109 c. every other wrapped write, while another chain holds a transaction that rolls back', () => {
    beforeEach(() => {
        use(inner);
    });

    it('V-109 c5: a wallet edit (useWallets.updateWallet) is never reported saved and then lost', async () => {
        const { result } = renderHook(() => useWallets());
        await waitFor(() => expect(result.current.loading).toBe(false));

        const outcome = await duringFailingTransaction(() => result.current.updateWallet({ id: CASH, name: 'Main' }));

        expectNeverSavedThenLost(outcome, (await count('SELECT id FROM wallets WHERE name = ?', ['Main'])) === 1);
    });

    it('V-109 c6: a category create (useCategories.createCategory) is never reported saved and then lost', async () => {
        const { result } = renderHook(() => useCategories());
        await waitFor(() => expect(result.current.loading).toBe(false));

        const outcome = await duringFailingTransaction(() =>
            result.current.createCategory({ name: 'Rent', type: CategoryType.EXPENSE }),
        );

        expectNeverSavedThenLost(outcome, (await count('SELECT id FROM categories WHERE name = ?', ['Rent'])) === 1);
    });

    it('V-109 c7: a category edit (useCategories.updateCategory) is never reported saved and then lost', async () => {
        const { result } = renderHook(() => useCategories());
        await waitFor(() => expect(result.current.loading).toBe(false));

        const outcome = await duringFailingTransaction(() =>
            result.current.updateCategory({ id: 'food', name: 'Groceries' }),
        );

        expectNeverSavedThenLost(outcome, (await count('SELECT id FROM categories WHERE name = ?', ['Groceries'])) === 1);
    });

    it('V-109 c8: a category delete (useCategories.deleteCategory) is never reported deleted and then back', async () => {
        const { result } = renderHook(() => useCategories());
        await waitFor(() => expect(result.current.loading).toBe(false));

        const outcome = await duringFailingTransaction(() => result.current.deleteCategory('salary'));

        expectNeverSavedThenLost(outcome, (await count('SELECT id FROM categories WHERE id = ?', ['salary'])) === 0);
    });

    it('V-109 c9: a budget create (useBudgets.createBudget) is never reported saved and then lost', async () => {
        const { result } = renderHook(() => useBudgets());
        await waitFor(() => expect(result.current.loading).toBe(false));

        const outcome = await duringFailingTransaction(() =>
            result.current.createBudget({ categoryId: 'food', month: getCurrentMonth(), limitAmount: 5000 }),
        );

        expectNeverSavedThenLost(outcome, (await count('SELECT id FROM budgets WHERE limit_amount = ?', [5000])) === 1);
    });

    it('V-109 c10: a budget edit (useBudgets.updateBudget) is never reported saved and then lost', async () => {
        const budget = await inner.runInTransaction(() =>
            new BudgetRepository(inner).create({ categoryId: 'food', month: getCurrentMonth(), limitAmount: 5000 }),
        );
        const { result } = renderHook(() => useBudgets());
        await waitFor(() => expect(result.current.loading).toBe(false));

        const outcome = await duringFailingTransaction(() =>
            result.current.updateBudget({ id: budget.id, limitAmount: 7000 }),
        );

        expectNeverSavedThenLost(outcome, (await count('SELECT id FROM budgets WHERE limit_amount = ?', [7000])) === 1);
    });

    it('V-109 c11: a budget delete (useBudgets.deleteBudget) is never reported deleted and then back', async () => {
        const budget = await inner.runInTransaction(() =>
            new BudgetRepository(inner).create({ categoryId: 'food', month: getCurrentMonth(), limitAmount: 5000 }),
        );
        const { result } = renderHook(() => useBudgets());
        await waitFor(() => expect(result.current.loading).toBe(false));

        const outcome = await duringFailingTransaction(() => result.current.deleteBudget(budget.id));

        expectNeverSavedThenLost(outcome, (await count('SELECT id FROM budgets WHERE id = ?', [budget.id])) === 0);
    });

    it('V-109 c12: a rule edit (useRecurringRules.updateRule) is never reported saved and then lost', async () => {
        const rule = await inner.runInTransaction(() => new RecurringTransactionRepository(inner).create(ruleDto()));
        const { result } = await renderRules();

        const outcome = await duringFailingTransaction(() =>
            result.current.updateRule({ id: rule.id, description: 'Rent' }),
        );

        expectNeverSavedThenLost(outcome, (await ruleRow(rule.id))?.description === 'Rent');
    });

    it('V-109 c13: the onboarding wallet (useOnboarding.createWallet) is never reported created and then lost', async () => {
        const { result } = renderHook(() => useOnboarding());

        const outcome = await duringFailingTransaction(() => result.current.createWallet('Main', 'cash', 0));

        expectNeverSavedThenLost(outcome, (await count('SELECT id FROM wallets WHERE name = ?', ['Main'])) === 1);
    });

    it('V-109 c14: the seeded default categories (initializeSeedData) are never reported seeded and then lost', async () => {
        const outcome = await duringFailingTransaction(() => initializeSeedData());

        const seeded = await count(
            `SELECT id FROM categories WHERE name IN (${defaultCategories.map(() => '?').join(', ')})`,
            defaultCategories.map((c) => c.name),
        );
        expectNeverSavedThenLost(outcome, seeded === defaultCategories.length);
    });

    it('V-109 c15: the usable state (ensureUsableState) is never reported repaired and then lost', async () => {
        await inner.runInTransaction(async () => {
            await inner.execute('DELETE FROM wallets');
            await inner.execute('DELETE FROM categories');
        });

        const outcome = await duringFailingTransaction(() => ensureUsableState());

        const repaired =
            (await count('SELECT id FROM wallets')) === 1 &&
            (await count('SELECT id FROM categories')) === defaultCategories.length;
        expectNeverSavedThenLost(outcome, repaired);
    });
});

describe('V-109 control: the same writes with nothing else in flight', () => {
    it('control: with no restore in flight, a wallet created through createWallet is in the ledger', async () => {
        use(inner);

        const wallet = await createWallet(getUseCaseDeps(), { name: 'Savings', balance: 12345, type: WalletType.SAVINGS });

        const { rows } = await inner.execute('SELECT balance, opening_balance FROM wallets WHERE id = ?', [wallet.id]);
        expect(rows).toEqual([{ balance: 12345, opening_balance: 12345 }]);
    });

    it('control: a rule deleted while no catch-up is running stays deleted', async () => {
        const rule = await inner.runInTransaction(() => new RecurringTransactionRepository(inner).create(ruleDto()));
        use(inner);
        const { result } = await renderRules();

        await result.current.deleteRule(rule.id);

        expect(await ruleRow(rule.id)).toBeUndefined();
    });
});
