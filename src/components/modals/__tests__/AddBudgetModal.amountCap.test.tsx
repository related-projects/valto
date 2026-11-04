import { fireEvent, render, waitFor } from '@testing-library/react-native';
import React from 'react';
import { Alert } from 'react-native';

import { CAP_CASES, CAP_MINOR, echoedTooLarge, type CapCase } from '../../../../tests/helpers/amountCapCases';
import { getDefaultSettings } from '../../../data/services/settingsService';
import { getCurrentMonth } from '../../../domain/entities';
import { makeBudget, makeCategory } from '../../../test-utils/testFactories';
import { AddBudgetModal } from '../AddBudgetModal';

/**
 * AddBudgetModal - a limit above the cap is refused (REGISTRE V-128)
 *
 * Pass 87 found a budget limit could be made Infinity. The limit is read
 * through the shared parser; above 999 999 999 999 minor units the sheet now
 * shows the tooLarge sentence, naming the maximum in the user's currency, and
 * neither creates nor updates the budget. The tests named "control" pass
 * before the fix: the cap itself is handed to the write unchanged.
 *
 * Real here: useFormatting and the parser. The categories hook is mocked; the
 * writes are the sheet's onCreateBudget and onUpdateBudget props.
 */

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

type Mode = 'create' | 'edit';

const onCreateBudget = jest.fn();
const onUpdateBudget = jest.fn();

beforeEach(() => {
    jest.clearAllMocks();
    onCreateBudget.mockResolvedValue(undefined);
    onUpdateBudget.mockResolvedValue(undefined);
    mockedUseCategories.mockReturnValue({ expenseCategories: [RENT] });
});

afterEach(() => {
    jest.restoreAllMocks();
});

/** Open the sheet in `mode` under the currency of `c`, type `input` as the limit, press Save. */
async function save(c: CapCase, mode: Mode, input: string) {
    mockedLoadSettings.mockResolvedValue({
        ...getDefaultSettings(),
        currency: c.code,
        decimalSeparator: c.profile,
    });
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    const editing = makeBudget({ id: 'budget-rent', categoryId: RENT.id, month: getCurrentMonth(), limitAmount: 50000 });
    const screen = render(
        <AddBudgetModal
            visible
            onClose={jest.fn()}
            onCreateBudget={onCreateBudget}
            budgetedCategoryIds={[]}
            initialBudget={mode === 'edit' ? editing : null}
            onUpdateBudget={mode === 'edit' ? onUpdateBudget : undefined}
        />,
    );

    // The edit pre-fill re-runs when the currency's exponent lands; type after it.
    await waitFor(() => {
        expect(screen.getByPlaceholderText(c.placeholder).props.keyboardType).toBe(c.keyboardType);
    });

    if (mode === 'create') {
        fireEvent.press(screen.getByText(RENT.name));
    }
    fireEvent.changeText(screen.getByPlaceholderText(c.placeholder), input);
    fireEvent.press(screen.getByTestId('add_budget_save'));

    await waitFor(() => {
        expect(
            alertSpy.mock.calls.length + onCreateBudget.mock.calls.length + onUpdateBudget.mock.calls.length,
        ).toBeGreaterThan(0);
    });
    return alertSpy;
}

const MATRIX: [string, Mode, CapCase][] = CAP_CASES.flatMap((c) =>
    (['create', 'edit'] as Mode[]).map((mode): [string, Mode, CapCase] => [c.code, mode, c]),
);

describe('V-128 AddBudgetModal limit cap', () => {
    it.each(MATRIX)('V-128 %s %s: the cap plus one is refused with the maximum, and nothing is written', async (_code, mode, c) => {
        const alertSpy = await save(c, mode, c.overInput);

        expect(onCreateBudget).not.toHaveBeenCalled();
        expect(onUpdateBudget).not.toHaveBeenCalled();
        expect(alertSpy).toHaveBeenCalledWith('modals.addBudget.invalidAmount', echoedTooLarge(c.max));
    });

    it.each(MATRIX)('control: %s %s: the cap is the limit, exactly 999999999999', async (_code, mode, c) => {
        const alertSpy = await save(c, mode, c.capInput);

        expect(alertSpy).not.toHaveBeenCalled();
        if (mode === 'edit') {
            expect(onUpdateBudget).toHaveBeenCalledWith({ id: 'budget-rent', limitAmount: CAP_MINOR });
            expect(onCreateBudget).not.toHaveBeenCalled();
        } else {
            expect(onCreateBudget).toHaveBeenCalledWith(expect.objectContaining({
                categoryId: RENT.id,
                limitAmount: CAP_MINOR,
            }));
            expect(onUpdateBudget).not.toHaveBeenCalled();
        }
    });
});
