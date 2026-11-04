import { fireEvent, render, waitFor } from '@testing-library/react-native';
import React from 'react';
import { Alert } from 'react-native';

import { CAP_CASES, CAP_MINOR, echoedTooLarge, type CapCase } from '../../../../tests/helpers/amountCapCases';
import { getDefaultSettings } from '../../../data/services/settingsService';
import { TransactionFilterModal } from '../TransactionFilterModal';

/**
 * TransactionFilterModal - a bound above the cap is refused (REGISTRE V-128)
 *
 * The min and max bounds are read through the shared parser. A bound above
 * 999 999 999 999 minor units could never match a transaction entered in the
 * app, and the number may not even be exact; the sheet now shows the tooLarge
 * sentence, naming the maximum in the user's currency, and applies nothing.
 * Other unreadable input is still dropped without a message, as before. The
 * tests named "control" pass before the fix: the cap itself is applied
 * unchanged.
 *
 * Real here: useFormatting and the parser. The write is the onApply prop.
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
    useCategories: () => ({ categories: [], loading: false, error: null }),
}));

jest.mock('../../../hooks/useWallets', () => ({
    useWallets: () => ({ wallets: [], loading: false, error: null }),
}));

jest.mock('../../../data/services/settingsService', () => {
    const actual = jest.requireActual('../../../data/services/settingsService');
    return { ...actual, loadSettings: jest.fn() };
});

const mockedLoadSettings = jest.requireMock('../../../data/services/settingsService')
    .loadSettings as jest.Mock;

type Bound = 'min' | 'max';

const onApply = jest.fn();

beforeEach(() => {
    jest.clearAllMocks();
});

afterEach(() => {
    jest.restoreAllMocks();
});

/** Open the sheet under the currency of `c`, type `input` in one bound, press Apply. */
async function apply(c: CapCase, bound: Bound, input: string) {
    mockedLoadSettings.mockResolvedValue({
        ...getDefaultSettings(),
        currency: c.code,
        decimalSeparator: c.profile,
    });
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    const onClose = jest.fn();
    const screen = render(
        <TransactionFilterModal visible onClose={onClose} currentFilters={{}} onApply={onApply} onReset={jest.fn()} />,
    );
    const testID = bound === 'min' ? 'filter_min_amount_input' : 'filter_max_amount_input';

    await waitFor(() => {
        expect(screen.getByTestId(testID).props.keyboardType).toBe(c.keyboardType);
    });

    fireEvent.changeText(screen.getByTestId(testID), input);
    fireEvent.press(screen.getByTestId('filter_apply_button'));

    await waitFor(() => {
        expect(alertSpy.mock.calls.length + onApply.mock.calls.length).toBeGreaterThan(0);
    });
    return { alertSpy, onClose };
}

const MATRIX: [string, Bound, CapCase][] = CAP_CASES.flatMap((c) =>
    (['min', 'max'] as Bound[]).map((bound): [string, Bound, CapCase] => [c.code, bound, c]),
);

describe('V-128 TransactionFilterModal amount cap', () => {
    it.each(MATRIX)('V-128 %s %s: the cap plus one is refused with the maximum, and no filter is applied', async (_code, bound, c) => {
        const { alertSpy, onClose } = await apply(c, bound, c.overInput);

        expect(onApply).not.toHaveBeenCalled();
        expect(onClose).not.toHaveBeenCalled();
        expect(alertSpy).toHaveBeenCalledWith('transactions.filter.amountRange', echoedTooLarge(c.max));
    });

    it.each(MATRIX)('control: %s %s: the cap is applied as exactly 999999999999', async (_code, bound, c) => {
        const { alertSpy } = await apply(c, bound, c.capInput);

        expect(alertSpy).not.toHaveBeenCalled();
        expect(onApply).toHaveBeenCalledWith(
            bound === 'min' ? { minAmountCents: CAP_MINOR } : { maxAmountCents: CAP_MINOR },
        );
    });

    it('control: unreadable input is still dropped without a message', async () => {
        const { alertSpy } = await apply(CAP_CASES[1], 'min', 'abc');

        expect(alertSpy).not.toHaveBeenCalled();
        expect(onApply).toHaveBeenCalledWith({});
    });
});
