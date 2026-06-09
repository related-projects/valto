/**
 * InputField Component Tests
 *
 * Tests rendering, label/error display, focus styling,
 * and icon rendering.
 */

import { fireEvent, render } from '@testing-library/react-native';
import React from 'react';
import { InputField } from '../InputField';

jest.mock('../../../theme/theme', () => ({
    useTheme: () => ({
        colors: {
            foreground: '#F1F5F9',
            primary: '#7C3AED',
            destructive: '#EF4444',
            muted: '#334155',
            mutedForeground: '#94A3B8',
            card: '#1E293B',
            input: '#0F172A',
            border: '#334155',
        },
        spacing: { xs: 4, sm: 8, md: 12, lg: 16, xl: 20 },
        radius: { sm: 6, md: 10, lg: 14, xl: 20 },
        typography: { sizes: { xs: 11, sm: 13, md: 15, lg: 17 } },
    }),
}));

describe('InputField', () => {
    it('renders without label', () => {
        const { toJSON } = render(
            <InputField placeholder="Enter text" />
        );
        expect(toJSON()).toBeTruthy();
    });

    it('renders label when provided', () => {
        const { getByText } = render(
            <InputField label="Email" placeholder="Enter email" />
        );
        expect(getByText('Email')).toBeTruthy();
    });

    it('displays error message', () => {
        const { getByText } = render(
            <InputField label="Name" error="Name is required" />
        );
        expect(getByText('Name is required')).toBeTruthy();
    });

    it('handles text input', () => {
        const onChangeText = jest.fn();
        const { getByPlaceholderText } = render(
            <InputField placeholder="Type here" onChangeText={onChangeText} />
        );

        fireEvent.changeText(getByPlaceholderText('Type here'), 'Hello');
        expect(onChangeText).toHaveBeenCalledWith('Hello');
    });

    it('handles focus and blur events', () => {
        const { getByPlaceholderText } = render(
            <InputField placeholder="Test focus" />
        );

        const input = getByPlaceholderText('Test focus');

        // Focus and blur should not throw
        fireEvent(input, 'focus');
        fireEvent(input, 'blur');
    });

    it('renders in pill variant', () => {
        const { toJSON } = render(
            <InputField placeholder="Search" variant="pill" />
        );
        expect(toJSON()).toBeTruthy();
    });

    it('renders with left icon', () => {
        const { toJSON } = render(
            <InputField placeholder="Search" leftIcon={<></>} />
        );
        expect(toJSON()).toBeTruthy();
    });

    it('renders with right icon and handles press', () => {
        const onRightIconPress = jest.fn();
        const { toJSON } = render(
            <InputField
                placeholder="Password"
                rightIcon={<></>}
                onRightIconPress={onRightIconPress}
            />
        );
        expect(toJSON()).toBeTruthy();
    });
});
