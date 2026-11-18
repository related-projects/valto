/**
 * DashboardScreen - the sheets it hosts, with the keyboard up (pass 95)
 *
 * DashboardScreen mounts AddTransactionModal, TransferModal and AddBudgetModal
 * inside its own ScrollView. The touch responder walks the React tree, not the
 * native window, so that ScrollView is offered every tap made inside those
 * sheets before their controls are. With keyboardShouldPersistTaps unset
 * ("never") it takes the first tap after typing an amount to close the
 * keyboard, whatever the sheet's own ScrollView says.
 *
 * Jest has no soft keyboard, so this pins the prop on every scroll view above a
 * control of the add-transaction sheet opened from the dashboard (see
 * test-utils/scrollAncestors).
 *
 * Harness as in DashboardScreen.firstExpense.test.tsx. jest.mock calls are
 * hoisted above the imports; the factories read the `mock`-prefixed wallet
 * only when the hooks are called, at render.
 */

import { fireEvent, render } from '@testing-library/react-native';
import React from 'react';

import i18n from '../../localization/i18n';
import { scrollAncestorTapModes } from '../../test-utils/scrollAncestors';
import { DashboardScreen } from '../DashboardScreen';

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

// `mock` prefix so jest.mock() hoisting allows the reference.
const mockWallet = {
    id: 'w1',
    name: 'Main Account',
    balance: 500000,
    type: 'bank',
    createdAt: new Date('2024-01-01T00:00:00.000Z'),
};

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
        wallets: [mockWallet],
        getTotalBalance: () => mockWallet.balance,
        refreshWallets: jest.fn().mockResolvedValue(undefined),
        transferBetweenWallets: jest.fn(),
    }),
}));

jest.mock('../../hooks/useCategories', () => ({
    useCategories: () => ({ categories: [], expenseCategories: [], incomeCategories: [] }),
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
        budgets: [],
        budgetSummaries: [],
        totalBudgetLimit: 0,
        totalBudgetSpent: 0,
        hasBudgets: false,
        createBudget: jest.fn(),
        updateBudget: jest.fn(),
        deleteBudget: jest.fn(),
        refreshBudgets: jest.fn().mockResolvedValue(undefined),
        budgetedCategoryIds: [],
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

jest.mock('../../hooks/useFormatting', () => ({
    useFormatting: () => ({
        formatAmount: (v: number) => String(v),
        formatAmountCompactLarge: (v: number) => String(v),
        formatAmountWhole: (v: number) => String(v),
        formatPercentNumber: (v: number, d: number) => v.toFixed(d),
        parseAmountToCentsResult: (v: string) =>
            (v ? { ok: true, value: Number(v) } : { ok: false, cause: 'empty' }),
        amountPlaceholder: '0.00',
        decimals: 2,
    }),
}));

beforeAll(async () => {
    await i18n.changeLanguage('en');
});

describe('pass 95. DashboardScreen sheets with the keyboard up', () => {
    it('pass 95. every scroll view above a control of the add-transaction sheet keeps the tap', () => {
        const { getByTestId, queryByTestId } = render(<DashboardScreen />);
        // The forcing: the sheet is closed until the empty-state action is pressed.
        expect(queryByTestId('add_tx_category_picker')).toBeNull();
        fireEvent.press(getByTestId('transaction_list_add_first'));

        // Nearest first: the sheet's ScrollView, then the dashboard ScrollView.
        expect(scrollAncestorTapModes(getByTestId('add_tx_category_picker'))).toEqual([
            'handled',
            'handled',
        ]);
    });
});
