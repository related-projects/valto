/**
 * V-128: the write paths refuse an entered amount above the cap
 *
 * Pass 87 audit. Nothing below the screens bounded an amount either: a budget
 * limit took Infinity, and a transaction, a rule or an opening balance of any
 * finite size was stored, however far past Number.MAX_SAFE_INTEGER. The owner
 * capped every entered amount at 999 999 999 999 minor units (decision 1,
 * 04/11) and kept restore and migration v5 out of it.
 *
 * So the guard sits on the paths a new amount comes in by - create, and the
 * edits that change an amount - and not in the entity validators, which the
 * restore calls as well. Each path refuses the cap plus one, Infinity and NaN
 * and leaves every table as it was, and stores the cap itself exactly.
 *
 * Minor units carry no currency, so the cases hold for XOF and for a 2-decimal
 * currency alike; the screens' suites cover both.
 *
 * Tests named "control" pass on the code before the fix: the cap was stored
 * exactly, Infinity and NaN were already refused by the transaction, wallet
 * and rule validators, a transfer of Infinity by the funds check and of NaN by
 * `wallets.balance NOT NULL` (the NaN is bound as NULL), and a NaN budget
 * limit by `budgets.limit_amount NOT NULL`.
 *
 * Real here: the use cases, the repositories and the runner, over
 * BetterSqliteDatabase.
 */

import { CAP_MINOR } from '../../../tests/helpers/amountCapCases';
import { createTestDb } from '../../../tests/helpers/createTestDb';
import { pinClock, restoreZoneClock } from '../../../tests/helpers/zoneClock';
import { container, getUseCaseDeps } from '../../core/di/container';
import { getCurrentMonth } from '../../domain/entities/Budget';
import { CategoryType } from '../../domain/entities/Category';
import { RecurrenceFrequency } from '../../domain/entities/RecurringTransaction';
import { TransactionType } from '../../domain/entities/Transaction';
import { WalletType } from '../../domain/entities/Wallet';
import { createTransaction } from '../../domain/useCases/createTransaction';
import { createWallet } from '../../domain/useCases/createWallet';
import { transferFunds } from '../../domain/useCases/transferFunds';
import { editRecurringRule } from '../services/recurringRuleChanges';
import { __setDatabaseForTests } from '../storage/sql/database';
import type { SqlDatabase } from '../storage/sql/SqlDatabase';

jest.mock('../../core/events', () => ({
    dataEvents: { emit: jest.fn(), emitMultiple: jest.fn(), subscribe: () => () => undefined },
}));

/** Mid-month, so the local month is the same in every zone the suite runs in. */
const NOW = Date.UTC(2026, 10, 15, 12, 0, 0);

const OVER = CAP_MINOR + 1;

/** Refused only by the new guard: the cap plus one is a finite, non-negative integer. */
const REGRESSION: [string, number][] = [['the cap plus one', OVER]];

/** Already refused by the entity validators before the fix. */
const NON_FINITE: [string, number][] = [['Infinity', Infinity], ['NaN', NaN]];

let db: SqlDatabase;

/** Every table, row by row, as stored. */
async function tables() {
    const all = async (table: string) => (await db.execute(`SELECT * FROM ${table} ORDER BY id`)).rows;
    return {
        wallets: await all('wallets'),
        transactions: await all('transactions'),
        budgets: await all('budgets'),
        rules: await all('recurring_rules'),
    };
}

async function walletAndCategory(balance = 100000) {
    const deps = getUseCaseDeps();
    const cash = await createWallet(deps, { name: 'Cash', balance, type: WalletType.BANK });
    const food = await deps.runInTransaction(() =>
        container.categoryRepository.create({ name: 'Food', type: CategoryType.EXPENSE }));
    const salary = await deps.runInTransaction(() =>
        container.categoryRepository.create({ name: 'Salary', type: CategoryType.INCOME }));
    return { cash, food, salary };
}

/** `attempt` is refused and no table changes. */
async function expectRefusedAndNothingWritten(attempt: () => Promise<unknown>) {
    const before = await tables();
    // Not `.rejects.toThrow()`: a refusal can come from SQLite itself (a NaN is
    // bound as NULL), and jest counts a rejection as thrown only when it
    // recognises the value as an Error. better-sqlite3's SqliteError is tagged
    // [object Object], and in a worker it failed `instanceof Error` as well.
    let refused = false;
    await attempt().catch(() => {
        refused = true;
    });
    expect(refused).toBe(true);
    expect(await tables()).toEqual(before);
}

beforeEach(async () => {
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    pinClock(NOW);
    db = await createTestDb({ writeGuard: true });
    __setDatabaseForTests(db);
    container.reset();
});

afterEach(() => {
    jest.restoreAllMocks();
    restoreZoneClock();
    __setDatabaseForTests(null);
    container.reset();
});

describe('V-128 a. a transaction (createTransaction)', () => {
    const attempt = async (amount: number) => {
        const { cash, food } = await walletAndCategory();
        await expectRefusedAndNothingWritten(() => createTransaction(getUseCaseDeps(), {
            type: TransactionType.EXPENSE, amount, categoryId: food.id, walletId: cash.id, date: new Date(NOW),
        }));
    };

    it.each(REGRESSION)('V-128 a. %s is refused and nothing is written', async (_label, amount) => {
        await attempt(amount);
    });

    it.each(NON_FINITE)('control: %s is refused and nothing is written', async (_label, amount) => {
        await attempt(amount);
    });

    it('control: the cap is stored and read back exactly', async () => {
        const { cash, salary } = await walletAndCategory(0);
        const tx = await createTransaction(getUseCaseDeps(), {
            type: TransactionType.INCOME, amount: CAP_MINOR, categoryId: salary.id, walletId: cash.id, date: new Date(NOW),
        });

        expect((await container.transactionRepository.getById(tx.id))?.amount).toBe(CAP_MINOR);
        expect((await container.walletRepository.getById(cash.id))?.balance).toBe(CAP_MINOR);
    });
});

describe('V-128 b. a transfer (transferFunds)', () => {
    /** A source holding more than the cap, reached the way the app reaches it: income on a capped balance. */
    async function fundedPair() {
        const deps = getUseCaseDeps();
        const { cash: source, salary } = await walletAndCategory(CAP_MINOR);
        await createTransaction(deps, {
            type: TransactionType.INCOME, amount: 2, categoryId: salary.id, walletId: source.id, date: new Date(NOW),
        });
        const dest = await createWallet(deps, { name: 'Savings', balance: 0, type: WalletType.SAVINGS });
        expect((await container.walletRepository.getById(source.id))?.balance).toBe(CAP_MINOR + 2);
        return { source, dest };
    }

    const attempt = async (amount: number) => {
        const { source, dest } = await fundedPair();
        await expectRefusedAndNothingWritten(() =>
            transferFunds(getUseCaseDeps(), { fromWalletId: source.id, toWalletId: dest.id, amount }));
    };

    it.each(REGRESSION)('V-128 b. %s is refused and nothing is written', async (_label, amount) => {
        await attempt(amount);
    });

    it.each(NON_FINITE)('control: %s is refused and nothing is written', async (_label, amount) => {
        await attempt(amount);
    });

    it('control: the cap is moved and both legs are stored exactly', async () => {
        const { source, dest } = await fundedPair();
        await transferFunds(getUseCaseDeps(), { fromWalletId: source.id, toWalletId: dest.id, amount: CAP_MINOR });

        const legs = (await container.transactionRepository.getAll()).filter((t) => t.type === TransactionType.TRANSFER);
        expect(legs.map((t) => t.amount)).toEqual([CAP_MINOR, CAP_MINOR]);
        expect((await container.walletRepository.getById(source.id))?.balance).toBe(2);
        expect((await container.walletRepository.getById(dest.id))?.balance).toBe(CAP_MINOR);
    });
});

describe('V-128 c. a wallet opening balance (createWallet, and the onboarding path)', () => {
    const viaUseCase = (balance: number) => () =>
        createWallet(getUseCaseDeps(), { name: 'Cash', balance, type: WalletType.BANK });
    // useOnboarding.ts writes through the repository directly, not the use case.
    const viaOnboarding = (balance: number) => () =>
        getUseCaseDeps().runInTransaction(() =>
            container.walletRepository.create({ name: 'Main', balance, type: WalletType.BANK }));

    it.each(REGRESSION)('V-128 c. %s is refused and nothing is written', async (_label, balance) => {
        await expectRefusedAndNothingWritten(viaUseCase(balance));
        await expectRefusedAndNothingWritten(viaOnboarding(balance));
    });

    it('V-128 c. an overdraft past the cap on the onboarding path is refused and nothing is written', async () => {
        await expectRefusedAndNothingWritten(viaOnboarding(-OVER));
    });

    it.each(NON_FINITE)('control: %s is refused and nothing is written', async (_label, balance) => {
        await expectRefusedAndNothingWritten(viaUseCase(balance));
        await expectRefusedAndNothingWritten(viaOnboarding(balance));
    });

    it('control: the cap is stored as balance and opening balance exactly', async () => {
        const fromUseCase = await viaUseCase(CAP_MINOR)();
        const fromOnboarding = await viaOnboarding(CAP_MINOR)();

        const { rows } = await db.execute('SELECT id, balance, opening_balance FROM wallets ORDER BY id');
        expect(rows.map((r) => [r.id, Number(r.balance), Number(r.opening_balance)])).toEqual(
            [[fromUseCase.id, CAP_MINOR, CAP_MINOR], [fromOnboarding.id, CAP_MINOR, CAP_MINOR]]
                .sort((a, b) => String(a[0]).localeCompare(String(b[0]))),
        );
    });
});

describe('V-128 d. a recurring rule (create, and edit through editRecurringRule)', () => {
    async function ruleDTO(amount: number) {
        const { cash, food } = await walletAndCategory();
        return {
            type: TransactionType.EXPENSE, amount, walletId: cash.id, categoryId: food.id,
            startDate: new Date(2030, 0, 15), frequency: RecurrenceFrequency.MONTHLY, interval: 1,
        };
    }

    const create = (dto: Awaited<ReturnType<typeof ruleDTO>>) =>
        getUseCaseDeps().runInTransaction(() => container.recurringTransactionRepository.create(dto));

    async function existingRule() {
        return create(await ruleDTO(4500));
    }

    // The deps useRecurringRules hands the edit: the concrete repositories.
    const edit = (id: string, amount: number) => () => editRecurringRule({
        recurringRepo: container.recurringTransactionRepository,
        transactionRepo: container.transactionRepository,
        walletRepo: container.walletRepository,
        categoryRepo: container.categoryRepository,
        eventBus: getUseCaseDeps().eventBus,
        runInTransaction: getUseCaseDeps().runInTransaction,
    }, { id, amount });

    it.each(REGRESSION)('V-128 d. create: %s is refused and nothing is written', async (_label, amount) => {
        const dto = await ruleDTO(amount);
        await expectRefusedAndNothingWritten(() => create(dto));
    });

    it.each(REGRESSION)('V-128 d. edit: %s is refused and the rule is unchanged', async (_label, amount) => {
        const rule = await existingRule();
        await expectRefusedAndNothingWritten(edit(rule.id, amount));
    });

    it.each(NON_FINITE)('control: create: %s is refused and nothing is written', async (_label, amount) => {
        const dto = await ruleDTO(amount);
        await expectRefusedAndNothingWritten(() => create(dto));
    });

    it.each(NON_FINITE)('control: edit: %s is refused and the rule is unchanged', async (_label, amount) => {
        const rule = await existingRule();
        await expectRefusedAndNothingWritten(edit(rule.id, amount));
    });

    it('control: the cap is stored exactly, on create and on edit', async () => {
        const created = await create(await ruleDTO(CAP_MINOR));
        expect((await container.recurringTransactionRepository.getById(created.id))?.amount).toBe(CAP_MINOR);

        const other = await create({ ...(await ruleDTO(4500)), startDate: new Date(2031, 0, 15) });
        await edit(other.id, CAP_MINOR)();
        expect((await container.recurringTransactionRepository.getById(other.id))?.amount).toBe(CAP_MINOR);
    });
});

describe('V-128 e. a budget limit (create and edit, as useBudgets writes them)', () => {
    async function rentCategory() {
        return getUseCaseDeps().runInTransaction(() =>
            container.categoryRepository.create({ name: 'Rent', type: CategoryType.EXPENSE }));
    }

    const create = (categoryId: string, limitAmount: number) => () =>
        getUseCaseDeps().runInTransaction(() =>
            container.budgetRepository.create({ categoryId, month: getCurrentMonth(), limitAmount }));

    const update = (id: string, limitAmount: number) => () =>
        getUseCaseDeps().runInTransaction(() => container.budgetRepository.updateFromDTO({ id, limitAmount }));

    // Before the fix only `limitAmount <= 0` was checked, so all three reach the
    // insert. There the cap plus one and Infinity were stored; NaN was bound as
    // NULL and failed `limit_amount INTEGER NOT NULL`, so it was refused already.
    const STORED_BEFORE: [string, number][] = [...REGRESSION, ['Infinity', Infinity]];

    it.each(STORED_BEFORE)('V-128 e. create: %s is refused and nothing is written', async (_label, limit) => {
        const rent = await rentCategory();
        await expectRefusedAndNothingWritten(create(rent.id, limit));
    });

    it.each(STORED_BEFORE)('V-128 e. edit: %s is refused and the limit is unchanged', async (_label, limit) => {
        const rent = await rentCategory();
        const budget = await create(rent.id, 50000)();
        await expectRefusedAndNothingWritten(update(budget.id, limit));
    });

    it('control: create: NaN is refused and nothing is written', async () => {
        const rent = await rentCategory();
        await expectRefusedAndNothingWritten(create(rent.id, NaN));
    });

    it('control: edit: NaN is refused and the limit is unchanged', async () => {
        const rent = await rentCategory();
        const budget = await create(rent.id, 50000)();
        await expectRefusedAndNothingWritten(update(budget.id, NaN));
    });

    it('control: the cap is stored exactly, on create and on edit', async () => {
        const rent = await rentCategory();
        const created = await create(rent.id, CAP_MINOR)();
        expect((await container.budgetRepository.getById(created.id))?.limitAmount).toBe(CAP_MINOR);

        await update(created.id, 50000)();
        await update(created.id, CAP_MINOR)();
        expect((await container.budgetRepository.getById(created.id))?.limitAmount).toBe(CAP_MINOR);
    });
});
