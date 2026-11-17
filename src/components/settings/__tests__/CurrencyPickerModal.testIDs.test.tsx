/**
 * CurrencyPickerModal - each currency row has a stable testID
 * (pass 94, item 2)
 *
 * The rows had no testID, so a flow could only pick a currency by its code
 * text. Each row now carries currency_picker_item_<code>. The list is a
 * FlatList that renders its first rows only, so the rows checked are the first
 * few of the table, plus the last one reached through the search field the way
 * a flow would reach it. Each test presses the id and checks the matching
 * currency is the one selected.
 */

import { fireEvent, render, waitFor, within } from '@testing-library/react-native';
import React from 'react';

import { SUPPORTED_CURRENCIES } from '../../../domain/constants/currencies';
import i18n from '../../../localization/i18n';
import { CurrencyPickerModal } from '../CurrencyPickerModal';

jest.mock('react-native-safe-area-context', () => ({
    useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

const FIRST = SUPPORTED_CURRENCIES.slice(0, 3);
const LAST = SUPPORTED_CURRENCIES[SUPPORTED_CURRENCIES.length - 1];

function renderPicker(onSelect: jest.Mock) {
    return render(
        <CurrencyPickerModal visible onClose={jest.fn()} onSelect={onSelect} selectedCode="EUR" locked={false} />,
    );
}

beforeAll(async () => {
    await i18n.changeLanguage('en');
});

describe('pass 94 item 2. CurrencyPickerModal testIDs', () => {
    it.each(FIRST.map(c => [c.code, c]))('pass 94 item 2. currency_picker_item_%s selects that currency', (code, currency) => {
        const onSelect = jest.fn();
        const { getByTestId } = renderPicker(onSelect);

        const row = getByTestId(`currency_picker_item_${code}`);
        expect(within(row).getByText(code)).toBeTruthy();

        fireEvent.press(row);
        expect(onSelect).toHaveBeenCalledWith(currency);
    });

    it('pass 94 item 2. a row reached through the search carries its code', async () => {
        const onSelect = jest.fn();
        const { getByPlaceholderText, getByTestId, queryByText } = renderPicker(onSelect);

        // The forcing, independent of the ids: the last row is not rendered yet.
        expect(queryByText(LAST.code)).toBeNull();
        fireEvent.changeText(getByPlaceholderText(i18n.t('currencyPicker.searchPlaceholder')), LAST.code);
        await waitFor(() => expect(queryByText(LAST.code)).toBeTruthy());

        fireEvent.press(getByTestId(`currency_picker_item_${LAST.code}`));
        expect(onSelect).toHaveBeenCalledWith(LAST);
    });
});
