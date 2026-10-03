/**
 * AddTransactionModal - two presses in one event batch save once
 *
 * REGISTRE V-112 (pass 67). The save button's only guard was
 * `disabled={saving}`, which reaches Pressability after the commit, so a second
 * press delivered in the same event batch as the first ran handleSave again and
 * wrote a second transaction and a second debit. The presses go through
 * tests/helpers/pressInOneBatch.ts, against the real hooks, the real
 * createTransaction use case and an in-memory database.
 */

import { fireEvent, render, waitFor } from '@testing-library/react-native';
import React from 'react';
import { Alert } from 'react-native';

import { createTestDb } from '../../../../tests/helpers/createTestDb';
import { pressOnce, pressTwiceInOneBatch, settle } from '../../../../tests/helpers/pressInOneBatch';
import { container } from '../../../core/di/container';
import { __setDatabaseForTests } from '../../../data/storage/sql/database';
import type { SqlDatabase } from '../../../data/storage/sql/SqlDatabase';
import { CategoryType, WalletType } from '../../../domain/entities';
import { AddTransactionModal } from '../AddTransactionModal';

jest.mock('react-i18next', () => ({
    ...jest.requireActual('react-i18next'),
    useTranslation: () => ({
        t: (key: string, params?: Record<string, unknown>) =>
            params === undefined ? key : `${key} ${JSON.stringify(params)}`,
        i18n: { language: 'en' },
    }),
}));

// Whole numbers of major units; one major unit is 100 minor units.
jest.mock('../../../hooks/useFormatting', () => ({
    useFormatting: () => ({
        formatAmount: (v: number) => `amt:${v}`,
        parseAmountToCentsResult: (v: string) =>
            /^\d+$/.test(v) && Number(v) > 0
                ? { ok: true, value: Number(v) * 100 }
                : { ok: false, cause: v === '' ? 'empty' : 'notANumber' },
        amountPlaceholder: '0.00',
        decimals: 2,
    }),
}));

const WALLET_ID = 'w-main';
const BALANCE = 100000;
const AMOUNT_INPUT = '25';
const AMOUNT = 2500;

let db: SqlDatabase;

async function count(sql: string): Promise<number> {
    const { rows } = await db.execute(sql);
    return Number(rows[0].n);
}

async function balanceOf(id: string): Promise<number> {
    const { rows } = await db.execute('SELECT balance FROM wallets WHERE id = ?', [id]);
    return Number(rows[0].balance);
}

/** Render the sheet and wait until it has picked the seeded wallet and category. */
async function openSheet(onClose: jest.Mock) {
    const screen = render(<AddTransactionModal visible onClose={onClose} />);
    await waitFor(() => {
        expect(screen.getByText('Main')).toBeTruthy();
        expect(screen.getByText('Food')).toBeTruthy();
    });
    return screen;
}

beforeEach(async () => {
    jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    db = await createTestDb({ writeGuard: true });
    __setDatabaseForTests(db);
    container.reset();
    await db.runInTransaction(async () => {
        await container.walletRepository.save({
            id: WALLET_ID,
            name: 'Main',
            balance: BALANCE,
            type: WalletType.BANK,
            createdAt: new Date(2026, 0, 1),
        });
        await container.categoryRepository.save({
            id: 'cat-food',
            name: 'Food',
            type: CategoryType.EXPENSE,
            icon: 'fast-food-outline',
            color: '#FF5722',
        });
    });
});

afterEach(() => {
    jest.restoreAllMocks();
    __setDatabaseForTests(null);
    container.reset();
});

describe('AddTransactionModal submit lock', () => {
    it('V-112: two presses in one event batch save one transaction and debit the wallet once', async () => {
        const onClose = jest.fn();
        const screen = await openSheet(onClose);
        fireEvent.changeText(screen.getByTestId('add_tx_amount_input'), AMOUNT_INPUT);

        pressTwiceInOneBatch(screen.getByTestId('add_tx_save_button'));
        await waitFor(() => expect(onClose).toHaveBeenCalled());
        await settle();

        expect(await count('SELECT COUNT(*) AS n FROM transactions')).toBe(1);
        expect(await balanceOf(WALLET_ID)).toBe(BALANCE - AMOUNT);
    });

    it('control: a single press saves one transaction', async () => {
        const onClose = jest.fn();
        const screen = await openSheet(onClose);
        fireEvent.changeText(screen.getByTestId('add_tx_amount_input'), AMOUNT_INPUT);

        pressOnce(screen.getByTestId('add_tx_save_button'));
        await waitFor(() => expect(onClose).toHaveBeenCalled());
        await settle();

        expect(await count('SELECT COUNT(*) AS n FROM transactions')).toBe(1);
        expect(await balanceOf(WALLET_ID)).toBe(BALANCE - AMOUNT);
    });

    it('control: an empty amount is refused, then a corrected amount saves one transaction', async () => {
        const onClose = jest.fn();
        const screen = await openSheet(onClose);

        pressOnce(screen.getByTestId('add_tx_save_button'));
        await waitFor(() => expect(Alert.alert).toHaveBeenCalled());
        await settle();
        expect((Alert.alert as jest.Mock).mock.calls[0][0]).toBe('modals.addTransaction.invalidAmount');
        expect(await count('SELECT COUNT(*) AS n FROM transactions')).toBe(0);

        fireEvent.changeText(screen.getByTestId('add_tx_amount_input'), AMOUNT_INPUT);
        pressOnce(screen.getByTestId('add_tx_save_button'));
        await waitFor(() => expect(onClose).toHaveBeenCalled());
        await settle();

        expect(await count('SELECT COUNT(*) AS n FROM transactions')).toBe(1);
        expect(await balanceOf(WALLET_ID)).toBe(BALANCE - AMOUNT);
    });
});
