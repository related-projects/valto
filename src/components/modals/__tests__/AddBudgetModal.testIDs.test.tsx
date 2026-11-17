/**
 * AddBudgetModal - the amount field and the category choices have stable
 * testIDs (pass 94, item 2)
 *
 * The limit input (AddBudgetModal.tsx:301) and the category choices had no
 * testID; only Save did. The input is now add_budget_amount_input and each
 * choice add_budget_category_<category id>. The choice test presses the id and
 * checks the category is then the one selected, through the check mark that
 * only the selected choice shows.
 *
 * Harness as in AddBudgetModal.amountCap.test.tsx (t is the identity).
 */

import { fireEvent, render, waitFor, within } from '@testing-library/react-native';
import React from 'react';
import { TextInput } from 'react-native';

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
const FOOD = makeCategory({ id: 'cat-food', name: 'Groceries' });

beforeEach(() => {
    jest.clearAllMocks();
    mockedLoadSettings.mockResolvedValue(getDefaultSettings());
    mockedUseCategories.mockReturnValue({ expenseCategories: [RENT, FOOD] });
});

async function renderSheet() {
    const screen = render(
        <AddBudgetModal visible onClose={jest.fn()} onCreateBudget={jest.fn()} budgetedCategoryIds={[]} />,
    );
    await waitFor(() => expect(mockedLoadSettings).toHaveBeenCalled());
    return screen;
}

describe('pass 94 item 2. AddBudgetModal testIDs', () => {
    it('pass 94 item 2. add_budget_amount_input is the limit TextInput', async () => {
        const { UNSAFE_getByType } = await renderSheet();

        expect(UNSAFE_getByType(TextInput).props.testID).toBe('add_budget_amount_input');
    });

    it.each([RENT, FOOD].map(c => [c.id, c]))('pass 94 item 2. add_budget_category_%s selects that category', async (id, category) => {
        const { getByTestId } = await renderSheet();

        const choice = getByTestId(`add_budget_category_${id}`);
        expect(within(choice).getByText(category.name)).toBeTruthy();

        // The check mark is drawn inside the selected choice only.
        const checksIn = (categoryId: string) =>
            within(getByTestId(`add_budget_category_${categoryId}`))
                .UNSAFE_queryAllByProps({ name: 'checkmark-circle' }).length;
        const other = [RENT, FOOD].find(c => c.id !== id)!;

        fireEvent.press(choice);
        expect(checksIn(id)).toBeGreaterThan(0);
        expect(checksIn(other.id)).toBe(0);
    });
});
