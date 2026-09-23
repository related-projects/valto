import { act, fireEvent, render } from '@testing-library/react-native';
import React from 'react';
import { Alert } from 'react-native';

import { getCurrentMonth } from '../../domain/entities';
import type { BudgetSummary } from '../../hooks/useBudgets';
import i18n from '../../localization/i18n';
import { DashboardScreen } from '../DashboardScreen';

/**
 * DashboardScreen - F-09: a saved budget can be edited and deleted.
 *
 * Deleting asks first, exactly like a transaction (F-01), and a confirm calls
 * deleteBudget with the id of the row that was tapped. Editing reopens the
 * creation sheet pre-filled and saves through updateBudget, never createBudget.
 *
 * Rendered against the REAL en resources, with the data hooks mocked.
 */

// --- Fixtures -----------------------------------------------------------

function summary(id: string, categoryId: string, categoryName: string, limitAmount: number): BudgetSummary {
    return {
        budget: {
            id,
            categoryId,
            month: getCurrentMonth(),
            limitAmount,
            createdAt: new Date('2026-01-01T00:00:00.000Z'),
            updatedAt: new Date('2026-01-01T00:00:00.000Z'),
        },
        categoryName,
        categoryColor: '#F59E0B',
        spentAmount: 1000,
        remainingAmount: limitAmount - 1000,
        percentageUsed: (1000 / limitAmount) * 100,
        isOverBudget: false,
    };
}

// --- Mocks --------------------------------------------------------------

/** Mutable so a delete can drop the row the way the hook reload does. */
let mockBudgetSummaries: BudgetSummary[] = [];
const mockDeleteBudget = jest.fn();
const mockUpdateBudget = jest.fn();
const mockCreateBudget = jest.fn();

jest.mock('react-native-safe-area-context', () => ({
    useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.mock('expo-router', () => ({
    useRouter: () => ({ push: jest.fn() }),
    useFocusEffect: jest.fn(),
}));

jest.mock('../../core/security/SecurityContext', () => ({
    useSecurity: () => ({
        isSecurityEnabled: false,
        isUnlocked: true,
        unlockWithPin: jest.fn(),
        unlockWithBiometrics: jest.fn(),
        securityConfig: null,
        biometrics: { available: false, enrolled: false },
    }),
}));

jest.mock('../../hooks/useTransactions', () => ({
    useTransactions: () => ({
        transactions: [],
        filteredTransactions: [],
        filters: {},
        setFilters: jest.fn(),
        resetFilters: jest.fn(),
        loadNextPage: jest.fn(),
        loadingMore: false,
        refreshTransactions: jest.fn().mockResolvedValue(undefined),
        createTransaction: jest.fn(),
    }),
}));

jest.mock('../../hooks/useWallets', () => ({
    useWallets: () => ({
        wallets: [],
        getTotalBalance: () => 0,
        refreshWallets: jest.fn().mockResolvedValue(undefined),
        transferBetweenWallets: jest.fn(),
    }),
}));

jest.mock('../../hooks/useCategories', () => ({
    useCategories: () => ({
        categories: [
            { id: 'cat-food', name: 'Groceries', type: 'expense', color: '#F59E0B' },
            { id: 'cat-rent', name: 'Rent', type: 'expense', color: '#3B82F6' },
        ],
        expenseCategories: [
            { id: 'cat-food', name: 'Groceries', type: 'expense', color: '#F59E0B' },
            { id: 'cat-rent', name: 'Rent', type: 'expense', color: '#3B82F6' },
        ],
        incomeCategories: [],
    }),
}));

jest.mock('../../hooks/useDashboard', () => ({
    useDashboard: () => ({
        spendingByCategory: [],
        currentMonthIncome: 0,
        currentMonthExpense: 0,
        previousMonthExpense: 0,
        netBalance: 0,
        incomeChange: null,
        expenseChange: null,
        netBalanceChange: null,
        hasExpenseData: false,
        loading: false,
    }),
}));

jest.mock('../../hooks/useBudgets', () => ({
    useBudgets: () => ({
        budgets: mockBudgetSummaries.map((s) => s.budget),
        budgetSummaries: mockBudgetSummaries,
        totalBudgetLimit: mockBudgetSummaries.reduce((sum, s) => sum + s.budget.limitAmount, 0),
        totalBudgetSpent: mockBudgetSummaries.reduce((sum, s) => sum + s.spentAmount, 0),
        hasBudgets: mockBudgetSummaries.length > 0,
        createBudget: mockCreateBudget,
        updateBudget: mockUpdateBudget,
        deleteBudget: mockDeleteBudget,
        refreshBudgets: jest.fn().mockResolvedValue(undefined),
        budgetedCategoryIds: mockBudgetSummaries.map((s) => s.budget.categoryId),
    }),
}));

jest.mock('../../hooks/useFinancialInsights', () => ({
    useFinancialInsights: () => ({
        savingsHealth: { level: 'weak', messageKey: 'insights.noIncomeNoExpense', messageParams: {} },
        spendingTrend: { messageKey: 'insights.noSpendingEither', messageParams: {} },
        categoryRisk: { topCategory: 'None', percentage: 0, riskLevel: 'low' },
        budgetPace: null,
    }),
}));

jest.mock('../../hooks/useRecurringRules', () => ({
    useRecurringRules: () => ({ rules: [], statuses: {}, loading: false }),
}));

// One object for every render: the real hook memoizes these callbacks, and the
// sheet's pre-fill effect depends on centsToMajor keeping its identity.
const mockFormatting = {
    formatAmount: (v: number) => String(v),
    formatAmountCompact: (v: number) => String(v),
    formatAmountWhole: (v: number) => String(v),
    parseAmountToCents: (v: string) => (v ? Number(v) * 100 : null),
    parseAmountToCentsResult: (v: string) =>
        (v ? { ok: true, value: Number(v) * 100 } : { ok: false, cause: 'empty' }),
    centsToMajor: (v: number) => v / 100,
    amountPlaceholder: '0.00',
    decimals: 2,
};

jest.mock('../../hooks/useFormatting', () => ({
    useFormatting: () => mockFormatting,
}));

// --- Harness ------------------------------------------------------------

type AlertButton = { text?: string; style?: string; onPress?: () => void | Promise<void> };

/** The button of the given style on the most recent Alert.alert call, found by style. */
function lastAlertButton(style: 'cancel' | 'destructive'): AlertButton | undefined {
    const calls = (Alert.alert as unknown as jest.Mock).mock.calls;
    const buttons = (calls[calls.length - 1]?.[2] ?? []) as AlertButton[];
    return buttons.find((button) => button.style === style);
}

beforeAll(async () => {
    await i18n.changeLanguage('en');
});

beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    mockBudgetSummaries = [
        summary('b1', 'cat-food', 'Groceries', 45000),
        summary('b2', 'cat-rent', 'Rent', 90000),
    ];
    mockDeleteBudget.mockImplementation(async (id: string) => {
        mockBudgetSummaries = mockBudgetSummaries.filter((s) => s.budget.id !== id);
    });
    mockUpdateBudget.mockResolvedValue(undefined);
});

// --- Tests --------------------------------------------------------------

describe('DashboardScreen - delete a budget', () => {
    it('asks first, then deletes the tapped budget and drops it from the list', async () => {
        const screen = render(<DashboardScreen />);

        fireEvent.press(screen.getByTestId('budget_delete_b1'));

        // Nothing is deleted before the user confirms.
        expect(Alert.alert).toHaveBeenCalledTimes(1);
        expect(mockDeleteBudget).not.toHaveBeenCalled();

        await act(async () => {
            await lastAlertButton('destructive')?.onPress?.();
        });

        expect(mockDeleteBudget).toHaveBeenCalledTimes(1);
        expect(mockDeleteBudget).toHaveBeenCalledWith('b1');

        screen.rerender(<DashboardScreen />);
        expect(screen.queryByTestId('budget_delete_b1')).toBeNull();
        expect(screen.queryByText('Groceries')).toBeNull();
        expect(screen.getByTestId('budget_delete_b2')).toBeTruthy();
    });
});

describe('DashboardScreen - edit a budget', () => {
    it('opens the creation sheet pre-filled and saves through updateBudget', async () => {
        const screen = render(<DashboardScreen />);

        fireEvent.press(screen.getByTestId('budget_edit_b1'));

        expect(screen.getByText(i18n.t('modals.addBudget.editTitle'))).toBeTruthy();
        const input = screen.getByDisplayValue('450');

        fireEvent.changeText(input, '500');
        await act(async () => {
            fireEvent.press(screen.getByTestId('add_budget_save'));
        });

        expect(mockUpdateBudget).toHaveBeenCalledTimes(1);
        expect(mockUpdateBudget).toHaveBeenCalledWith({ id: 'b1', limitAmount: 50000 });
        expect(mockCreateBudget).not.toHaveBeenCalled();
    });
});
