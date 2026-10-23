/**
 * RecurringRulesScreen - the insufficient-funds alert after a create names the
 * real trigger (pass 80, finding 1)
 *
 * The alert said the skipped debits "will be generated automatically once
 * funds are available". Nothing runs when a wallet is topped up: the engine
 * runs at an app start, on a rule create, on a restore, and in the edit and
 * pause catch-ups (V-100). Owner decision, pass 80: the message says the
 * debits are recorded at the next app start if funds are then sufficient; when
 * the engine runs is not changed.
 *
 * The real screen, form, hooks and engine run over an in-memory database, as
 * in RecurringRulesScreen.v111Outcome.test.tsx, with the real locale bundles:
 * the identity `t` of the other suites cannot see what the user reads. The
 * forcing - the rule stored, nothing written for it - is asserted on the
 * database before the message.
 *
 * Non-ASCII expectations are written as \u escapes.
 */

import { fireEvent, render, waitFor } from '@testing-library/react-native';
import React from 'react';
import { Alert } from 'react-native';

import { createTestDb } from '../../../tests/helpers/createTestDb';
import { pressOnce, settle, type RenderedNode } from '../../../tests/helpers/pressInOneBatch';
import { container } from '../../core/di/container';
import { __setDatabaseForTests } from '../../data/storage/sql/database';
import type { SqlDatabase } from '../../data/storage/sql/SqlDatabase';
import { CategoryType, WalletType } from '../../domain/entities';
import i18n from '../../localization/i18n';
import { RecurringRulesScreen } from '../RecurringRulesScreen';

jest.mock('react-native-safe-area-context', () => ({
    useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.mock('expo-router', () => ({
    useRouter: () => ({ back: jest.fn(), push: jest.fn() }),
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

const CASH = 'w-cash';
const CATEGORY = 'cat-rent';

let base: SqlDatabase;

/** An empty cash wallet - the funds guard refuses any debit from it - and one category. */
async function seed(): Promise<void> {
    __setDatabaseForTests(base);
    container.reset();
    await base.runInTransaction(async () => {
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

/** Whether `element` is rendered inside the form's page sheet. */
function insideFormSheet(element: RenderedNode): boolean {
    for (let node: RenderedNode | null = element; node !== null; node = node.parent) {
        if (node.props.presentationStyle === 'pageSheet') return true;
    }
    return false;
}

/**
 * Create a rule on the Cash wallet through the form, from the empty state.
 * The form starts it today, so its first occurrence is due today.
 */
async function createOnCash(screen: ReturnType<typeof render>) {
    fireEvent.press(await screen.findByText(i18n.t('recurring.createRule')));
    fireEvent.press(await screen.findByText(i18n.t('recurring.selectWallet')));
    fireEvent.press(await screen.findByText('Cash'));
    fireEvent.press(screen.getByText(i18n.t('recurring.selectCategory')));
    fireEvent.press(await screen.findByText('Rent'));
    fireEvent.changeText(screen.getByPlaceholderText('0.00'), '50');

    const inSheet = screen.getAllByText(i18n.t('recurring.createRule')).filter(insideFormSheet);
    expect(inSheet).toHaveLength(1);
    pressOnce(inSheet[0]);
}

/** The first alert, once the run has settled, as [title, message]. */
async function firstAlert(): Promise<[string, string]> {
    const calls = (Alert.alert as jest.Mock).mock.calls;
    await waitFor(() => expect(calls.length).toBeGreaterThanOrEqual(1));
    await settle();
    return [calls[0][0], calls[0][1]];
}

/** The forcing: one rule stored, and the run wrote nothing for it. */
async function expectRuleStoredAndSkipped(): Promise<void> {
    const rules = await base.execute('SELECT id FROM recurring_rules');
    expect(rules.rows).toHaveLength(1);
    const written = await base.execute(
        'SELECT COUNT(*) AS n FROM transactions WHERE recurring_rule_id = ?',
        [String(rules.rows[0].id)],
    );
    expect(Number(written.rows[0].n)).toBe(0);
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

afterAll(async () => {
    await i18n.changeLanguage('en');
});

describe('pass 80 finding 1: the insufficient-funds alert after a create names the next app start', () => {
    it('a. en: the alert no longer promises generation once funds are available, and names the next app start', async () => {
        await i18n.changeLanguage('en');

        const screen = render(<RecurringRulesScreen />);
        await createOnCash(screen);
        const [title, message] = await firstAlert();

        await expectRuleStoredAndSkipped();

        expect(title).toBe('Rule Created. Insufficient Funds');
        expect(message).not.toContain('automatically');
        expect(message).not.toContain('once funds are available');
        expect(message).toContain('the next time the app starts');
    });

    it('a. fr: the alert no longer promises generation once funds are available, and names the next app start', async () => {
        await i18n.changeLanguage('fr');

        const screen = render(<RecurringRulesScreen />);
        await createOnCash(screen);
        const [title, message] = await firstAlert();

        await expectRuleStoredAndSkipped();

        expect(title).toBe('R\u00e8gle cr\u00e9\u00e9e. Fonds insuffisants');
        expect(message).not.toContain('automatiquement');
        expect(message).not.toContain('lorsque les fonds seront disponibles');
        expect(message).toContain('au prochain d\u00e9marrage de l\'application');
    });
});
