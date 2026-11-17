/**
 * RecurringRuleForm - every control has a stable testID (pass 94, item 2)
 *
 * The rule form had no testID: close, the type and frequency segments, the
 * three text fields, the wallet and category pickers and their items, the
 * start-date trigger, the end-date toggle and trigger, the picker Done buttons
 * and the two action buttons. Each now carries one. The text fields are
 * InputFields, so each also exposes `${id}_input` on its TextInput.
 *
 * Opening a picker is checked without the new ids: by the item text appearing
 * once more, or by the marker view that stands in for the native date picker.
 * jest renders the iOS branch, which is where the Done buttons live.
 *
 * Harness as in RecurringRuleForm.amountCap.test.tsx (t is the identity).
 */

import { fireEvent, render, waitFor, within } from '@testing-library/react-native';
import React from 'react';

import { getDefaultSettings } from '../../../data/services/settingsService';
import { makeCategory, makeWallet } from '../../../test-utils/testFactories';
import { RecurringRuleForm } from '../RecurringRuleForm';

jest.mock('react-i18next', () => ({
    ...jest.requireActual('react-i18next'),
    useTranslation: () => ({
        t: (key: string, params?: Record<string, unknown>) =>
            params === undefined ? key : `${key} ${JSON.stringify(params)}`,
        i18n: { language: 'en' },
    }),
}));

jest.mock('react-native-safe-area-context', () => ({
    useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.mock('../../../hooks/useWallets', () => ({
    useWallets: jest.fn(),
}));

jest.mock('../../../hooks/useCategories', () => ({
    useCategories: jest.fn(),
}));

jest.mock('../../../data/services/settingsService', () => {
    const actual = jest.requireActual('../../../data/services/settingsService');
    return { ...actual, loadSettings: jest.fn() };
});

jest.mock('@react-native-community/datetimepicker', () => {
    const ReactActual = jest.requireActual('react');
    const { View } = jest.requireActual('react-native');
    return {
        __esModule: true,
        default: () => ReactActual.createElement(View, { testID: 'mock_date_picker' }),
    };
});

const mockedUseWallets = jest.requireMock('../../../hooks/useWallets').useWallets as jest.Mock;
const mockedUseCategories = jest.requireMock('../../../hooks/useCategories').useCategories as jest.Mock;
const mockedLoadSettings = jest.requireMock('../../../data/services/settingsService')
    .loadSettings as jest.Mock;

const CASH = makeWallet({ id: 'w-cash', name: 'Cash' });
const RENT = makeCategory({ id: 'cat-rent', name: 'Rent' });

beforeEach(() => {
    jest.clearAllMocks();
    mockedLoadSettings.mockResolvedValue(getDefaultSettings());
    mockedUseWallets.mockReturnValue({ wallets: [CASH] });
    mockedUseCategories.mockReturnValue({ categories: [RENT] });
});

async function renderForm(onCancel: jest.Mock = jest.fn()) {
    const screen = render(
        <RecurringRuleForm onSubmit={jest.fn().mockResolvedValue(undefined)} onCancel={onCancel} />,
    );
    await waitFor(() => expect(mockedLoadSettings).toHaveBeenCalled());
    return screen;
}

describe('pass 94 item 2. RecurringRuleForm testIDs', () => {
    it.each([
        ['recurring_form_type_expense', 'recurring.segmentExpense'],
        ['recurring_form_type_income', 'recurring.segmentIncome'],
        ['recurring_form_frequency_daily', 'recurring.segmentDaily'],
        ['recurring_form_frequency_weekly', 'recurring.segmentWeekly'],
        ['recurring_form_frequency_monthly', 'recurring.segmentMonthly'],
        ['recurring_form_frequency_yearly', 'recurring.segmentYearly'],
        ['recurring_form_save_button', 'recurring.createRule'],
        ['recurring_form_cancel_button', 'common.cancel'],
        ['recurring_form_end_date_toggle', 'recurring.setEndDate'],
    ])('pass 94 item 2. %s is the control showing %s', async (id, key) => {
        const { getByTestId } = await renderForm();

        expect(within(getByTestId(id)).getByText(key)).toBeTruthy();
    });

    it.each([
        ['recurring_form_amount', 'recurring.amount'],
        ['recurring_form_description', 'recurring.description'],
        ['recurring_form_interval', 'recurring.repeatEvery'],
    ])('pass 94 item 2. %s wraps the field labelled %s, and its TextInput is %s_input', async (id, labelKey) => {
        const { getByTestId } = await renderForm();

        const field = getByTestId(id);
        expect(within(field).getByText(labelKey)).toBeTruthy();
        expect(within(field).getByTestId(`${id}_input`).props.onChangeText).toEqual(expect.any(Function));
    });

    it.each([
        ['recurring_form_wallet_picker', 'recurring_form_wallet_', CASH],
        ['recurring_form_category_picker', 'recurring_form_category_', RENT],
    ] as const)('pass 94 item 2. %s opens a list whose items carry %s<id>', async (pickerId, itemPrefix, entity) => {
        const { getByTestId, queryAllByText } = await renderForm();

        const before = queryAllByText(entity.name).length;
        fireEvent.press(getByTestId(pickerId));

        // The forcing, independent of the ids: the list is open.
        expect(queryAllByText(entity.name)).toHaveLength(before + 1);
        expect(within(getByTestId(`${itemPrefix}${entity.id}`)).getByText(entity.name)).toBeTruthy();
    });

    it('pass 94 item 2. recurring_form_close_button cancels the form', async () => {
        const onCancel = jest.fn();
        const { getByTestId } = await renderForm(onCancel);

        fireEvent.press(getByTestId('recurring_form_close_button'));

        expect(onCancel).toHaveBeenCalledTimes(1);
    });

    it('pass 94 item 2. the start date trigger and its Done button carry ids', async () => {
        const { getByTestId, queryByTestId } = await renderForm();

        expect(queryByTestId('mock_date_picker')).toBeNull();
        fireEvent.press(getByTestId('recurring_form_start_date_button'));

        // The forcing, independent of the ids: the picker is open.
        expect(getByTestId('mock_date_picker')).toBeTruthy();
        fireEvent.press(getByTestId('recurring_form_start_date_done'));
        expect(queryByTestId('mock_date_picker')).toBeNull();
    });

    it('pass 94 item 2. the end date trigger and its Done button carry ids', async () => {
        const { getByTestId, getAllByLabelText, queryByTestId } = await renderForm();

        // Turn the end date on through its label, so this step does not lean on an id.
        expect(getAllByLabelText('a11y.selectDate')).toHaveLength(1);
        fireEvent.press(getAllByLabelText('a11y.toggleEndDate')[0]);
        expect(getAllByLabelText('a11y.selectDate')).toHaveLength(2);

        fireEvent.press(getByTestId('recurring_form_end_date_button'));

        expect(getByTestId('mock_date_picker')).toBeTruthy();
        fireEvent.press(getByTestId('recurring_form_end_date_done'));
        expect(queryByTestId('mock_date_picker')).toBeNull();
    });
});
