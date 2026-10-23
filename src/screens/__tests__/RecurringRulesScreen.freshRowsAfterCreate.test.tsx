/**
 * RecurringRulesScreen - statuses after a create are computed from fresh rows
 * (pass 80, finding 3)
 *
 * The engine run after a create covers every active rule, so it can advance
 * another rule's last generated number and debit its wallet. The engine emits
 * 'recurringRules' only for a skipped rule; for a generated occurrence it emits
 * 'transactions' and 'wallets'. The wallets were read again and the rules were
 * not: the other rule's status was priced from its row as loaded before the
 * run - occurrences already recorded still counted as due - against the
 * debited balance, and it could read "Not enough funds" wrongly.
 *
 * The real screen, form, hooks and engine run over an in-memory database, as
 * in RecurringRulesScreen.v111Outcome.test.tsx. The forcing - the other rule's
 * stored row advanced by the run, its wallet debited, no rule skipped - is
 * asserted on the database and the alert before the statuses.
 *
 * `t` echoes the key and its parameters. Dates are local and relative to the
 * real clock, so the suite holds in whatever zone the process runs in (run
 * under TZ=UTC, Africa/Lagos, America/New_York).
 */

import { fireEvent, render, waitFor } from '@testing-library/react-native';
import React from 'react';
import { Alert } from 'react-native';

import { createTestDb } from '../../../tests/helpers/createTestDb';
import { pressOnce, settle, type RenderedNode } from '../../../tests/helpers/pressInOneBatch';
import { container } from '../../core/di/container';
import { __setDatabaseForTests } from '../../data/storage/sql/database';
import type { SqlDatabase } from '../../data/storage/sql/SqlDatabase';
import { CategoryType, RecurrenceFrequency, TransactionType, WalletType } from '../../domain/entities';
import { RecurringRulesScreen } from '../RecurringRulesScreen';

jest.mock('react-native-safe-area-context', () => ({
    useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.mock('expo-router', () => ({
    useRouter: () => ({ back: jest.fn(), push: jest.fn() }),
}));

jest.mock('react-i18next', () => ({
    ...jest.requireActual('react-i18next'),
    useTranslation: () => ({
        t: (key: string, params?: Record<string, unknown>) =>
            params === undefined ? key : `${key} ${JSON.stringify(params)}`,
        i18n: { language: 'en' },
    }),
}));

// Whole numbers of major units; one major unit is 100 minor units.
jest.mock('../../hooks/useFormatting', () => {
    const pad = (n: number) => String(n).padStart(2, '0');
    return {
        useFormatting: () => ({
            formatAmount: (v: number) => `amt:${v}`,
            formatDate: (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
            centsToMajor: (v: number) => v / 100,
            parseAmountToCentsResult: (v: string) =>
                /^\d+$/.test(v) && Number(v) > 0
                    ? { ok: true, value: Number(v) * 100 }
                    : { ok: false, cause: v === '' ? 'empty' : 'notANumber' },
            amountPlaceholder: '0.00',
            decimals: 2,
        }),
    };
});

const BANK = 'w-bank';
const CASH = 'w-cash';
const CATEGORY = 'cat-rent';

const pad = (n: number) => String(n).padStart(2, '0');
const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** Local noon today. */
function todayNoon(): Date {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12, 0);
}

let base: SqlDatabase;

/** A bank wallet, a cash wallet holding 1500, and one category. */
async function seed(): Promise<void> {
    __setDatabaseForTests(base);
    container.reset();
    await base.runInTransaction(async () => {
        await container.walletRepository.save({
            id: BANK,
            name: 'Bank',
            balance: 1000000,
            type: WalletType.BANK,
            createdAt: new Date(2026, 0, 1),
        });
        // The funds guard covers cash wallets: 1500 pays one debit of 1000,
        // and after it the 500 left does not pay another.
        await container.walletRepository.save({
            id: CASH,
            name: 'Cash',
            balance: 1500,
            type: WalletType.CASH,
            createdAt: new Date(2026, 0, 1),
        });
        await container.categoryRepository.save({
            id: CATEGORY,
            name: 'Rent',
            type: CategoryType.EXPENSE,
            icon: 'home-outline',
            color: '#FF5722',
        });
    });
}

/** A daily expense of 1000 on the cash wallet from today, nothing generated yet. */
function seedGymOnCash() {
    return base.runInTransaction(() => container.recurringTransactionRepository.create({
        type: TransactionType.EXPENSE,
        amount: 1000,
        walletId: CASH,
        categoryId: CATEGORY,
        description: 'Gym',
        startDate: todayNoon(),
        frequency: RecurrenceFrequency.DAILY,
        interval: 1,
    }));
}

async function storedIndex(ruleId: string): Promise<number> {
    const { rows } = await base.execute('SELECT last_generated_index FROM recurring_rules WHERE id = ?', [ruleId]);
    return Number(rows[0].last_generated_index);
}

async function cashBalance(): Promise<number> {
    const { rows } = await base.execute('SELECT balance FROM wallets WHERE id = ?', [CASH]);
    return Number(rows[0].balance);
}

async function rowDays(ruleId: string): Promise<string[]> {
    const { rows } = await base.execute(
        'SELECT date FROM transactions WHERE recurring_rule_id = ? ORDER BY date',
        [ruleId],
    );
    return rows.map((row) => ymd(new Date(String(row.date))));
}

/** Whether `element` is rendered inside the form's page sheet. */
function insideFormSheet(element: RenderedNode): boolean {
    for (let node: RenderedNode | null = element; node !== null; node = node.parent) {
        if (node.props.presentationStyle === 'pageSheet') return true;
    }
    return false;
}

/**
 * Create a rule on the bank wallet through the form, from the add button. The
 * form starts it today, monthly, so its occurrence 0 is due today.
 */
async function createOnBank(screen: ReturnType<typeof render>) {
    fireEvent.press(await screen.findByLabelText('a11y.addRecurringRule'));
    fireEvent.press(await screen.findByText('recurring.selectWallet'));
    fireEvent.press(await screen.findByText('Bank'));
    fireEvent.press(screen.getByText('recurring.selectCategory'));
    fireEvent.press(await screen.findByText('Rent'));
    fireEvent.changeText(screen.getByPlaceholderText('0.00'), '50');

    const inSheet = screen.getAllByText('recurring.createRule').filter(insideFormSheet);
    expect(inSheet).toHaveLength(1);
    pressOnce(inSheet[0]);
}

/** The first alert, once the run and the refreshes it set off have settled. */
async function firstAlert(): Promise<[string, string]> {
    const calls = (Alert.alert as jest.Mock).mock.calls;
    await waitFor(() => expect(calls.length).toBeGreaterThanOrEqual(1));
    await settle();
    return [calls[0][0], calls[0][1]];
}

beforeEach(async () => {
    jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    // The engine reports every run on the console.
    jest.spyOn(console, 'log').mockImplementation(() => undefined);
    jest.spyOn(console, 'info').mockImplementation(() => undefined);
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    base = await createTestDb({ writeGuard: true });
    await seed();
});

afterEach(() => {
    jest.restoreAllMocks();
    __setDatabaseForTests(null);
    container.reset();
});

describe('pass 80 finding 3: after a create, every status is computed from the stored rows', () => {
    it('c. the create\'s run records another rule\'s due debit: that rule is not shown "Not enough funds" from its old row', async () => {
        const gym = await seedGymOnCash();

        const screen = render(<RecurringRulesScreen />);
        await screen.findByText('Gym');
        // As loaded: nothing generated (number -1), one debit of 1000 due
        // today, 1500 in the wallet.
        await waitFor(() => expect(screen.getAllByText('recurring.statusActive')).toHaveLength(1));
        expect(await storedIndex(gym.id)).toBe(-1);

        await createOnBank(screen);
        const [title, message] = await firstAlert();

        // The forcing: the run recorded Gym's debit, moved its stored number
        // past it and debited the wallet; it skipped no rule, so the engine
        // emitted no 'recurringRules'.
        expect(await rowDays(gym.id)).toEqual([ymd(new Date())]);
        expect(await storedIndex(gym.id)).toBe(0);
        expect(await cashBalance()).toBe(500);
        expect([title, message]).toEqual([
            'recurring.ruleCreated',
            'recurring.ruleCreatedMessage ' + JSON.stringify({ count: 1 }),
        ]);

        // Nothing is due for Gym any more; the new rule's debit is recorded too.
        expect(screen.queryByText('recurring.statusInsufficientFunds')).toBeNull();
        expect(screen.getAllByText('recurring.statusActive')).toHaveLength(2);
    });
});
