/**
 * DashboardScreen first-expense tests
 *
 * The observed failure state: wallets funded, nothing recorded, "Aucune
 * transaction" everywhere and no obvious next step. In that state the dashboard
 * must offer the add-expense action, and the budget CTA - capping a spend that
 * has not been entered yet - must not be the strongest affordance on the screen.
 *
 * Rendered against the REAL fr resources. A t() stub returning the key cannot
 * tell "Ajouter une dépense" from "Créer un budget".
 */

jest.mock('react-native-safe-area-context', () => ({
    useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.mock('expo-router', () => ({
    useRouter: () => ({ push: jest.fn() }),
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
    name: 'Uba Account',
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

jest.mock('../../hooks/useFormatting', () => ({
    useFormatting: () => ({
        formatAmount: (v: number) => String(v),
        formatAmountCompact: (v: number) => String(v),
        formatAmountWhole: (v: number) => String(v),
        parseAmountToCents: (v: string) => (v ? Number(v) : null),
        decimals: 2,
    }),
}));

import { fireEvent, render } from '@testing-library/react-native';
import React from 'react';

import i18n from '../../localization/i18n';
import { DashboardScreen } from '../DashboardScreen';

beforeAll(async () => {
    await i18n.changeLanguage('fr');
});

describe('DashboardScreen with one wallet and zero transactions', () => {
    it('offers the add-expense action from the transactions empty state', () => {
        const { getByTestId, queryByText, getByText } = render(<DashboardScreen />);

        expect(getByText('Ajouter une dépense')).toBeTruthy();
        expect(queryByText('Ajouter une transaction')).toBeNull();

        fireEvent.press(getByTestId('transaction_list_add_first'));

        // The add-transaction sheet is open, on the expense leg.
        expect(getByText('Ajouter une transaction')).toBeTruthy();
        expect(getByTestId('add_tx_type_expense')).toBeTruthy();
    });

    it('de-emphasises the budget CTA while no transaction has been recorded', () => {
        const { getByTestId } = render(<DashboardScreen />);

        const budgetCta = getByTestId('budget_progress_create_budget');
        const style = Array.isArray(budgetCta.props.style)
            ? Object.assign({}, ...budgetCta.props.style)
            : budgetCta.props.style;

        // Still present and still reachable - just not filled like a primary action.
        expect(budgetCta.props.accessibilityLabel).toBe('Créer un budget');
        expect(style.backgroundColor).toBe('transparent');
        expect(style.borderWidth).toBe(1);
    });
});
