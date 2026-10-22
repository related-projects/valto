/**
 * RecurringRulesScreen - what is shown after a create or an edit is what happened
 *
 * REGISTRE V-111, Owner decisions 1 to 3 of pass 79.
 *  1. After a create the engine still runs on every active rule, but the alert
 *     reports the new rule only, and names its debits that were not recorded.
 *     It used to report the whole run: another rule's funds refusal or debits
 *     were reported as the new rule's, and a failed write read "Transactions
 *     will be generated on the next due date".
 *  2. An edit whose catch-up fails names the dates not recorded, as the pause
 *     does. It used to reach the form's generic save failure.
 *  3. A rule whose last engine run failed shows a fault until a later run
 *     succeeds. It used to read Active.
 *
 * The real screen, form, hooks and engine run over an in-memory database, as
 * in RecurringRulesScreen.submitLock.test.tsx. A failed write is injected with
 * FaultInjectingDatabase; the restart limit (V-115) is forced with
 * EverChangingRuleDatabase. Each case first asserts the forcing took place, on
 * the database, before it asserts what the user is shown.
 *
 * `t` echoes the key and its parameters. Dates are local and relative to the
 * real clock, and formatted with local getters, so the suite holds in whatever
 * zone the process runs in (run under TZ=UTC, Africa/Lagos, America/New_York).
 */

import { fireEvent, render, waitFor } from '@testing-library/react-native';
import React from 'react';
import { Alert } from 'react-native';

import { createTestDb } from '../../../tests/helpers/createTestDb';
import { EverChangingRuleDatabase } from '../../../tests/helpers/EverChangingRuleDatabase';
import { FaultInjectingDatabase } from '../../../tests/helpers/FaultInjectingDatabase';
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

/** Local noon `daysAgo` days before today. */
function daysAgo(days: number): Date {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate() - days, 12, 0);
}

/** The connection the app runs on in this case: the test database, or a decorator over it. */
let db: SqlDatabase;
/** The undecorated test database, for the assertions. */
let base: SqlDatabase;

async function useDatabase(database: SqlDatabase): Promise<void> {
    db = database;
    __setDatabaseForTests(db);
    container.reset();
    await db.runInTransaction(async () => {
        await container.walletRepository.save({
            id: BANK,
            name: 'Bank',
            balance: 1000000,
            type: WalletType.BANK,
            createdAt: new Date(2026, 0, 1),
        });
        // The funds guard covers cash wallets; an empty one refuses any debit.
        await container.walletRepository.save({
            id: CASH,
            name: 'Cash',
            balance: 0,
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

/** A daily expense of 1000 from `start`, nothing generated yet. */
function seedDailyRule(description: string, walletId: string, start: Date) {
    return db.runInTransaction(() => container.recurringTransactionRepository.create({
        type: TransactionType.EXPENSE,
        amount: 1000,
        walletId,
        categoryId: CATEGORY,
        description,
        startDate: start,
        frequency: RecurrenceFrequency.DAILY,
        interval: 1,
    }));
}

/** The local days of the rows a rule wrote, oldest first. */
async function rowDays(ruleId: string): Promise<string[]> {
    const { rows } = await base.execute(
        'SELECT date FROM transactions WHERE recurring_rule_id = ? ORDER BY date',
        [ruleId],
    );
    return rows.map((row) => ymd(new Date(String(row.date))));
}

async function storedAmount(ruleId: string): Promise<number> {
    const { rows } = await base.execute('SELECT amount FROM recurring_rules WHERE id = ?', [ruleId]);
    return Number(rows[0].amount);
}

async function ruleIdsByDescription(): Promise<Record<string, string>> {
    const { rows } = await base.execute('SELECT id, description FROM recurring_rules');
    return Object.fromEntries(rows.map((row) => [String(row.description ?? ''), String(row.id)]));
}

/** Whether `element` is rendered inside the form's page sheet. */
function insideFormSheet(element: RenderedNode): boolean {
    for (let node: RenderedNode | null = element; node !== null; node = node.parent) {
        if (node.props.presentationStyle === 'pageSheet') return true;
    }
    return false;
}

type Screen = ReturnType<typeof render>;

/** Every Alert.alert call so far, as [title, message]. */
function alerts(): [string, string][] {
    return (Alert.alert as jest.Mock).mock.calls.map((call) => [call[0], call[1]]);
}

/** Wait until the screen has shown `count` alerts, then let the run settle. */
async function waitForAlerts(count: number): Promise<[string, string]> {
    await waitFor(() => expect(alerts().length).toBeGreaterThanOrEqual(count));
    await settle();
    return alerts()[count - 1];
}

/**
 * Create a rule through the form: wallet, category Rent, an amount. The form
 * starts it today, monthly, so its occurrence 0 is due today. Opened from the
 * empty state when the list is empty, from the add button otherwise.
 */
async function createThroughForm(screen: Screen, walletName: string, fromEmptyState: boolean) {
    if (fromEmptyState) {
        fireEvent.press(await screen.findByText('recurring.createRule'));
    } else {
        fireEvent.press(await screen.findByLabelText('a11y.addRecurringRule'));
    }
    fireEvent.press(await screen.findByText('recurring.selectWallet'));
    fireEvent.press(await screen.findByText(walletName));
    fireEvent.press(screen.getByText('recurring.selectCategory'));
    fireEvent.press(await screen.findByText('Rent'));
    fireEvent.changeText(screen.getByPlaceholderText('0.00'), '50');

    const inSheet = screen.getAllByText('recurring.createRule').filter(insideFormSheet);
    expect(inSheet).toHaveLength(1);
    pressOnce(inSheet[0]);
}

beforeEach(async () => {
    jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    // The engine reports every run on the console.
    jest.spyOn(console, 'log').mockImplementation(() => undefined);
    jest.spyOn(console, 'info').mockImplementation(() => undefined);
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    base = await createTestDb({ writeGuard: true });
});

afterEach(() => {
    jest.restoreAllMocks();
    __setDatabaseForTests(null);
    container.reset();
});

describe('V-111 the create alert reports the new rule only', () => {
    it('V-111 a. a create whose occurrence write fails: the alert says the rule was created and names the debit not recorded', async () => {
        await useDatabase(FaultInjectingDatabase.failOnNthMatch(base, /^\s*INSERT INTO transactions/i, 1));

        const screen = render(<RecurringRulesScreen />);
        await createThroughForm(screen, 'Bank', true);
        const [title, message] = await waitForAlerts(1);

        // The forcing: the rule was saved and its occurrence write was refused.
        const ids = await ruleIdsByDescription();
        expect(Object.keys(ids)).toHaveLength(1);
        expect(await rowDays(Object.values(ids)[0])).toEqual([]);

        expect(title).toBe('recurring.ruleCreated');
        expect(message).not.toBe('recurring.ruleCreatedNoTransactions');
        expect(message).toBe(
            'recurring.ruleCreatedUnrecordedMessage ' +
                JSON.stringify({ name: 'recurring.defaultDescription', dates: ymd(new Date()) }),
        );
    });

    it('V-111 b. a create while another rule is refused for funds and a third generates debits: the alert reports the new rule only', async () => {
        await useDatabase(base);
        const skipped = await seedDailyRule('Short', CASH, daysAgo(1));
        const generating = await seedDailyRule('Gym', BANK, daysAgo(1));

        const screen = render(<RecurringRulesScreen />);
        await screen.findByText('Gym');
        await createThroughForm(screen, 'Bank', false);
        const [title, message] = await waitForAlerts(1);

        // The forcing: the run refused one rule for funds and generated another.
        expect(await rowDays(skipped.id)).toEqual([]);
        expect(await rowDays(generating.id)).toEqual([ymd(daysAgo(1)), ymd(daysAgo(0))]);

        expect([title, message]).toEqual([
            'recurring.ruleCreated',
            'recurring.ruleCreatedMessage ' + JSON.stringify({ count: 1 }),
        ]);
    });

    it('control: a create with nothing failing reports its own count', async () => {
        await useDatabase(base);

        const screen = render(<RecurringRulesScreen />);
        await createThroughForm(screen, 'Bank', true);
        const [title, message] = await waitForAlerts(1);

        const ids = await ruleIdsByDescription();
        expect(await rowDays(Object.values(ids)[0])).toEqual([ymd(new Date())]);
        expect([title, message]).toEqual([
            'recurring.ruleCreated',
            'recurring.ruleCreatedMessage ' + JSON.stringify({ count: 1 }),
        ]);
    });

    it('control: a new rule refused for funds keeps the insufficient-funds alert', async () => {
        await useDatabase(base);

        const screen = render(<RecurringRulesScreen />);
        await createThroughForm(screen, 'Cash', true);
        const [title, message] = await waitForAlerts(1);

        const ids = await ruleIdsByDescription();
        expect(await rowDays(Object.values(ids)[0])).toEqual([]);
        expect([title, message]).toEqual([
            'recurring.ruleCreatedInsufficientTitle',
            'recurring.ruleCreatedInsufficientMessage',
        ]);
    });
});

describe('V-111 an edit whose catch-up fails names the dates not recorded', () => {
    it('V-111 c. the catch-up writes the first debit and fails on the second: the message names the two dates not recorded', async () => {
        await useDatabase(FaultInjectingDatabase.failOnNthMatch(base, /^\s*INSERT INTO transactions/i, 2));
        const rule = await seedDailyRule('Gym', BANK, daysAgo(2));

        const screen = render(<RecurringRulesScreen />);
        fireEvent.press(await screen.findByLabelText('a11y.editRule'));
        await waitFor(() => expect(screen.getByPlaceholderText('0.00').props.value).toBe('10'));
        fireEvent.changeText(screen.getByPlaceholderText('0.00'), '20');
        pressOnce(screen.getByText('recurring.updateRule'));
        const [title, message] = await waitForAlerts(1);

        // The forcing: one debit written, the second refused, the edit not saved.
        expect(await rowDays(rule.id)).toEqual([ymd(daysAgo(2))]);
        expect(await storedAmount(rule.id)).toBe(1000);

        expect([title, message]).toEqual([
            'recurring.editRefusedTitle',
            'recurring.editRefusedUnrecordedMessage ' +
                JSON.stringify({ name: 'Gym', dates: `${ymd(daysAgo(1))}, ${ymd(daysAgo(0))}` }),
        ]);
    });

    it('control: a pause with unrecorded dates shows the current message', async () => {
        await useDatabase(base);
        await seedDailyRule('Gym', CASH, daysAgo(1));

        const screen = render(<RecurringRulesScreen />);
        fireEvent.press(await screen.findByLabelText('a11y.pauseRule'));
        const [title, message] = await waitForAlerts(1);

        expect([title, message]).toEqual([
            'recurring.pausedUnrecordedTitle',
            'recurring.pausedUnrecordedMessage ' +
                JSON.stringify({ name: 'Gym', dates: `${ymd(daysAgo(1))}, ${ymd(daysAgo(0))}` }),
        ]);
    });
});

describe('V-111 a rule whose last run failed shows a fault until a later run succeeds', () => {
    it('V-111 d. the restart limit on one rule, references present and funds sufficient: its card shows a fault, then Active once a later run has generated its debits', async () => {
        const changing = new EverChangingRuleDatabase(base);
        await useDatabase(changing);
        const rule = await seedDailyRule('Gym', BANK, daysAgo(2));

        const screen = render(<RecurringRulesScreen />);
        await screen.findByText('recurring.statusActive');

        changing.ruleId = rule.id;
        changing.enabled = true;
        await createThroughForm(screen, 'Bank', false);
        await waitForAlerts(1);

        // The forcing: the rule was found changed past the restart limit and
        // nothing was written for it.
        expect(changing.changedReads).toBeGreaterThan(3);
        expect(await rowDays(rule.id)).toEqual([]);

        expect(await screen.findByText('recurring.statusNotRecorded')).toBeTruthy();
        expect(screen.getAllByText('recurring.statusActive')).toHaveLength(1);

        changing.enabled = false;
        await createThroughForm(screen, 'Bank', false);
        await waitForAlerts(2);

        expect(await rowDays(rule.id)).toEqual([ymd(daysAgo(2)), ymd(daysAgo(1)), ymd(daysAgo(0))]);
        await waitFor(() => expect(screen.queryByText('recurring.statusNotRecorded')).toBeNull());
        expect(screen.getAllByText('recurring.statusActive')).toHaveLength(3);
    });
});
