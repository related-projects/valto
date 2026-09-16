/**
 * TransactionDetailsModal - delete affordance and shared row content
 *
 * Two things are pinned here.
 *
 * 1. The detail screen and the list describe a transaction with ONE voice. They
 *    used to disagree (the list titled rows with the note, the detail screen
 *    painted transfers a blue the list never used), so the assertion compares
 *    the two trees directly rather than checking either against a literal.
 *
 * 2. Deleting is deliberate and safe: it asks first, a cancel does nothing, a
 *    confirm dismisses BEFORE the refreshed list drops the row (so a successful
 *    delete can never land on the error screen), and a transfer offers no
 *    affordance at all - deleting one leg would orphan the other.
 *
 * Only the data sources and the navigator are mocked; the presenter runs for real.
 */

import { fireEvent, render, within } from '@testing-library/react-native';
import React from 'react';
import { Alert } from 'react-native';

import { Transaction, TransactionType } from '../../../domain/entities';
import { TransactionList } from '../../transactions/TransactionList';
import { TransactionDetailsModal } from '../TransactionDetailsModal';

// ─── Fixtures ─────────────────────────────────────────────────────────

const CATEGORIES = [
    { id: 'cat-food', name: 'Groceries', type: 'expense', icon: 'restaurant', color: '#F59E0B' },
];

const WALLETS = [{ id: 'wallet-cash', name: 'Cash Wallet', balance: 100000, type: 'cash' }];

function tx(overrides: Partial<Transaction> = {}): Transaction {
    return {
        id: 'tx-1',
        type: TransactionType.EXPENSE,
        amount: 6000,
        categoryId: 'cat-food',
        walletId: 'wallet-cash',
        date: new Date('2026-03-01T10:00:00'),
        createdAt: new Date('2026-03-01T10:00:00'),
        ...overrides,
    };
}

const EXPENSE = tx({ note: 'Weekly shop at the market' });
const TRANSFER_LEG = tx({ type: TransactionType.TRANSFER, categoryId: 'transfer-out' });

// ─── Mocks ────────────────────────────────────────────────────────────

/** Mutable so a test can simulate the list refresh that follows a delete. */
let mockTransactions: Transaction[] = [EXPENSE];
const mockDeleteTransaction = jest.fn();
const mockBack = jest.fn();

jest.mock('expo-router', () => ({
    useLocalSearchParams: () => ({ id: 'tx-1' }),
    useRouter: () => ({ push: jest.fn() }),
    router: { back: (...args: unknown[]) => mockBack(...args) },
    // The delete button is handed to the navigator, so render what we hand over.
    Stack: {
        Screen: ({ options }: { options?: { headerRight?: () => React.ReactElement } }) =>
            options?.headerRight ? options.headerRight() : null,
    },
}));

jest.mock('../../../hooks/useTransactions', () => ({
    useTransactions: () => ({
        transactions: mockTransactions,
        loading: false,
        deleteTransaction: mockDeleteTransaction,
    }),
}));

jest.mock('../../../hooks/useCategories', () => ({
    useCategories: () => ({ categories: CATEGORIES, loading: false, error: null }),
}));

jest.mock('../../../hooks/useWallets', () => ({
    useWallets: () => ({ wallets: WALLETS, loading: false, error: null }),
}));

jest.mock('../../../hooks/useFormatting', () => ({
    useFormatting: () => ({
        formatAmount: (cents: number) => `$${(cents / 100).toFixed(2)}`,
        formatDate: () => '03/01/2026',
    }),
}));

jest.mock('react-i18next', () => ({
    useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en' } }),
}));

// ─── Harness ──────────────────────────────────────────────────────────

type AlertButton = { text?: string; style?: string; onPress?: () => void | Promise<void> };

/** The buttons handed to the most recent Alert.alert call. */
function lastAlertButtons(): AlertButton[] {
    const calls = (Alert.alert as unknown as jest.Mock).mock.calls;
    return calls[calls.length - 1][2] as AlertButton[];
}

/**
 * The button of the given style, found BY style rather than by position.
 *
 * Reaching for buttons[1] would make the tests below vacuous: reorder the alert
 * and they would tap Cancel, assert that nothing happened, and still pass. Only
 * the "exactly one destructive step" test indexes, because pinning the order is
 * what that test is for - and it is what makes this lookup unambiguous.
 */
function lastAlertButton(style: 'cancel' | 'destructive'): AlertButton | undefined {
    return lastAlertButtons().find((button) => button.style === style);
}

beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    mockTransactions = [EXPENSE];
});

// ─── Tests ────────────────────────────────────────────────────────────

describe('TransactionDetailsModal - one voice with the list', () => {
    it('names the transaction exactly as the list row does', () => {
        const modal = render(<TransactionDetailsModal />);
        const list = render(<TransactionList transactions={[EXPENSE]} showDateHeaders={false} />);

        expect(modal.getByTestId('transaction_row_title').props.children).toEqual(
            list.getByTestId('transaction_row_title').props.children,
        );
        expect(modal.getByTestId('transaction_row_subtitle').props.children).toEqual(
            list.getByTestId('transaction_row_subtitle').props.children,
        );
        expect(modal.getByTestId('transaction_row_amount').props.children).toEqual(
            list.getByTestId('transaction_row_amount').props.children,
        );
    });

    it('still shows the note in full, now that it has left the title', () => {
        const { getByText } = render(<TransactionDetailsModal />);

        expect(getByText('Weekly shop at the market')).toBeTruthy();
    });
});

describe('TransactionDetailsModal - delete', () => {
    it('labels the delete affordance as text, not a bare glyph', () => {
        const { getByTestId } = render(<TransactionDetailsModal />);

        // Every other sheet spells an irreversible action out at header right.
        // A lone trash glyph names the action for nobody and reads as decoration.
        expect(
            within(getByTestId('transaction_delete_button')).getByText('common.delete'),
        ).toBeTruthy();
    });

    it('asks before deleting anything', () => {
        const { getByTestId } = render(<TransactionDetailsModal />);

        fireEvent.press(getByTestId('transaction_delete_button'));

        expect(Alert.alert).toHaveBeenCalledWith(
            'modals.transactionDetails.deleteTitle',
            'modals.transactionDetails.deleteMessage',
            expect.any(Array),
        );
        expect(mockDeleteTransaction).not.toHaveBeenCalled();
    });

    it('offers exactly one destructive step, not a nested second confirmation', () => {
        const { getByTestId } = render(<TransactionDetailsModal />);

        fireEvent.press(getByTestId('transaction_delete_button'));
        const buttons = lastAlertButtons();

        expect(buttons).toHaveLength(2);
        expect(buttons[0].style).toBe('cancel');
        expect(buttons[1].style).toBe('destructive');
    });

    it('does nothing at all when the confirmation is cancelled', async () => {
        const { getByTestId } = render(<TransactionDetailsModal />);

        fireEvent.press(getByTestId('transaction_delete_button'));
        await lastAlertButton('cancel')?.onPress?.();

        expect(mockDeleteTransaction).not.toHaveBeenCalled();
        expect(mockBack).not.toHaveBeenCalled();
    });

    it('deletes and dismisses on confirm, without ever showing an error state', async () => {
        const view = render(<TransactionDetailsModal />);

        fireEvent.press(view.getByTestId('transaction_delete_button'));
        await lastAlertButton('destructive')?.onPress?.();

        expect(mockDeleteTransaction).toHaveBeenCalledWith('tx-1');
        expect(mockBack).toHaveBeenCalled();

        // The refreshed list now has no such transaction. The screen is on its way
        // out, so it must render nothing rather than "something went wrong".
        mockTransactions = [];
        view.rerender(<TransactionDetailsModal />);
        expect(view.queryByText('common.somethingWentWrong')).toBeNull();
    });

    it('reports a failed delete instead of failing silently', async () => {
        mockDeleteTransaction.mockRejectedValueOnce(new Error('boom'));
        const { getByTestId } = render(<TransactionDetailsModal />);

        fireEvent.press(getByTestId('transaction_delete_button'));
        await lastAlertButton('destructive')?.onPress?.();

        expect(Alert.alert).toHaveBeenLastCalledWith(
            'alerts.error',
            'modals.transactionDetails.deleteFailed',
        );
    });

    it('offers no delete affordance on a transfer leg', () => {
        mockTransactions = [TRANSFER_LEG];

        const { queryByTestId } = render(<TransactionDetailsModal />);

        expect(queryByTestId('transaction_delete_button')).toBeNull();
    });
});
