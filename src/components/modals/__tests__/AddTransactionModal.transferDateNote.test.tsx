/**
 * AddTransactionModal - a transfer keeps the picked date and the typed note
 *
 * REGISTRE V-129 (pass 92). The form shows its date row and its notes field in
 * all three modes, but the transfer branch handed only the two wallets and the
 * amount to the write: both legs were stamped with the instant of the save and
 * carried the fixed "Transfer to/from <wallet>" text, while an expense or an
 * income from the same form kept the picked date. Owner decision 1 (16/11): a
 * transfer keeps the picked date and the typed note. Owner decision 17/11: the
 * typed note follows the wallet text ("Transfer to Dest - Rent share"); an
 * empty or blank note keeps the fixed text alone.
 *
 * Real here: the hooks, the use cases and an in-memory database, then the real
 * useReports and useDashboard reading the rows back. The device sits in Lagos
 * (UTC+1) at 31 Oct 2026 22:34 and the user picks 1 Nov 2026; the zone is
 * installed through tests/helpers/zoneClock, so the suite holds under any TZ.
 * The date picker is replaced by a stand-in that hands the form the date
 * through the form's own onChange handler, with the event an Android "set"
 * carries. What the device picker returns for a picked day is not tested here.
 */

import { act, fireEvent, render, renderHook, waitFor } from '@testing-library/react-native';
import React from 'react';
import { Alert } from 'react-native';

import { createTestDb } from '../../../../tests/helpers/createTestDb';
import { pressOnce, settle } from '../../../../tests/helpers/pressInOneBatch';
import { installZoneClock, restoreZoneClock } from '../../../../tests/helpers/zoneClock';
import { container } from '../../../core/di/container';
import { __setDatabaseForTests } from '../../../data/storage/sql/database';
import type { SqlDatabase } from '../../../data/storage/sql/SqlDatabase';
import { CategoryType, TransactionType, WalletType, getCurrentMonth } from '../../../domain/entities';
import { useDashboard } from '../../../hooks/useDashboard';
import { useReports } from '../../../hooks/useReports';
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

type PickerChange = (event: { type: string }, date?: Date) => void;

// The onChange the form gave the picker on its last render.
let mockPickerOnChange: PickerChange | null = null;

jest.mock('@react-native-community/datetimepicker', () => {
    const ReactActual = jest.requireActual('react');
    const { View } = jest.requireActual('react-native');
    return {
        __esModule: true,
        default: (props: { onChange: PickerChange }) => {
            mockPickerOnChange = props.onChange;
            return ReactActual.createElement(View, { testID: 'mock_date_picker' });
        },
    };
});

const LAGOS = 'Africa/Lagos';
// 2026-10-31T21:34Z: 31 Oct 2026 22:34 in Lagos, the device clock at the save.
const NOW = Date.UTC(2026, 9, 31, 21, 34);
// 2026-11-01T21:34Z: 1 Nov 2026 22:34 in Lagos, the day the user picks.
const PICKED = Date.UTC(2026, 10, 1, 21, 34);
// 2026-11-01T11:00Z: 1 Nov 2026 12:00 in Lagos, when the dashboard is read.
const NOVEMBER_MIDDAY = Date.UTC(2026, 10, 1, 11, 0);

const SOURCE_ID = 'w-source';
const DEST_ID = 'w-dest';
const SOURCE_BALANCE = 100000;
const DEST_BALANCE = 5000;
const TRANSFER_INPUT = '10';
const TRANSFER_AMOUNT = 1000;
const EXPENSE_INPUT = '25';
const EXPENSE_AMOUNT = 2500;

let db: SqlDatabase;

async function balanceOf(id: string): Promise<number> {
    const { rows } = await db.execute('SELECT balance FROM wallets WHERE id = ?', [id]);
    return Number(rows[0].balance);
}

async function storedRows() {
    const rows = await container.transactionRepository.getAll();
    return {
        outgoing: rows.find((tx) => tx.categoryId === 'transfer-out'),
        incoming: rows.find((tx) => tx.categoryId === 'transfer-in'),
        expense: rows.find((tx) => tx.type === TransactionType.EXPENSE),
        income: rows.find((tx) => tx.type === TransactionType.INCOME),
        count: rows.length,
    };
}

/** Render the sheet in `mode` and wait until it has loaded the seeded wallets. */
async function openSheet(onClose: jest.Mock, mode: 'expense' | 'income' | 'transfer') {
    const screen = render(<AddTransactionModal visible onClose={onClose} initialType={mode} />);
    await waitFor(() => {
        expect(screen.getAllByText('Source').length).toBeGreaterThan(0);
    });
    return screen;
}

type Screen = Awaited<ReturnType<typeof openSheet>>;

/** Choose Source as the "from" wallet, and Dest as the "to" wallet. */
function chooseWallets(screen: Screen) {
    fireEvent.press(screen.getByTestId('add_tx_wallet_picker'));
    fireEvent.press(screen.getByTestId(`add_tx_wallet_${SOURCE_ID}`));
    fireEvent.press(screen.getByTestId('add_tx_dest_wallet_picker'));
    fireEvent.press(screen.getByTestId(`add_tx_dest_wallet_${DEST_ID}`));
}

/** Choose the category explicitly rather than rely on the form's default. */
function chooseCategory(screen: Screen, categoryId: string) {
    fireEvent.press(screen.getByTestId('add_tx_category_picker'));
    fireEvent.press(screen.getByTestId(`add_tx_category_${categoryId}`));
}

/** Open the date row and pick `when` the way the picker reports a chosen day. */
async function pickDate(screen: Screen, when: number) {
    fireEvent.press(screen.getByText('modals.addTransaction.today'));
    await waitFor(() => expect(screen.getByTestId('mock_date_picker')).toBeTruthy());
    act(() => {
        mockPickerOnChange!({ type: 'set' }, new Date(when));
    });
    await waitFor(() => expect(screen.queryByText('modals.addTransaction.today')).toBeNull());
}

/** Press Save and wait for the sheet to report the save done. */
async function save(screen: Screen, onClose: jest.Mock, closesSoFar: number) {
    pressOnce(screen.getByTestId('add_tx_save_button'));
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(closesSoFar + 1));
    await settle();
}

beforeEach(async () => {
    installZoneClock(LAGOS, NOW);
    mockPickerOnChange = null;
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
        await container.categoryRepository.save({
            id: 'cat-food',
            name: 'Food',
            type: CategoryType.EXPENSE,
            icon: 'fast-food-outline',
            color: '#FF5722',
        });
        await container.categoryRepository.save({
            id: 'cat-salary',
            name: 'Salary',
            type: CategoryType.INCOME,
            icon: 'cash-outline',
            color: '#4CAF50',
        });
    });
});

afterEach(() => {
    jest.restoreAllMocks();
    restoreZoneClock();
    __setDatabaseForTests(null);
    container.reset();
});

describe('V-129 AddTransactionModal transfer date and note', () => {
    it('precondition: the device is still in October and the picked day is in November', () => {
        expect(getCurrentMonth()).toBe('2026-10');
        expect(new Date(PICKED).getMonth()).toBe(10);
        expect(new Date(PICKED).getDate()).toBe(1);
    });

    it('V-129 a: a transfer saved on 31 Oct at 22:34 with 1 Nov picked is stored on both legs with the picked date, as an expense from the same form is, and is counted in November', async () => {
        const onClose = jest.fn();
        const screen = await openSheet(onClose, 'transfer');
        chooseWallets(screen);
        fireEvent.changeText(screen.getByTestId('add_tx_amount_input'), TRANSFER_INPUT);
        await pickDate(screen, PICKED);
        await save(screen, onClose, 0);

        const afterTransfer = await storedRows();
        expect(afterTransfer.outgoing!.walletId).toBe(SOURCE_ID);
        expect(afterTransfer.incoming!.walletId).toBe(DEST_ID);
        expect(afterTransfer.outgoing!.date.getTime()).toBe(PICKED);
        expect(afterTransfer.incoming!.date.getTime()).toBe(PICKED);

        // The sheet is closed before the hook renders: RNTL drops events on a
        // tree once another render has replaced it as the current screen.
        screen.unmount();

        // The real reports hook, on the device's month, then on the next one.
        // Only the two legs are stored at this point.
        const reports = renderHook(() => useReports());
        await waitFor(() => expect(reports.result.current.loading).toBe(false));
        expect(reports.result.current.selectedMonth).toBe('2026-10');
        expect(reports.result.current.hasMonthActivity).toBe(false);
        act(() => reports.result.current.goToNextMonth());
        expect(reports.result.current.selectedMonth).toBe('2026-11');
        expect(reports.result.current.hasMonthActivity).toBe(true);
        reports.unmount();

        // An expense from the same form, opened again, with the same day picked.
        const expenseSheet = await openSheet(onClose, 'expense');
        chooseCategory(expenseSheet, 'cat-food');
        fireEvent.changeText(expenseSheet.getByTestId('add_tx_amount_input'), EXPENSE_INPUT);
        await pickDate(expenseSheet, PICKED);
        await save(expenseSheet, onClose, 1);

        const afterExpense = await storedRows();
        expect(afterExpense.expense!.date.getTime()).toBe(PICKED);
        expect(afterExpense.outgoing!.date.getTime()).toBe(afterExpense.expense!.date.getTime());
        expect(afterExpense.incoming!.date.getTime()).toBe(afterExpense.expense!.date.getTime());
    });

    it('V-129 b: a typed note follows the wallet text on both legs', async () => {
        const onClose = jest.fn();
        const screen = await openSheet(onClose, 'transfer');
        chooseWallets(screen);
        fireEvent.changeText(screen.getByTestId('add_tx_amount_input'), TRANSFER_INPUT);
        fireEvent.changeText(screen.getByTestId('add_tx_notes_input'), 'Rent share');
        await save(screen, onClose, 0);

        const { outgoing, incoming } = await storedRows();
        expect(outgoing!.note).toBe('Transfer to Dest - Rent share');
        expect(incoming!.note).toBe('Transfer from Source - Rent share');
    });

    it('V-129 b: a note of spaces only keeps the fixed text alone', async () => {
        const onClose = jest.fn();
        const screen = await openSheet(onClose, 'transfer');
        chooseWallets(screen);
        fireEvent.changeText(screen.getByTestId('add_tx_amount_input'), TRANSFER_INPUT);
        fireEvent.changeText(screen.getByTestId('add_tx_notes_input'), '   ');
        await save(screen, onClose, 0);

        const { outgoing, incoming } = await storedRows();
        expect(outgoing!.note).toBe('Transfer to Dest');
        expect(incoming!.note).toBe('Transfer from Source');
    });

    it('control: with no note typed both legs keep the fixed text', async () => {
        const onClose = jest.fn();
        const screen = await openSheet(onClose, 'transfer');
        chooseWallets(screen);
        fireEvent.changeText(screen.getByTestId('add_tx_amount_input'), TRANSFER_INPUT);
        await save(screen, onClose, 0);

        const { outgoing, incoming } = await storedRows();
        expect(outgoing!.note).toBe('Transfer to Dest');
        expect(incoming!.note).toBe('Transfer from Source');
    });

    it('control: an expense picked on 1 Nov is counted in November by the dashboard, and the dashboard counts no transfer', async () => {
        const onClose = jest.fn();
        const screen = await openSheet(onClose, 'transfer');
        chooseWallets(screen);
        fireEvent.changeText(screen.getByTestId('add_tx_amount_input'), TRANSFER_INPUT);
        await pickDate(screen, PICKED);
        await save(screen, onClose, 0);

        fireEvent.press(screen.getByTestId('add_tx_type_expense'));
        chooseCategory(screen, 'cat-food');
        fireEvent.changeText(screen.getByTestId('add_tx_amount_input'), EXPENSE_INPUT);
        await pickDate(screen, PICKED);
        await save(screen, onClose, 1);
        screen.unmount();

        // The dashboard shows the device's month only: read it from November.
        restoreZoneClock();
        installZoneClock(LAGOS, NOVEMBER_MIDDAY);
        expect(getCurrentMonth()).toBe('2026-11');

        const dashboard = renderHook(() => useDashboard());
        await waitFor(() => expect(dashboard.result.current.loading).toBe(false));
        expect(dashboard.result.current.currentMonthExpense).toBe(EXPENSE_AMOUNT);
        expect(dashboard.result.current.currentMonthIncome).toBe(0);
        expect(dashboard.result.current.previousMonthExpense).toBe(0);
        dashboard.unmount();
    });

    it('control: an expense and an income keep the picked date, and without a pick the present instant', async () => {
        const onClose = jest.fn();
        const screen = await openSheet(onClose, 'expense');
        chooseCategory(screen, 'cat-food');
        fireEvent.changeText(screen.getByTestId('add_tx_amount_input'), EXPENSE_INPUT);
        await pickDate(screen, PICKED);
        await save(screen, onClose, 0);

        fireEvent.press(screen.getByTestId('add_tx_type_income'));
        chooseCategory(screen, 'cat-salary');
        fireEvent.changeText(screen.getByTestId('add_tx_amount_input'), EXPENSE_INPUT);
        await save(screen, onClose, 1);

        const { expense, income } = await storedRows();
        expect(expense!.date.getTime()).toBe(PICKED);
        expect(income!.date.getTime()).toBe(NOW);
    });

    it('control: a transfer with a picked date moves the two balances by the amount', async () => {
        const onClose = jest.fn();
        const screen = await openSheet(onClose, 'transfer');
        chooseWallets(screen);
        fireEvent.changeText(screen.getByTestId('add_tx_amount_input'), TRANSFER_INPUT);
        fireEvent.changeText(screen.getByTestId('add_tx_notes_input'), 'Rent share');
        await pickDate(screen, PICKED);
        await save(screen, onClose, 0);

        expect((await storedRows()).count).toBe(2);
        expect(await balanceOf(SOURCE_ID)).toBe(SOURCE_BALANCE - TRANSFER_AMOUNT);
        expect(await balanceOf(DEST_ID)).toBe(DEST_BALANCE + TRANSFER_AMOUNT);
    });
});
