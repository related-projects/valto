/**
 * A new budget is filed under the current period of the stored start day
 * (REGISTRE C20 step 2, pass 98 item 4).
 *
 * On 25 November 2026 with start day 20, the current period is 20 Nov - 19
 * Dec, named 2026-12 (start days 16-31 name the month after the start): the
 * budget created now is a 2026-12 budget. With start day 1 it is 2026-11.
 */

import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import React from 'react';

import { pinClock, restoreZoneClock } from '../../../../tests/helpers/zoneClock';
import { getDefaultSettings } from '../../../data/services/settingsService';
import { makeCategory } from '../../../test-utils/testFactories';
import { AddBudgetModal } from '../AddBudgetModal';

jest.mock('react-i18next', () => ({
    ...jest.requireActual('react-i18next'),
    useTranslation: () => ({
        t: (key: string, params?: Record<string, unknown>) =>
            params === undefined ? key : `${key} ${JSON.stringify(params)}`,
        i18n: { language: 'en' },
    }),
}));

jest.mock('../../../hooks/useCategories', () => ({
    useCategories: jest.fn(),
}));

jest.mock('../../../data/services/settingsService', () => {
    const actual = jest.requireActual('../../../data/services/settingsService');
    return { ...actual, loadSettings: jest.fn() };
});

const mockedUseCategories = jest.requireMock('../../../hooks/useCategories').useCategories as jest.Mock;
const mockedLoadSettings = jest.requireMock('../../../data/services/settingsService')
    .loadSettings as jest.Mock;

const RENT = makeCategory({ id: 'cat-rent', name: 'Rent' });

beforeEach(() => {
    jest.clearAllMocks();
    pinClock(new Date(2026, 10, 25, 12, 0).getTime());
    mockedLoadSettings.mockResolvedValue({ ...getDefaultSettings(), monthStartDay: 20 });
    mockedUseCategories.mockReturnValue({ expenseCategories: [RENT] });
});

afterEach(() => {
    restoreZoneClock();
});

describe('pass 98 item 4. AddBudgetModal with start day 20', () => {
    it('pass 98 item 4. creates the budget for period 2026-12', async () => {
        const onCreateBudget = jest.fn().mockResolvedValue(undefined);
        const { getByTestId } = render(
            <AddBudgetModal visible onClose={jest.fn()} onCreateBudget={onCreateBudget} budgetedCategoryIds={[]} />,
        );
        await waitFor(() => expect(mockedLoadSettings).toHaveBeenCalled());
        // Let every settings read reach the component.
        await act(async () => undefined);

        fireEvent.press(getByTestId('add_budget_category_cat-rent'));
        fireEvent.changeText(getByTestId('add_budget_amount_input'), '100');
        await act(async () => {
            fireEvent.press(getByTestId('add_budget_save'));
        });

        expect(onCreateBudget).toHaveBeenCalledWith({ categoryId: 'cat-rent', month: '2026-12', limitAmount: 10000 });
    });
});
