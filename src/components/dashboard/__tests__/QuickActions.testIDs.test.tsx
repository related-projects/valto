/**
 * QuickActions - each action button has a stable testID (pass 94, item 2)
 *
 * The three dashboard shortcuts had neither a testID nor a label of their own,
 * so a Maestro flow could only find them by their translated text. Each now
 * carries an id. Each test presses the id and checks that the matching handler,
 * and only that one, ran - so an id on the wrong button fails too.
 */

import { fireEvent, render, within } from '@testing-library/react-native';
import React from 'react';

import i18n from '../../../localization/i18n';
import { QuickActions } from '../QuickActions';

type Handler = 'onAddIncome' | 'onAddExpense' | 'onTransfer';

const CASES: [string, string, Handler][] = [
    ['quick_action_income', 'components.quickActions.income', 'onAddIncome'],
    ['quick_action_expense', 'components.quickActions.expense', 'onAddExpense'],
    ['quick_action_transfer', 'components.quickActions.transfer', 'onTransfer'],
];

beforeAll(async () => {
    await i18n.changeLanguage('en');
});

describe('pass 94 item 2. QuickActions testIDs', () => {
    it.each(CASES)('pass 94 item 2. %s is the button showing %s', (id, labelKey, handler) => {
        const handlers: Record<Handler, jest.Mock> = {
            onAddIncome: jest.fn(),
            onAddExpense: jest.fn(),
            onTransfer: jest.fn(),
        };
        const { getByTestId } = render(<QuickActions {...handlers} />);

        const button = getByTestId(id);
        expect(within(button).getByText(i18n.t(labelKey))).toBeTruthy();

        fireEvent.press(button);
        expect(handlers[handler]).toHaveBeenCalledTimes(1);
        for (const other of Object.keys(handlers) as Handler[]) {
            if (other !== handler) expect(handlers[other]).not.toHaveBeenCalled();
        }
    });
});
