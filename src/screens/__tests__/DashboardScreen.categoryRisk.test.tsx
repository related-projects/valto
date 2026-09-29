import { render, screen } from '@testing-library/react-native';
import React from 'react';

import { getDefaultSettings } from '../../data/services/settingsService';
import i18n from '../../localization/i18n';
import { DashboardScreen } from '../DashboardScreen';

/**
 * DashboardScreen - the category-risk insight prints its share
 *
 * Registry V-95. The insight's percentage is built on this screen, not in the
 * domain: evaluateCategoryRisk returns a number and the screen turns it into
 * the {{percent}} of insights.categoryRisk. No test reached that line; every
 * other dashboard suite renders riskLevel 'low', where the banner is absent.
 *
 * This is a CONTROL. The share is printed with 0 digits, so it carries no
 * separator under any profile and reads the same before and after the screen
 * moves onto the shared percentage helper. It runs the REAL useFormatting under
 * the comma profile (set in settingsService.loadSettings) so the helper, not a
 * stub, is what prints it. Expected strings are written out, never derived:
 * comma profile amounts are "5.000,00" plus U+00A0 plus the symbol (\xA0 here).
 *
 * Harness from DashboardScreen.firstExpense.test.tsx, minus its useFormatting
 * mock.
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

// 39.6 is a 'medium' share (30 to 40), so the banner renders, and it rounds to 40.
jest.mock('../../hooks/useFinancialInsights', () => ({
    useFinancialInsights: () => ({
        savingsHealth: { level: 'weak', messageKey: 'insights.noIncomeNoExpense', messageParams: {} },
        spendingTrend: { messageKey: 'insights.noSpendingEither', messageParams: {} },
        categoryRisk: { topCategory: 'Food', percentage: 39.6, riskLevel: 'medium' },
        budgetPace: null,
    }),
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
    mockedLoadSettings.mockResolvedValue({
        ...getDefaultSettings(),
        currency: 'USD',
        language: 'en',
        decimalSeparator: 'comma',
    });
});

describe('DashboardScreen category-risk insight', () => {
    it('control: prints a 0-digit share with no separator under the comma profile', async () => {
        render(<DashboardScreen />);

        // Total balance and the wallet row: the comma profile is loaded.
        expect((await screen.findAllByText('5.000,00\xA0$')).length).toBeGreaterThan(0);
        expect(screen.getByText('Food accounts for 40% of your spending.')).toBeTruthy();
    });
});
