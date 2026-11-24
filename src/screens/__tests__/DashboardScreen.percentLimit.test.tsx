import { render, screen } from '@testing-library/react-native';
import React from 'react';

import { getDefaultSettings } from '../../data/services/settingsService';
import i18n from '../../localization/i18n';
import { DashboardScreen } from '../DashboardScreen';

/**
 * DashboardScreen - insight banners say "over 999%" beyond 999 %
 *
 * REGISTRE C28, Owner decisions 21/11, decision 1. Three banners interpolate a
 * percentage into a translated sentence: savings health (spendingOverIncome),
 * budget pace (spendingAhead) and category risk. The first two can grow
 * without bound - an income of one minor unit, or a pace measured against an
 * expected spend near zero - and printed every digit. Beyond 999 the {{percent}}
 * of the sentence is now "over 999"; the template's own "%" follows it. Within
 * range a banner is unchanged (controls).
 *
 * Harness from DashboardScreen.categoryRisk.test.tsx, with the insights mock
 * reading a mutable record so each test sets its own banners. Strings written
 * out from en.json.
 */

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

jest.mock('../../data/services/settingsService', () => {
    const actual = jest.requireActual('../../data/services/settingsService');
    return { ...actual, loadSettings: jest.fn() };
});

// `mock` prefix so jest.mock() hoisting allows the reference.
const mockWallet = {
    id: 'w1',
    name: 'Main',
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

type MockInsights = {
    savingsHealth: { level: string; messageKey: string; messageParams: Record<string, string | number> };
    spendingTrend: { messageKey: string; messageParams: Record<string, string | number> };
    categoryRisk: { topCategory: string; percentage: number; riskLevel: string };
    budgetPace: { overBudgetPace: boolean; messageKey: string; messageParams: Record<string, string | number> } | null;
};

const quietInsights = (): MockInsights => ({
    savingsHealth: { level: 'weak', messageKey: 'insights.noIncomeNoExpense', messageParams: {} },
    spendingTrend: { messageKey: 'insights.noSpendingEither', messageParams: {} },
    categoryRisk: { topCategory: 'None', percentage: 0, riskLevel: 'low' },
    budgetPace: null,
});

// `mock` prefix so jest.mock() hoisting allows the reference.
let mockInsights: MockInsights = quietInsights();

jest.mock('../../hooks/useFinancialInsights', () => ({
    useFinancialInsights: () => mockInsights,
}));

jest.mock('../../hooks/useRecurringRules', () => ({
    useRecurringRules: () => ({ rules: [], statuses: {}, loading: false }),
}));

const mockedLoadSettings = jest.requireMock('../../data/services/settingsService')
    .loadSettings as jest.Mock;

beforeAll(async () => {
    await i18n.changeLanguage('en');
});

beforeEach(() => {
    jest.clearAllMocks();
    mockInsights = quietInsights();
    mockedLoadSettings.mockResolvedValue({
        ...getDefaultSettings(),
        currency: 'USD',
        language: 'en',
        decimalSeparator: 'dot',
    });
});

const renderLoaded = async () => {
    render(<DashboardScreen />);
    // Total balance and the wallet row: the settings are loaded.
    expect((await screen.findAllByText('$5,000.00')).length).toBeGreaterThan(0);
};

describe('C28 DashboardScreen insight banners', () => {
    it('savings health: spending 99999999900 % over income reads "over 999%"', async () => {
        mockInsights.savingsHealth = {
            level: 'deficit',
            messageKey: 'insights.spendingOverIncome',
            messageParams: { percent: 99999999900 },
        };
        await renderLoaded();

        expect(screen.getByText("You're spending over 999% more than you earn.")).toBeTruthy();
        expect(screen.queryByText(/99999999900/)).toBeNull();
    });

    it('budget pace: an unbounded pace ("Infinity") reads "over 999%"', async () => {
        mockInsights.budgetPace = {
            overBudgetPace: true,
            messageKey: 'insights.spendingAhead',
            messageParams: { percent: 'Infinity' },
        };
        await renderLoaded();

        expect(screen.getByText('Spending is over 999% ahead of budget pace.')).toBeTruthy();
    });

    it('budget pace: 123456 % ahead reads "over 999%"', async () => {
        mockInsights.budgetPace = {
            overBudgetPace: true,
            messageKey: 'insights.spendingAhead',
            messageParams: { percent: '123456' },
        };
        await renderLoaded();

        expect(screen.getByText('Spending is over 999% ahead of budget pace.')).toBeTruthy();
    });

    it('category risk: a share above 999 reads "over 999%"', async () => {
        mockInsights.categoryRisk = { topCategory: 'Food', percentage: 1500, riskLevel: 'high' };
        await renderLoaded();

        expect(screen.getByText('Food accounts for over 999% of your spending.')).toBeTruthy();
    });

    it('control: banners within range keep their digits', async () => {
        mockInsights.savingsHealth = {
            level: 'deficit',
            messageKey: 'insights.spendingOverIncome',
            messageParams: { percent: 999 },
        };
        mockInsights.budgetPace = {
            overBudgetPace: true,
            messageKey: 'insights.spendingAhead',
            messageParams: { percent: '12' },
        };
        mockInsights.categoryRisk = { topCategory: 'Food', percentage: 39.6, riskLevel: 'medium' };
        await renderLoaded();

        expect(screen.getByText("You're spending 999% more than you earn.")).toBeTruthy();
        expect(screen.getByText('Spending is 12% ahead of budget pace.')).toBeTruthy();
        expect(screen.getByText('Food accounts for 40% of your spending.')).toBeTruthy();
    });
});
