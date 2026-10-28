/**
 * The create-budget icon on the budget card has a screen reader label (pass 84,
 * item 2)
 *
 * Once a budget exists, the card's only way to create another is an add icon
 * in its header. It had no role and no label, so TalkBack announced an
 * unlabelled control. It now reads as a button named by the same key as the
 * empty-state call to action, components.budgetProgress.createBudget.
 */

import { fireEvent, render } from '@testing-library/react-native';
import React from 'react';

import { BudgetProgress } from '../BudgetProgress';

jest.mock('react-i18next', () => ({
    useTranslation: () => ({ t: (key: string) => key }),
}));

jest.mock('../../../hooks/useFormatting', () => ({
    useFormatting: () => ({
        formatAmount: (v: number) => String(v),
    }),
}));

jest.mock('../../../theme/theme', () => ({
    useTheme: () => ({
        colors: {
            background: '#fff',
            foreground: '#000',
            mutedForeground: '#666',
            muted: '#eee',
            destructive: '#E14141',
            destructiveBackground: '#fee',
            warning: '#fa0',
            warningBackground: '#ffe',
            success: '#0a0',
            successBackground: '#efe',
            card: '#f5f5f5',
            border: '#ddd',
            accent: '#eef',
            accentForeground: '#000',
        },
        spacing: { xxs: 2, xs: 4, sm: 8, md: 16, lg: 20, xl: 24 },
        radius: { sm: 8, md: 12, lg: 16, xl: 20, full: 999 },
        typography: {
            sizes: { xs: 12, sm: 14, md: 16, lg: 18, '2xl': 24 },
            weights: { regular: '400', medium: '500', semibold: '600', bold: '700' },
        },
        shadows: { card: {}, elevated: {}, soft: {} },
    }),
}));

describe('pass 84 item 2. BudgetProgress header icon', () => {
    it('pass 84 item 2. exposes a button labelled by components.budgetProgress.createBudget', () => {
        const onCreateBudget = jest.fn();
        const { getByRole, queryByTestId } = render(
            <BudgetProgress
                hasBudgets
                budgetSummaries={[]}
                totalSpent={0}
                totalLimit={10000}
                onCreateBudget={onCreateBudget}
            />,
        );
        // The card with budgets: the empty-state call to action is not rendered.
        expect(queryByTestId('budget_progress_create_budget')).toBeNull();

        const button = getByRole('button', { name: 'components.budgetProgress.createBudget' });
        fireEvent.press(button);

        expect(onCreateBudget).toHaveBeenCalledTimes(1);
    });
});
