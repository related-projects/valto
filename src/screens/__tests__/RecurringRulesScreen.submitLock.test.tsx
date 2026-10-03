/**
 * RecurringRuleForm - two presses in one event batch create one rule
 *
 * REGISTRE V-122 (pass 67). The form's create button is ui/Button, whose
 * TouchableOpacity is disabled by `loading={submitting}`, which reaches
 * Pressability after the commit, so a second press delivered in the same event
 * batch as the first ran handleSubmit again and created a second rule; each
 * rule then generated its own occurrences. The real screen is rendered so its
 * own submit path runs, engine included. The presses go through
 * tests/helpers/pressInOneBatch.ts, against the real hooks, the real engine and
 * an in-memory database.
 *
 * The form starts the rule today, so occurrence 0 is due today and the
 * screen's engine run records it. Dates are local throughout, so the suite
 * holds in whatever zone the process runs in.
 */

import { fireEvent, render, waitFor } from '@testing-library/react-native';
import React from 'react';
import { Alert } from 'react-native';

import { createTestDb } from '../../../tests/helpers/createTestDb';
import {
    pressOnce,
    pressTwiceInOneBatch,
    settle,
    type RenderedNode,
} from '../../../tests/helpers/pressInOneBatch';
import { container } from '../../core/di/container';
import { __setDatabaseForTests } from '../../data/storage/sql/database';
import type { SqlDatabase } from '../../data/storage/sql/SqlDatabase';
import { CategoryType, WalletType } from '../../domain/entities';
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

const WALLET_ID = 'w-bank';
const BALANCE = 100000;
const AMOUNT_INPUT = '50';
const AMOUNT = 5000;

let db: SqlDatabase;

async function count(sql: string): Promise<number> {
    const { rows } = await db.execute(sql);
    return Number(rows[0].n);
}

async function balanceOf(id: string): Promise<number> {
    const { rows } = await db.execute('SELECT balance FROM wallets WHERE id = ?', [id]);
    return Number(rows[0].balance);
}

/** Whether `element` is rendered inside the form's page sheet. */
function insideFormSheet(element: RenderedNode): boolean {
    for (let node: RenderedNode | null = element; node !== null; node = node.parent) {
        if (node.props.presentationStyle === 'pageSheet') return true;
    }
    return false;
}

/**
 * Open the create form from the empty state and fill wallet, category and,
 * when given, the amount. Returns the screen and the form's create button,
 * which carries the same label as the empty-state action behind the sheet.
 */
async function openForm(amountInput: string | null) {
    const screen = render(<RecurringRulesScreen />);
    fireEvent.press(await screen.findByText('recurring.createRule'));

    fireEvent.press(await screen.findByText('recurring.selectWallet'));
    fireEvent.press(await screen.findByText('Bank'));
    fireEvent.press(screen.getByText('recurring.selectCategory'));
    fireEvent.press(await screen.findByText('Rent'));
    if (amountInput !== null) {
        fireEvent.changeText(screen.getByPlaceholderText('0.00'), amountInput);
    }

    const submit = () => {
        const inSheet = screen.getAllByText('recurring.createRule').filter(insideFormSheet);
        expect(inSheet).toHaveLength(1);
        return inSheet[0];
    };
    return { screen, submit };
}

/** Wait for the screen to report the outcome of the engine run it starts after a create. */
async function waitForRuleCreatedAlert() {
    await waitFor(() => {
        const titles = (Alert.alert as jest.Mock).mock.calls.map((call) => call[0]);
        expect(titles).toContain('recurring.ruleCreated');
    });
    await settle();
}

beforeEach(async () => {
    jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    // The engine reports every run on the console.
    jest.spyOn(console, 'log').mockImplementation(() => undefined);
    db = await createTestDb({ writeGuard: true });
    __setDatabaseForTests(db);
    container.reset();
    await db.runInTransaction(async () => {
        await container.walletRepository.save({
            id: WALLET_ID,
            name: 'Bank',
            balance: BALANCE,
            type: WalletType.BANK,
            createdAt: new Date(2026, 0, 1),
        });
        await container.categoryRepository.save({
            id: 'cat-rent',
            name: 'Rent',
            type: CategoryType.EXPENSE,
            icon: 'home-outline',
            color: '#FF5722',
        });
    });
});

afterEach(() => {
    jest.restoreAllMocks();
    __setDatabaseForTests(null);
    container.reset();
});

describe('RecurringRuleForm submit lock', () => {
    it('V-122: two presses in one event batch create one rule, and its occurrence is generated once', async () => {
        const { submit } = await openForm(AMOUNT_INPUT);

        pressTwiceInOneBatch(submit());
        await waitForRuleCreatedAlert();

        expect(await count('SELECT COUNT(*) AS n FROM recurring_rules')).toBe(1);
        expect(
            await count('SELECT COUNT(*) AS n FROM transactions WHERE recurring_rule_id IS NOT NULL'),
        ).toBe(1);
        expect(await balanceOf(WALLET_ID)).toBe(BALANCE - AMOUNT);
    });

    it('control: a single press creates one rule, and its occurrence is generated once', async () => {
        const { submit } = await openForm(AMOUNT_INPUT);

        pressOnce(submit());
        await waitForRuleCreatedAlert();

        expect(await count('SELECT COUNT(*) AS n FROM recurring_rules')).toBe(1);
        expect(
            await count('SELECT COUNT(*) AS n FROM transactions WHERE recurring_rule_id IS NOT NULL'),
        ).toBe(1);
        expect(await balanceOf(WALLET_ID)).toBe(BALANCE - AMOUNT);
    });

    it('control: an empty amount is refused, then a corrected amount creates one rule', async () => {
        const { screen, submit } = await openForm(null);

        pressOnce(submit());
        await waitFor(() => expect(Alert.alert).toHaveBeenCalled());
        await settle();
        expect((Alert.alert as jest.Mock).mock.calls[0][0]).toBe('recurring.invalidAmount');
        expect(await count('SELECT COUNT(*) AS n FROM recurring_rules')).toBe(0);

        fireEvent.changeText(screen.getByPlaceholderText('0.00'), AMOUNT_INPUT);
        pressOnce(submit());
        await waitForRuleCreatedAlert();

        expect(await count('SELECT COUNT(*) AS n FROM recurring_rules')).toBe(1);
        expect(
            await count('SELECT COUNT(*) AS n FROM transactions WHERE recurring_rule_id IS NOT NULL'),
        ).toBe(1);
        expect(await balanceOf(WALLET_ID)).toBe(BALANCE - AMOUNT);
    });
});
