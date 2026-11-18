/**
 * DropdownPicker - one tap on an option with the keyboard up (pass 95)
 *
 * The trigger closes the keyboard when it opens the list (F-25), but the list
 * stays open when the user then focuses another field of the sheet, and the
 * keyboard comes back over it. The options sit in a nested ScrollView that
 * left keyboardShouldPersistTaps unset ("never"). A nested ScrollView is
 * offered the touch after its parents and before the option, so it takes the
 * first tap to close the keyboard even when the sheet's own ScrollView says
 * "handled".
 *
 * Jest has no soft keyboard, so this pins the prop on the scroll view above an
 * option (see test-utils/scrollAncestors). The sheets that host the picker
 * (AddTransactionModal, RecurringRuleForm) already set "handled" on theirs.
 */

import { fireEvent, render } from '@testing-library/react-native';
import React from 'react';

import { scrollAncestorTapModes } from '../../../test-utils/scrollAncestors';
import { DropdownPicker } from '../DropdownPicker';

const ITEMS = [
    { id: 'a', label: 'Option A', testID: 'dropdown_option_a' },
    { id: 'b', label: 'Option B', testID: 'dropdown_option_b' },
];

describe('pass 95. DropdownPicker options with the keyboard up', () => {
    it('pass 95. the scroll view above an option keeps the tap for the option', () => {
        const { getByTestId, queryByTestId } = render(
            <DropdownPicker
                label="Label"
                items={ITEMS}
                selectedId="a"
                onSelect={jest.fn()}
                placeholder="Pick one"
                emptyText="Nothing"
                testID="dropdown_trigger"
            />,
        );
        // The forcing: the list is closed until the trigger is pressed.
        expect(queryByTestId('dropdown_option_b')).toBeNull();
        fireEvent.press(getByTestId('dropdown_trigger'));

        expect(scrollAncestorTapModes(getByTestId('dropdown_option_b'))).toEqual(['handled']);
    });
});
