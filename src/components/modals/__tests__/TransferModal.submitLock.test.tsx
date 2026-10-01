/**
 * TransferModal - two presses in one event batch transfer once
 *
 * REGISTRE V-120 (pass 67). The send button's only guard was
 * `disabled={transferring || !canTransfer}`, which reaches Pressability after
 * the commit, so a second press delivered in the same event batch as the first
 * ran handleTransfer again and moved the amount twice. The presses go through
 * tests/helpers/pressInOneBatch.ts, against the real hooks, the real
 * transferFunds use case and an in-memory database. The source holds at least
 * twice the amount, so a second transfer would not be refused for funds.
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
import { TransferModal } from '../TransferModal';

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

const SOURCE_ID = 'w-source';
const DEST_ID = 'w-dest';
const SOURCE_BALANCE = 100000;
const DEST_BALANCE = 5000;
const AMOUNT_INPUT = '10';
const AMOUNT = 1000;

let db: SqlDatabase;

async function count(sql: string): Promise<number> {
    const { rows } = await db.execute(sql);
    return Number(rows[0].n);
}

async function balanceOf(id: string): Promise<number> {
    const { rows } = await db.execute('SELECT balance FROM wallets WHERE id = ?', [id]);
    return Number(rows[0].balance);
}

/**
 * Render the sheet and wait until it has picked its default wallets. The
 * "available" line is shown for the source only, so it pins which seeded
 * wallet the sheet chose as the source.
 */
async function openSheet(onClose: jest.Mock) {
    const screen = render(<TransferModal visible onClose={onClose} />);
    await waitFor(() => {
        expect(
            screen.getByText(`modals.transfer.available {"amount":"amt:${SOURCE_BALANCE}"}`),
        ).toBeTruthy();
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
            id: SOURCE_ID,
            name: 'Source',
            balance: SOURCE_BALANCE,
            type: WalletType.BANK,
            createdAt: new Date(2026, 0, 1),
        });
        await container.walletRepository.save({
            id: DEST_ID,
            name: 'Dest',
            balance: DEST_BALANCE,
            type: WalletType.BANK,
            createdAt: new Date(2026, 0, 2),
        });
    });
});

afterEach(() => {
    jest.restoreAllMocks();
    __setDatabaseForTests(null);
    container.reset();
});

describe('TransferModal submit lock', () => {
    it('V-120: two presses in one event batch move the amount once', async () => {
        const onClose = jest.fn();
        const screen = await openSheet(onClose);
        fireEvent.changeText(screen.getByPlaceholderText('0.00'), AMOUNT_INPUT);

        pressTwiceInOneBatch(screen.getByText('modals.transfer.send'));
        await waitFor(() => expect(onClose).toHaveBeenCalled());
        await settle();

        expect(await count("SELECT COUNT(*) AS n FROM transactions WHERE type = 'transfer'")).toBe(2);
        expect(await balanceOf(SOURCE_ID)).toBe(SOURCE_BALANCE - AMOUNT);
        expect(await balanceOf(DEST_ID)).toBe(DEST_BALANCE + AMOUNT);
    });

    it('control: a single press moves the amount once', async () => {
        const onClose = jest.fn();
        const screen = await openSheet(onClose);
        fireEvent.changeText(screen.getByPlaceholderText('0.00'), AMOUNT_INPUT);

        pressOnce(screen.getByText('modals.transfer.send'));
        await waitFor(() => expect(onClose).toHaveBeenCalled());
        await settle();

        expect(await count("SELECT COUNT(*) AS n FROM transactions WHERE type = 'transfer'")).toBe(2);
        expect(await balanceOf(SOURCE_ID)).toBe(SOURCE_BALANCE - AMOUNT);
        expect(await balanceOf(DEST_ID)).toBe(DEST_BALANCE + AMOUNT);
    });

    it('control: an invalid amount is refused, then a corrected amount moves it once', async () => {
        const onClose = jest.fn();
        const screen = await openSheet(onClose);
        fireEvent.changeText(screen.getByPlaceholderText('0.00'), 'abc');

        pressOnce(screen.getByText('modals.transfer.send'));
        await waitFor(() => expect(Alert.alert).toHaveBeenCalled());
        await settle();
        expect((Alert.alert as jest.Mock).mock.calls[0][0]).toBe('modals.transfer.invalidAmount');
        expect(await count("SELECT COUNT(*) AS n FROM transactions WHERE type = 'transfer'")).toBe(0);

        fireEvent.changeText(screen.getByPlaceholderText('0.00'), AMOUNT_INPUT);
        pressOnce(screen.getByText('modals.transfer.send'));
        await waitFor(() => expect(onClose).toHaveBeenCalled());
        await settle();

        expect(await count("SELECT COUNT(*) AS n FROM transactions WHERE type = 'transfer'")).toBe(2);
        expect(await balanceOf(SOURCE_ID)).toBe(SOURCE_BALANCE - AMOUNT);
        expect(await balanceOf(DEST_ID)).toBe(DEST_BALANCE + AMOUNT);
    });

    it('control: an amount above the source balance is refused for funds, then a corrected amount moves it once', async () => {
        const onClose = jest.fn();
        const screen = await openSheet(onClose);
        // Twice the source balance, in major units.
        fireEvent.changeText(screen.getByPlaceholderText('0.00'), String((SOURCE_BALANCE * 2) / 100));

        pressOnce(screen.getByText('modals.transfer.send'));
        await waitFor(() => expect(Alert.alert).toHaveBeenCalled());
        await settle();
        expect((Alert.alert as jest.Mock).mock.calls[0][0]).toBe('modals.transfer.insufficientBalance');
        expect(await count("SELECT COUNT(*) AS n FROM transactions WHERE type = 'transfer'")).toBe(0);
        expect(await balanceOf(SOURCE_ID)).toBe(SOURCE_BALANCE);

        fireEvent.changeText(screen.getByPlaceholderText('0.00'), AMOUNT_INPUT);
        pressOnce(screen.getByText('modals.transfer.send'));
        await waitFor(() => expect(onClose).toHaveBeenCalled());
        await settle();

        expect(await count("SELECT COUNT(*) AS n FROM transactions WHERE type = 'transfer'")).toBe(2);
        expect(await balanceOf(SOURCE_ID)).toBe(SOURCE_BALANCE - AMOUNT);
        expect(await balanceOf(DEST_ID)).toBe(DEST_BALANCE + AMOUNT);
    });
});
