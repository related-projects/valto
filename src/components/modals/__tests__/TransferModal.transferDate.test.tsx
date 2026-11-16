/**
 * TransferModal - the Dashboard shortcut still records the present instant
 *
 * REGISTRE V-129 (pass 92), control. The shortcut sheet has no date field and
 * no note field. Owner decision 1 (16/11): it records the present instant, so
 * the change that lets the add-transaction form pass its picked date and typed
 * note must leave this path as it was: both legs at the instant of the save,
 * the fixed notes, and the two balances moved by the amount.
 *
 * Real here: the hooks, the transferFunds use case and an in-memory database.
 * The device sits in Lagos (UTC+1) at 31 Oct 2026 22:34, installed through
 * tests/helpers/zoneClock.
 */

import { fireEvent, render, waitFor } from '@testing-library/react-native';
import React from 'react';
import { Alert } from 'react-native';

import { createTestDb } from '../../../../tests/helpers/createTestDb';
import { pressOnce, settle } from '../../../../tests/helpers/pressInOneBatch';
import { installZoneClock, restoreZoneClock } from '../../../../tests/helpers/zoneClock';
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

const LAGOS = 'Africa/Lagos';
// 2026-10-31T21:34Z: 31 Oct 2026 22:34 in Lagos.
const NOW = Date.UTC(2026, 9, 31, 21, 34);

const SOURCE_ID = 'w-source';
const DEST_ID = 'w-dest';
const SOURCE_BALANCE = 100000;
const DEST_BALANCE = 5000;
const AMOUNT_INPUT = '10';
const AMOUNT = 1000;

let db: SqlDatabase;

async function balanceOf(id: string): Promise<number> {
    const { rows } = await db.execute('SELECT balance FROM wallets WHERE id = ?', [id]);
    return Number(rows[0].balance);
}

beforeEach(async () => {
    installZoneClock(LAGOS, NOW);
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
    restoreZoneClock();
    __setDatabaseForTests(null);
    container.reset();
});

describe('V-129 TransferModal keeps the present instant', () => {
    it('control: both legs carry the instant of the save and the fixed notes, and the balances move by the amount', async () => {
        const onClose = jest.fn();
        const screen = render(<TransferModal visible onClose={onClose} />);
        // The "available" line is shown for the source only: it pins which
        // seeded wallet the sheet chose as the source.
        await waitFor(() => {
            expect(
                screen.getByText(`modals.transfer.available {"amount":"amt:${SOURCE_BALANCE}"}`),
            ).toBeTruthy();
        });
        fireEvent.changeText(screen.getByPlaceholderText('0.00'), AMOUNT_INPUT);

        pressOnce(screen.getByText('modals.transfer.send'));
        await waitFor(() => expect(onClose).toHaveBeenCalled());
        await settle();

        const rows = await container.transactionRepository.getAll();
        const outgoing = rows.find((tx) => tx.categoryId === 'transfer-out');
        const incoming = rows.find((tx) => tx.categoryId === 'transfer-in');
        expect(rows).toHaveLength(2);
        expect(outgoing!.walletId).toBe(SOURCE_ID);
        expect(incoming!.walletId).toBe(DEST_ID);
        expect(outgoing!.date.getTime()).toBe(NOW);
        expect(incoming!.date.getTime()).toBe(NOW);
        expect(outgoing!.note).toBe('Transfer to Dest');
        expect(incoming!.note).toBe('Transfer from Source');
        expect(await balanceOf(SOURCE_ID)).toBe(SOURCE_BALANCE - AMOUNT);
        expect(await balanceOf(DEST_ID)).toBe(DEST_BALANCE + AMOUNT);
    });
});
