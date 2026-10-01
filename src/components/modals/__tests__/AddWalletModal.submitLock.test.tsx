/**
 * AddWalletModal - two presses in one event batch create one wallet
 *
 * REGISTRE V-121 (pass 67). The save button's only guard was
 * `disabled={saving}`, which reaches Pressability after the commit, so a second
 * press delivered in the same event batch as the first ran handleSave again and
 * created a second wallet, whose opening balance the total then counted twice.
 * The presses go through tests/helpers/pressInOneBatch.ts, against the real
 * hooks, the real createWallet use case and an in-memory database.
 */

import { fireEvent, render, waitFor } from '@testing-library/react-native';
import React from 'react';
import { Alert } from 'react-native';

import { createTestDb } from '../../../../tests/helpers/createTestDb';
import { pressOnce, pressTwiceInOneBatch, settle } from '../../../../tests/helpers/pressInOneBatch';
import { container } from '../../../core/di/container';
import { __setDatabaseForTests } from '../../../data/storage/sql/database';
import type { SqlDatabase } from '../../../data/storage/sql/SqlDatabase';
import { WalletType } from '../../../domain/entities';
import { AddWalletModal } from '../AddWalletModal';

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
        parseAmountResult: (v: string) =>
            /^\d+$/.test(v) ? { ok: true, value: Number(v) } : { ok: false, cause: 'notANumber' },
        normalizeAmount: (v: number) => Math.round(v * 100),
        amountPlaceholder: '0.00',
        decimals: 2,
    }),
}));

const EXISTING_BALANCE = 50000;
const OPENING_INPUT = '300';
const OPENING = 30000;

let db: SqlDatabase;

async function count(sql: string): Promise<number> {
    const { rows } = await db.execute(sql);
    return Number(rows[0].n);
}

async function totalBalance(): Promise<number> {
    const { rows } = await db.execute('SELECT SUM(balance) AS total FROM wallets');
    return Number(rows[0].total);
}

beforeEach(async () => {
    jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    db = await createTestDb({ writeGuard: true });
    __setDatabaseForTests(db);
    container.reset();
    await db.runInTransaction(() =>
        container.walletRepository.save({
            id: 'w-existing',
            name: 'Existing',
            balance: EXISTING_BALANCE,
            type: WalletType.BANK,
            createdAt: new Date(2026, 0, 1),
        }),
    );
});

afterEach(() => {
    jest.restoreAllMocks();
    __setDatabaseForTests(null);
    container.reset();
});

describe('AddWalletModal submit lock', () => {
    it('V-121: two presses in one event batch create one wallet and count its opening balance once', async () => {
        const onClose = jest.fn();
        const screen = render(<AddWalletModal visible onClose={onClose} />);
        fireEvent.changeText(screen.getByTestId('add_wallet_name_input'), 'Savings');
        fireEvent.changeText(screen.getByTestId('add_wallet_balance_input'), OPENING_INPUT);

        pressTwiceInOneBatch(screen.getByTestId('add_wallet_save_button'));
        await waitFor(() => expect(onClose).toHaveBeenCalled());
        await settle();

        expect(await count('SELECT COUNT(*) AS n FROM wallets')).toBe(2);
        expect(await totalBalance()).toBe(EXISTING_BALANCE + OPENING);
    });

    it('control: a single press creates one wallet', async () => {
        const onClose = jest.fn();
        const screen = render(<AddWalletModal visible onClose={onClose} />);
        fireEvent.changeText(screen.getByTestId('add_wallet_name_input'), 'Savings');
        fireEvent.changeText(screen.getByTestId('add_wallet_balance_input'), OPENING_INPUT);

        pressOnce(screen.getByTestId('add_wallet_save_button'));
        await waitFor(() => expect(onClose).toHaveBeenCalled());
        await settle();

        expect(await count('SELECT COUNT(*) AS n FROM wallets')).toBe(2);
        expect(await totalBalance()).toBe(EXISTING_BALANCE + OPENING);
    });

    it('control: an empty name is refused, then a corrected name creates one wallet', async () => {
        const onClose = jest.fn();
        const screen = render(<AddWalletModal visible onClose={onClose} />);
        fireEvent.changeText(screen.getByTestId('add_wallet_balance_input'), OPENING_INPUT);

        pressOnce(screen.getByTestId('add_wallet_save_button'));
        await waitFor(() => expect(Alert.alert).toHaveBeenCalled());
        await settle();
        expect((Alert.alert as jest.Mock).mock.calls[0][0]).toBe('modals.addWallet.invalidName');
        expect(await count('SELECT COUNT(*) AS n FROM wallets')).toBe(1);

        fireEvent.changeText(screen.getByTestId('add_wallet_name_input'), 'Savings');
        pressOnce(screen.getByTestId('add_wallet_save_button'));
        await waitFor(() => expect(onClose).toHaveBeenCalled());
        await settle();

        expect(await count('SELECT COUNT(*) AS n FROM wallets')).toBe(2);
        expect(await totalBalance()).toBe(EXISTING_BALANCE + OPENING);
    });
});
