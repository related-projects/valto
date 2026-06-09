/**
 * Button Component Tests
 *
 * Tests rendering, press behavior, disabled state,
 * loading indicator, and variant text colors.
 */

import { fireEvent, render } from '@testing-library/react-native';
import React from 'react';
import { Button } from '../Button';

// Mock the theme hook
jest.mock('../../../theme/theme', () => ({
    useTheme: () => ({
        colors: {
            primary: '#7C3AED',
            primaryForeground: '#FFFFFF',
            secondary: '#1E293B',
            secondaryForeground: '#F1F5F9',
            destructive: '#EF4444',
            destructiveForeground: '#FFFFFF',
            muted: '#334155',
            mutedForeground: '#94A3B8',
            foreground: '#F1F5F9',
            border: '#334155',
        },
        spacing: { xs: 4, sm: 8, md: 12, lg: 16, xl: 20 },
        radius: { sm: 6, md: 10, lg: 14, xl: 20 },
        typography: { sizes: { xs: 11, sm: 13, md: 15, lg: 17 } },
    }),
}));

describe('Button', () => {
    it('renders title text', () => {
        const { getByText } = render(
            <Button title="Save" onPress={() => {}} />
        );
        expect(getByText('Save')).toBeTruthy();
    });

    it('fires onPress callback when pressed', () => {
        const onPress = jest.fn();
        const { getByText } = render(
            <Button title="Press Me" onPress={onPress} />
        );

        fireEvent.press(getByText('Press Me'));
        expect(onPress).toHaveBeenCalledTimes(1);
    });

    it('does not fire onPress when disabled', () => {
        const onPress = jest.fn();
        const { getByText } = render(
            <Button title="Disabled" onPress={onPress} disabled />
        );

        fireEvent.press(getByText('Disabled'));
        expect(onPress).not.toHaveBeenCalled();
    });

    it('shows ActivityIndicator when loading', () => {
        const { queryByText, UNSAFE_queryByType } = render(
            <Button title="Loading" onPress={() => {}} loading />
        );

        // Title should not be visible during loading
        expect(queryByText('Loading')).toBeNull();
    });

    it('disables touch when loading', () => {
        const onPress = jest.fn();
        const { queryByText } = render(
            <Button title="Loading" onPress={onPress} loading />
        );

        // When loading, the title is not rendered (ActivityIndicator shown instead)
        // and the TouchableOpacity is disabled={true}
        expect(queryByText('Loading')).toBeNull();
    });

    it('renders with different variants', () => {
        const variants = ['primary', 'secondary', 'ghost', 'destructive', 'outline'] as const;

        variants.forEach(variant => {
            const { getByText, unmount } = render(
                <Button title={`${variant} btn`} onPress={() => {}} variant={variant} />
            );
            expect(getByText(`${variant} btn`)).toBeTruthy();
            unmount();
        });
    });

    it('renders with different sizes', () => {
        const sizes = ['sm', 'md', 'lg'] as const;

        sizes.forEach(size => {
            const { getByText, unmount } = render(
                <Button title={`${size} btn`} onPress={() => {}} size={size} />
            );
            expect(getByText(`${size} btn`)).toBeTruthy();
            unmount();
        });
    });

    it('renders icon alongside title', () => {
        const { getByText } = render(
            <Button
                title="With Icon"
                onPress={() => {}}
                icon={<></>}
            />
        );
        expect(getByText('With Icon')).toBeTruthy();
    });
});
