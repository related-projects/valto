/**
 * MonthNavigator - the chevrons have stable testIDs (pass 94, item 2)
 *
 * Both chevrons are icon-only, so a Maestro flow had nothing to find them by.
 * Each test presses the id and checks that it moves the month the right way.
 */

import { fireEvent, render } from '@testing-library/react-native';
import React from 'react';

import { MonthNavigator } from '../MonthNavigator';

describe('pass 94 item 2. MonthNavigator testIDs', () => {
    it.each([
        ['month_navigator_previous', 'onPrevious'],
        ['month_navigator_next', 'onNext'],
    ] as const)('pass 94 item 2. %s calls %s', (id, handler) => {
        const handlers = { onPrevious: jest.fn(), onNext: jest.fn() };
        const { getByTestId } = render(<MonthNavigator monthLabel="Month" {...handlers} />);

        fireEvent.press(getByTestId(id));

        expect(handlers[handler]).toHaveBeenCalledTimes(1);
        const other = handler === 'onPrevious' ? 'onNext' : 'onPrevious';
        expect(handlers[other]).not.toHaveBeenCalled();
    });
});
