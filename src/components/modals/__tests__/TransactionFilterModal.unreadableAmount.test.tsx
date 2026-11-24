import { fireEvent, render, waitFor } from '@testing-library/react-native';
import React from 'react';
import { Alert } from 'react-native';

import { getDefaultSettings } from '../../../data/services/settingsService';
import { amountPlaceholder } from '../../../utils/amountPlaceholder';
import { TransactionFilterModal } from '../TransactionFilterModal';

/**
 * TransactionFilterModal - an amount bound the parser cannot read is refused
 * with a message (REGISTRE C27, pass 101b item 4)
 *
 * The min and max bounds are read through the shared parser. Only a bound
 * above the entry cap was refused with a message (REGISTRE V-128); any other
 * refusal was dropped without a word, so the user saw a filter applied
 * without the bound they typed. A bound that is not a number, or that carries
 * more decimals than the currency has, is now refused the same way as the
 * too-large one: same title, the shared sentence for its cause, and nothing
 * applied. What the parser accepts is unchanged.
 *
 * The tests named "control" pass before the fix: a negative or zero bound is
 * still dropped without a message.
 *
 * Harness as in TransactionFilterModal.amountCap.test.tsx: t echoes its key
 * and parameters. Real here: useFormatting and the parser.
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
    mockedLoadSettings.mockResolvedValue({ ...getDefaultSettings(), currency: 'USD', decimalSeparator: 'dot' });
});

afterEach(() => {
    jest.restoreAllMocks();
});

/** Open the sheet (USD, dot), type `input` in one bound, press Apply. */
async function apply(bound: Bound, input: string) {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    const onClose = jest.fn();
    const screen = render(
        <TransactionFilterModal visible onClose={onClose} currentFilters={{}} onApply={onApply} onReset={jest.fn()} />,
    );
    await waitFor(() => expect(mockedLoadSettings).toHaveBeenCalled());

    const testID = bound === 'min' ? 'filter_min_amount_input' : 'filter_max_amount_input';
    fireEvent.changeText(screen.getByTestId(testID), input);
    fireEvent.press(screen.getByTestId('filter_apply_button'));

    await waitFor(() => {
        expect(alertSpy.mock.calls.length + onApply.mock.calls.length).toBeGreaterThan(0);
    });
    return { alertSpy, onClose };
}

const NOT_A_NUMBER = 'common.amountErrors.notANumber';
const TOO_MANY_DECIMALS = `common.amountErrors.tooManyDecimals ${JSON.stringify({ example: amountPlaceholder(2, 'dot') })}`;

const REFUSED: [string, Bound, string, string][] = (['min', 'max'] as Bound[]).flatMap((bound) => [
    ['letters', bound, 'abc', NOT_A_NUMBER],
    ['ambiguous grouping', bound, '1,2,3', NOT_A_NUMBER],
    ['bare separator', bound, '.', NOT_A_NUMBER],
    ['three decimals in USD', bound, '12.555', TOO_MANY_DECIMALS],
] as [string, Bound, string, string][]);

describe('C27 pass 101b item 4. TransactionFilterModal unreadable amount', () => {
    it.each(REFUSED)('C27 pass 101b item 4 (%s, %s "%s"): refused with a message, and no filter is applied', async (_label, bound, input, message) => {
        const { alertSpy, onClose } = await apply(bound, input);

        expect(alertSpy).toHaveBeenCalledWith('transactions.filter.amountRange', message);
        expect(onApply).not.toHaveBeenCalled();
        expect(onClose).not.toHaveBeenCalled();
    });

    it.each([
        ['negative', '-5'],
        ['zero', '0'],
    ])('control: a %s min ("%s") is still dropped without a message', async (_label, input) => {
        const { alertSpy } = await apply('min', input);

        expect(alertSpy).not.toHaveBeenCalled();
        expect(onApply).toHaveBeenCalledWith({});
    });
});
