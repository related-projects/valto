/**
 * SegmentControl Component Tests
 *
 * Covers F-03: the selected segment must be distinguishable, and must say so
 * to assistive technology rather than relying on a visual cue alone.
 *
 * Assertions target accessibilityState rather than style objects so they
 * survive a future restyle.
 */

import { fireEvent, render } from '@testing-library/react-native';
import React from 'react';
import { SegmentControl, type Segment } from '../SegmentControl';

jest.mock('../../../theme/theme', () => ({
    useTheme: () => ({
        colors: {
            background: '#f7f8f7',
            foreground: '#2F241F',
            accent: '#603b2e',
            accentForeground: '#FAFAFA',
            border: '#D5DBD8',
        },
        spacing: { xs: 4, sm: 8, md: 16, lg: 20, xl: 24 },
        radius: { sm: 8, md: 12, lg: 16 },
        typography: {
            sizes: { xs: 11, sm: 14, md: 16 },
            weights: { regular: '400', medium: '500', semibold: '600', bold: '700' },
        },
    }),
}));

const SEGMENTS: Segment<string>[] = [
    { key: 'expense', label: 'Expense', value: 'expense', testID: 'add_tx_type_expense' },
    { key: 'income', label: 'Income', value: 'income', testID: 'add_tx_type_income' },
    { key: 'transfer', label: 'Transfer', value: 'transfer', testID: 'add_tx_type_transfer' },
];

describe('SegmentControl', () => {
    it('renders every segment label', () => {
        const { getByText } = render(
            <SegmentControl segments={SEGMENTS} selectedValue="expense" onSelect={() => { }} />
        );

        expect(getByText('Expense')).toBeTruthy();
        expect(getByText('Income')).toBeTruthy();
        expect(getByText('Transfer')).toBeTruthy();
    });

    it('marks only the selected segment as selected', () => {
        const { getByTestId } = render(
            <SegmentControl segments={SEGMENTS} selectedValue="income" onSelect={() => { }} />
        );

        expect(getByTestId('add_tx_type_income').props.accessibilityState).toEqual({ selected: true });
        expect(getByTestId('add_tx_type_expense').props.accessibilityState).toEqual({ selected: false });
        expect(getByTestId('add_tx_type_transfer').props.accessibilityState).toEqual({ selected: false });
    });

    it('moves the selected state when selectedValue changes', () => {
        const { getByTestId, rerender } = render(
            <SegmentControl segments={SEGMENTS} selectedValue="expense" onSelect={() => { }} />
        );

        expect(getByTestId('add_tx_type_expense').props.accessibilityState).toEqual({ selected: true });

        rerender(
            <SegmentControl segments={SEGMENTS} selectedValue="transfer" onSelect={() => { }} />
        );

        expect(getByTestId('add_tx_type_expense').props.accessibilityState).toEqual({ selected: false });
        expect(getByTestId('add_tx_type_transfer').props.accessibilityState).toEqual({ selected: true });
    });

    it('gives every segment a button role and its label', () => {
        const { getByTestId } = render(
            <SegmentControl segments={SEGMENTS} selectedValue="expense" onSelect={() => { }} />
        );

        const expense = getByTestId('add_tx_type_expense');
        expect(expense.props.accessibilityRole).toBe('button');
        expect(expense.props.accessibilityLabel).toBe('Expense');
    });

    it('fires onSelect with the pressed segment value', () => {
        const onSelect = jest.fn();
        const { getByTestId } = render(
            <SegmentControl segments={SEGMENTS} selectedValue="expense" onSelect={onSelect} />
        );

        fireEvent.press(getByTestId('add_tx_type_transfer'));
        expect(onSelect).toHaveBeenCalledTimes(1);
        expect(onSelect).toHaveBeenCalledWith('transfer');
    });

    it('distinguishes the selected segment by background and text colour', () => {
        const { getByTestId, getByText } = render(
            <SegmentControl segments={SEGMENTS} selectedValue="expense" onSelect={() => { }} />
        );

        const selected = StyleSheetFlatten(getByTestId('add_tx_type_expense').props.style);
        const unselected = StyleSheetFlatten(getByTestId('add_tx_type_income').props.style);

        expect(selected.backgroundColor).toBe('#603b2e');
        expect(unselected.backgroundColor).toBe('transparent');
        expect(selected.backgroundColor).not.toBe(unselected.backgroundColor);

        expect(getByText('Expense').props.style.color).toBe('#FAFAFA');
        expect(getByText('Income').props.style.color).toBe('#2F241F');
    });
});

/** Collapses RN's nested style arrays into a single object. */
function StyleSheetFlatten(style: unknown): Record<string, unknown> {
    if (Array.isArray(style)) {
        return style.reduce<Record<string, unknown>>(
            (acc, s) => ({ ...acc, ...StyleSheetFlatten(s) }),
            {},
        );
    }
    return (style ?? {}) as Record<string, unknown>;
}
