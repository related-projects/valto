/**
 * CurrencyPickerModal - one tap on a currency row with the keyboard up (pass 95)
 *
 * Same layout as the onboarding currency step: a search field above a
 * FlatList of rows, and the FlatList left keyboardShouldPersistTaps unset
 * ("never"), so the first tap after typing a search only closes the keyboard.
 *
 * Jest has no soft keyboard, so this pins the prop every scroll view above the
 * row must carry (see test-utils/scrollAncestors).
 *
 * Harness as in CurrencyPickerModal.testIDs.test.tsx.
 */

import { fireEvent, render, waitFor } from '@testing-library/react-native';
import React from 'react';

import { SUPPORTED_CURRENCIES } from '../../../domain/constants/currencies';
import i18n from '../../../localization/i18n';
import { scrollAncestorTapModes } from '../../../test-utils/scrollAncestors';
import { CurrencyPickerModal } from '../CurrencyPickerModal';

jest.mock('react-native-safe-area-context', () => ({
    useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

const LAST = SUPPORTED_CURRENCIES[SUPPORTED_CURRENCIES.length - 1];

beforeAll(async () => {
    await i18n.changeLanguage('en');
});

describe('pass 95. CurrencyPickerModal rows with the keyboard up', () => {
    it('pass 95. the scroll view above a searched currency row keeps the tap for the row', async () => {
        const { getByPlaceholderText, getByTestId, queryByTestId } = render(
            <CurrencyPickerModal visible onClose={jest.fn()} onSelect={jest.fn()} selectedCode="EUR" locked={false} />,
        );
        fireEvent.changeText(getByPlaceholderText(i18n.t('currencyPicker.searchPlaceholder')), LAST.code);
        await waitFor(() => expect(queryByTestId(`currency_picker_item_${LAST.code}`)).toBeTruthy());

        expect(scrollAncestorTapModes(getByTestId(`currency_picker_item_${LAST.code}`))).toEqual(['handled']);
    });
});
