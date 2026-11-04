import { fireEvent, render, waitFor } from '@testing-library/react-native';
import React from 'react';
import { Alert } from 'react-native';

import { CAP_CASES, CAP_MINOR, echoedTooLarge, type CapCase } from '../../../../tests/helpers/amountCapCases';
import { getDefaultSettings } from '../../../data/services/settingsService';
import { makeCategory, makeRecurringRule, makeWallet } from '../../../test-utils/testFactories';
import { RecurringRuleForm } from '../RecurringRuleForm';

/**
 * RecurringRuleForm - a rule amount above the cap is refused (REGISTRE V-128)
 *
 * Every occurrence of a rule is written at the rule's amount, so the amount is
 * read through the shared parser like any other. Above 999 999 999 999 minor
 * units the form now shows the tooLarge sentence, naming the maximum in the
 * user's currency, and submits nothing, on create and on edit. The tests named
 * "control" pass before the fix: the cap itself is submitted unchanged.
 *
 * Real here: useFormatting and the parser. The wallets and categories hooks
 * are mocked; the write is the form's onSubmit prop.
 */

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

const mockedUseWallets = jest.requireMock('../../../hooks/useWallets').useWallets as jest.Mock;
const mockedUseCategories = jest.requireMock('../../../hooks/useCategories').useCategories as jest.Mock;
const mockedLoadSettings = jest.requireMock('../../../data/services/settingsService')
    .loadSettings as jest.Mock;

const CASH = makeWallet({ id: 'w-cash', name: 'Cash' });
const RENT = makeCategory({ id: 'cat-rent', name: 'Rent' });

type Mode = 'create' | 'edit';

const onSubmit = jest.fn();

beforeEach(() => {
    jest.clearAllMocks();
    onSubmit.mockResolvedValue(undefined);
    mockedUseWallets.mockReturnValue({ wallets: [CASH] });
    mockedUseCategories.mockReturnValue({ categories: [RENT] });
});

afterEach(() => {
    jest.restoreAllMocks();
});

/** Open the form in `mode` under the currency of `c`, type `input`, submit, wait for an outcome. */
async function submit(c: CapCase, mode: Mode, input: string) {
    mockedLoadSettings.mockResolvedValue({
        ...getDefaultSettings(),
        currency: c.code,
        decimalSeparator: c.profile,
    });
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    const existingRule = mode === 'edit'
        ? makeRecurringRule({ id: 'rule-rent', walletId: CASH.id, categoryId: RENT.id, amount: 45000 })
        : undefined;
    const screen = render(
        <RecurringRuleForm existingRule={existingRule} onSubmit={onSubmit} onCancel={jest.fn()} />,
    );

    // The edit seed re-runs when the currency's exponent lands; type after it.
    await waitFor(() => {
        expect(screen.getByPlaceholderText(c.placeholder).props.keyboardType).toBe(c.keyboardType);
    });

    if (mode === 'create') {
        fireEvent.press(screen.getByText('recurring.selectCategory'));
        fireEvent.press(screen.getByText(RENT.name));
    }
    fireEvent.changeText(screen.getByPlaceholderText(c.placeholder), input);
    fireEvent.press(screen.getByText(mode === 'edit' ? 'recurring.updateRule' : 'recurring.createRule'));

    await waitFor(() => {
        expect(alertSpy.mock.calls.length + onSubmit.mock.calls.length).toBeGreaterThan(0);
    });
    return alertSpy;
}

const MATRIX: [string, Mode, CapCase][] = CAP_CASES.flatMap((c) =>
    (['create', 'edit'] as Mode[]).map((mode): [string, Mode, CapCase] => [c.code, mode, c]),
);

describe('V-128 RecurringRuleForm amount cap', () => {
    it.each(MATRIX)('V-128 %s %s: the cap plus one is refused with the maximum, and nothing is submitted', async (_code, mode, c) => {
        const alertSpy = await submit(c, mode, c.overInput);

        expect(onSubmit).not.toHaveBeenCalled();
        expect(alertSpy).toHaveBeenCalledWith('recurring.invalidAmount', echoedTooLarge(c.max));
    });

    it.each(MATRIX)('control: %s %s: the cap is the rule amount, exactly 999999999999', async (_code, mode, c) => {
        const alertSpy = await submit(c, mode, c.capInput);

        expect(alertSpy).not.toHaveBeenCalled();
        expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({
            amount: CAP_MINOR,
            walletId: CASH.id,
            categoryId: RENT.id,
        }));
    });
});
