/**
 * TransactionFilterModal — Amount Filter Units
 *
 * Covers the boundary the modal owns: the user types MAJOR units ("50") and the
 * filter it emits must be in the same unit the transactions are stored in —
 * integer cents. A unit mismatch here is silent (both sides are plain numbers),
 * so these tests assert end-to-end BEHAVIOUR: the emitted filter is fed straight
 * into the real filterTransactions and we check which transactions survive.
 *
 * The assertions deliberately never name the filter fields — they exercise
 * set → store → compare as one path, which is where the unit bug actually lives.
 */

import { fireEvent, render, waitFor } from '@testing-library/react-native';
import React from 'react';

import { Transaction, TransactionType } from '../../../domain/entities';
import { filterTransactions, TransactionFilters } from '../../../domain/filters/filterTransactions';
import { getDefaultSettings } from '../../../data/services/settingsService';
import { TransactionFilterModal } from '../TransactionFilterModal';

// ─── Mocks ────────────────────────────────────────────────────────────
// Only the data sources are mocked. useFormatting and the parsing utils run for
// real — they are the code under test.

jest.mock('../../../hooks/useCategories', () => ({
    useCategories: () => ({ categories: [], loading: false, error: null }),
}));

jest.mock('../../../hooks/useWallets', () => ({
    useWallets: () => ({ wallets: [], loading: false, error: null }),
}));

jest.mock('react-i18next', () => ({
    useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en' } }),
}));

jest.mock('../../../data/services/settingsService', () => {
    const actual = jest.requireActual('../../../data/services/settingsService');
    return { ...actual, loadSettings: jest.fn() };
});

const mockedLoadSettings = jest.requireMock('../../../data/services/settingsService')
    .loadSettings as jest.Mock;

// ─── Fixtures ─────────────────────────────────────────────────────────

/** Amounts are integer cents, and always positive — type carries the sign. */
function tx(id: string, amountCents: number, type = TransactionType.EXPENSE): Transaction {
    return {
        id,
        type,
        amount: amountCents,
        categoryId: 'food',
        walletId: 'wallet-cash',
        date: new Date('2026-03-01T10:00:00'),
        createdAt: new Date('2026-03-01T10:00:00'),
    };
}

const SIXTY_CENTS = tx('tx-60c', 60);          // $0.60
const SIXTY_DOLLARS = tx('tx-60d', 6000);      // $60.00

// ─── Harness ──────────────────────────────────────────────────────────

/**
 * Render the modal, type the given bounds, press Apply, and return the filters
 * it emitted. Empty string = leave the field untouched.
 */
async function applyAmountFilter(min: string, max: string): Promise<TransactionFilters> {
    const onApply = jest.fn();
    const { getByTestId } = render(
        <TransactionFilterModal
            visible
            onClose={jest.fn()}
            currentFilters={{}}
            onApply={onApply}
            onReset={jest.fn()}
        />,
    );

    // Let useFormatting resolve settings so the real separator preference is active.
    await waitFor(() => expect(mockedLoadSettings).toHaveBeenCalled());

    if (min !== '') fireEvent.changeText(getByTestId('filter_min_amount_input'), min);
    if (max !== '') fireEvent.changeText(getByTestId('filter_max_amount_input'), max);
    fireEvent.press(getByTestId('filter_apply_button'));

    await waitFor(() => expect(onApply).toHaveBeenCalled());
    return onApply.mock.calls[0][0] as TransactionFilters;
}

/** Run the emitted filter through the real domain filter. */
function idsMatching(filters: TransactionFilters, transactions: Transaction[]): string[] {
    return filterTransactions(transactions, filters).map((t) => t.id);
}

beforeEach(() => {
    jest.clearAllMocks();
    mockedLoadSettings.mockResolvedValue(getDefaultSettings());
});

// ─── Tests ────────────────────────────────────────────────────────────

describe('TransactionFilterModal — amount filter units', () => {
    it('treats a "min 50" filter as $50.00, not 50 cents', async () => {
        const filters = await applyAmountFilter('50', '');

        expect(idsMatching(filters, [SIXTY_CENTS, SIXTY_DOLLARS])).toEqual(['tx-60d']);
    });

    it('treats a "max 50" filter as $50.00, not 50 cents', async () => {
        const filters = await applyAmountFilter('', '50');

        expect(idsMatching(filters, [SIXTY_CENTS, SIXTY_DOLLARS])).toEqual(['tx-60c']);
    });

    it('selects only what falls inside a min+max range, boundaries inclusive', async () => {
        const filters = await applyAmountFilter('10', '50');

        const below = tx('below', 999);        // $9.99
        const lowerEdge = tx('lower-edge', 1000);   // $10.00 — inclusive
        const inside = tx('inside', 2550);     // $25.50
        const upperEdge = tx('upper-edge', 5000);   // $50.00 — inclusive
        const above = tx('above', 5001);       // $50.01

        expect(idsMatching(filters, [below, lowerEdge, inside, upperEdge, above])).toEqual([
            'lower-edge',
            'inside',
            'upper-edge',
        ]);
    });

    it('matches on magnitude, so "min 50" catches a $60 expense and a $60 income alike', async () => {
        const filters = await applyAmountFilter('50', '');

        const expense = tx('expense-60', 6000, TransactionType.EXPENSE);
        const income = tx('income-60', 6000, TransactionType.INCOME);

        expect(idsMatching(filters, [expense, income])).toEqual(['expense-60', 'income-60']);
    });

    it('honours the comma decimal separator preference', async () => {
        mockedLoadSettings.mockResolvedValue({ ...getDefaultSettings(), decimalSeparator: 'comma' });

        const filters = await applyAmountFilter('50,50', '');

        const justUnder = tx('just-under', 5049);   // $50.49
        const atBound = tx('at-bound', 5050);       // $50.50
        expect(idsMatching(filters, [justUnder, atBound])).toEqual(['at-bound']);
    });

    describe('invalid or empty input leaves that bound unapplied', () => {
        // Silently dropping unparseable input is the established behaviour (no Alert,
        // no copy change) — these lock in that the dropped bound simply doesn't constrain.
        it.each([
            ['non-numeric', 'abc'],
            ['negative', '-5'],
            ['ambiguous grouping', '1,2,3'],
            ['bare separator', '.'],
        ])('a %s min is dropped, so nothing is excluded from below', async (_label, min) => {
            const filters = await applyAmountFilter(min, '');

            expect(idsMatching(filters, [SIXTY_CENTS, SIXTY_DOLLARS])).toEqual([
                'tx-60c',
                'tx-60d',
            ]);
        });

        it('drops an invalid min without applying it or blocking a valid max', async () => {
            const filters = await applyAmountFilter('abc', '50');

            // Only the max bound survives: $0.60 stays, $60.00 is cut.
            expect(idsMatching(filters, [SIXTY_CENTS, SIXTY_DOLLARS])).toEqual(['tx-60c']);
        });

        it('applies no amount constraint at all when both bounds are invalid', async () => {
            const filters = await applyAmountFilter('abc', 'xyz');

            expect(idsMatching(filters, [SIXTY_CENTS, SIXTY_DOLLARS])).toEqual([
                'tx-60c',
                'tx-60d',
            ]);
        });
    });
});
