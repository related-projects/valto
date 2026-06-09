/**
 * ErrorBoundary Tests
 */

import { render } from '@testing-library/react-native';
import React from 'react';
import { Text } from 'react-native';
import { ErrorBoundary } from '../../../src/core/error/ErrorBoundary';

// Component that throws during render
const ThrowingComponent: React.FC<{ shouldThrow?: boolean }> = ({ shouldThrow }) => {
    if (shouldThrow) {
        throw new Error('Test render error');
    }
    return <Text>Child Content</Text>;
};

describe('ErrorBoundary', () => {
    // Silence console.error during these tests since we expect errors
    const originalError = console.error;
    beforeAll(() => {
        console.error = jest.fn();
    });
    afterAll(() => {
        console.error = originalError;
    });

    it('renders children when no error', () => {
        const { getByText } = render(
            <ErrorBoundary>
                <ThrowingComponent shouldThrow={false} />
            </ErrorBoundary>
        );

        expect(getByText('Child Content')).toBeTruthy();
    });

    it('renders fallback when child throws', () => {
        const { getByText } = render(
            <ErrorBoundary>
                <ThrowingComponent shouldThrow={true} />
            </ErrorBoundary>
        );

        expect(getByText('Something went wrong')).toBeTruthy();
        expect(getByText('Reload App')).toBeTruthy();
    });

    it('logs error to console', () => {
        render(
            <ErrorBoundary>
                <ThrowingComponent shouldThrow={true} />
            </ErrorBoundary>
        );

        expect(console.error).toHaveBeenCalledWith(
            '[ErrorBoundary] Uncaught render error:',
            expect.any(Error)
        );
    });
});
