/**
 * AddTransactionModal - a saved expense or income carries a category of its type
 *
 * REGISTRE V-129 follow-up (pass 92b). The sheet picks the first category of
 * the current type only while no category is selected
 * (AddTransactionModal.tsx, auto-select effect), and the type segment changes
 * the type alone. A category chosen in one mode therefore stays selected after
 * a switch to the other, and Save, which checks only that some category is
 * selected, stores the pair. The tests below save after a switch and read the
 * stored row's category back: its type must be the transaction's type.
 *
 * The last regression case is the sheet the Dashboard keeps mounted and opens
 * on its income shortcut: the categories are already loaded when it opens,
 * and the reset made on opening runs in the same commit as the auto-select.
 *
 * Real here: the hooks, the use cases and an in-memory database.
 */

import { fireEvent, render, waitFor } from '@testing-library/react-native';
import React from 'react';
import { Alert } from 'react-native';

import { createTestDb } from '../../../../tests/helpers/createTestDb';
import { pressOnce, settle } from '../../../../tests/helpers/pressInOneBatch';
import { container } from '../../../core/di/container';
import { CategoryRepository } from '../../../data/repositories/CategoryRepository';
import { __setDatabaseForTests } from '../../../data/storage/sql/database';
import type { SqlDatabase } from '../../../data/storage/sql/SqlDatabase';
import { CategoryType, TransactionType, WalletType } from '../../../domain/entities';
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

const MAIN_ID = 'w-main';
const SPARE_ID = 'w-spare';
const FOOD_ID = 'cat-food';
const SALARY_ID = 'cat-salary';
const AMOUNT_INPUT = '25';

let db: SqlDatabase;

type Mode = 'expense' | 'income' | 'transfer';

/** Render the sheet in `mode` and wait until it has loaded the seeded wallets. */
async function openSheet(onClose: jest.Mock, mode: Mode) {
    const screen = render(<AddTransactionModal visible onClose={onClose} initialType={mode} />);
    await waitFor(() => {
        expect(screen.getAllByText('Main').length).toBeGreaterThan(0);
    });
    return screen;
}

type Screen = Awaited<ReturnType<typeof openSheet>>;

function chooseCategory(screen: Screen, categoryId: string) {
    fireEvent.press(screen.getByTestId('add_tx_category_picker'));
    fireEvent.press(screen.getByTestId(`add_tx_category_${categoryId}`));
}

function switchTo(screen: Screen, mode: Mode) {
    fireEvent.press(screen.getByTestId(`add_tx_type_${mode}`));
}

/** Type the amount, press Save, and wait until the sheet closed or alerted. */
async function save(screen: Screen, onClose: jest.Mock) {
    fireEvent.changeText(screen.getByTestId('add_tx_amount_input'), AMOUNT_INPUT);
    pressOnce(screen.getByTestId('add_tx_save_button'));
    await waitFor(() => {
        expect(onClose.mock.calls.length + (Alert.alert as jest.Mock).mock.calls.length).toBeGreaterThan(0);
    });
    await settle();
}

/** The one stored transaction and the category row its categoryId points to. */
async function savedRow() {
    const rows = await container.transactionRepository.getAll();
    expect(rows).toHaveLength(1);
    const category = await container.categoryRepository.getById(rows[0].categoryId);
    return { tx: rows[0], category };
}

beforeEach(async () => {
    jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    db = await createTestDb({ writeGuard: true });
    __setDatabaseForTests(db);
    container.reset();
    await db.runInTransaction(async () => {
        await container.walletRepository.save({
            id: MAIN_ID,
            name: 'Main',
            balance: 100000,
            type: WalletType.BANK,
            createdAt: new Date(2026, 0, 1),
        });
        await container.walletRepository.save({
            id: SPARE_ID,
            name: 'Spare',
            balance: 0,
            type: WalletType.BANK,
            createdAt: new Date(2026, 0, 2),
        });
        await container.categoryRepository.save({
            id: FOOD_ID,
            name: 'Food',
            type: CategoryType.EXPENSE,
            icon: 'fast-food-outline',
            color: '#FF5722',
        });
        await container.categoryRepository.save({
            id: SALARY_ID,
            name: 'Salary',
            type: CategoryType.INCOME,
            icon: 'cash-outline',
            color: '#4CAF50',
        });
    });
});

afterEach(() => {
    jest.restoreAllMocks();
    __setDatabaseForTests(null);
    container.reset();
});

describe('AddTransactionModal type switch and category', () => {
    it('regression: Food chosen as an expense, switched to income, saved: the income carries an income category', async () => {
        const onClose = jest.fn();
        const screen = await openSheet(onClose, 'expense');
        chooseCategory(screen, FOOD_ID);
        switchTo(screen, 'income');
        await save(screen, onClose);

        const { tx, category } = await savedRow();
        expect(tx.type).toBe(TransactionType.INCOME);
        expect(category!.type).toBe(CategoryType.INCOME);
    });

    it('regression: Salary chosen as an income, switched to expense, saved: the expense carries an expense category', async () => {
        const onClose = jest.fn();
        const screen = await openSheet(onClose, 'income');
        chooseCategory(screen, SALARY_ID);
        switchTo(screen, 'expense');
        await save(screen, onClose);

        const { tx, category } = await savedRow();
        expect(tx.type).toBe(TransactionType.EXPENSE);
        expect(category!.type).toBe(CategoryType.EXPENSE);
    });

    it('regression: opened as a transfer, switched to expense, saved: the expense carries an expense category', async () => {
        const onClose = jest.fn();
        const screen = await openSheet(onClose, 'transfer');
        switchTo(screen, 'expense');
        await save(screen, onClose);

        const { tx, category } = await savedRow();
        expect(tx.type).toBe(TransactionType.EXPENSE);
        expect(category!.type).toBe(CategoryType.EXPENSE);
    });

    it('regression: with no income category, a switch from expense to income saves nothing and asks for a category', async () => {
        await db.runInTransaction(() => container.categoryRepository.delete(SALARY_ID));
        const onClose = jest.fn();
        const screen = await openSheet(onClose, 'expense');
        chooseCategory(screen, FOOD_ID);
        switchTo(screen, 'income');
        await save(screen, onClose);

        expect(await container.transactionRepository.getAll()).toHaveLength(0);
        expect(onClose).not.toHaveBeenCalled();
        expect((Alert.alert as jest.Mock).mock.calls[0][0]).toBe('modals.addTransaction.noCategorySelected');
    });

    it('regression: a sheet mounted closed and opened on income after the categories loaded saves an income category', async () => {
        const getAll = jest.spyOn(CategoryRepository.prototype, 'getAll');
        const onClose = jest.fn();
        const screen = render(<AddTransactionModal visible={false} onClose={onClose} initialType="income" />);

        // Precondition: the categories were read before the sheet opens.
        await waitFor(() => expect(getAll).toHaveBeenCalled());
        await getAll.mock.results[0].value;
        await settle();

        screen.rerender(<AddTransactionModal visible onClose={onClose} initialType="income" />);
        await waitFor(() => {
            expect(screen.getAllByText('Main').length).toBeGreaterThan(0);
        });
        await save(screen, onClose);

        const { tx, category } = await savedRow();
        expect(tx.type).toBe(TransactionType.INCOME);
        expect(category!.type).toBe(CategoryType.INCOME);
    });

    it('control: an expense saved without a switch keeps the chosen category', async () => {
        const onClose = jest.fn();
        const screen = await openSheet(onClose, 'expense');
        chooseCategory(screen, FOOD_ID);
        await save(screen, onClose);

        const { tx } = await savedRow();
        expect(tx.type).toBe(TransactionType.EXPENSE);
        expect(tx.categoryId).toBe(FOOD_ID);
    });

    it('control: Food chosen as an expense, switched to transfer, saved: the legs carry the transfer ids', async () => {
        const onClose = jest.fn();
        const screen = await openSheet(onClose, 'expense');
        chooseCategory(screen, FOOD_ID);
        switchTo(screen, 'transfer');
        fireEvent.press(screen.getByTestId('add_tx_dest_wallet_picker'));
        fireEvent.press(screen.getByTestId(`add_tx_dest_wallet_${SPARE_ID}`));
        await save(screen, onClose);

        const rows = await container.transactionRepository.getAll();
        expect(rows.map((tx) => tx.categoryId).sort()).toEqual(['transfer-in', 'transfer-out']);
        expect(rows.every((tx) => tx.type === TransactionType.TRANSFER)).toBe(true);
    });
});
