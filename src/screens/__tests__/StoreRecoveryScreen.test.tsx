/**
 * StoreRecoveryScreen Tests
 *
 * "Try again" calls onRetry directly; "Reset data" requires an explicit
 * confirmation before onReset fires (no auto-wipe).
 */

import { fireEvent, render } from '@testing-library/react-native';
import React from 'react';
import { Alert } from 'react-native';

import { StoreRecoveryScreen } from '../StoreRecoveryScreen';

jest.mock('react-i18next', () => ({
    useTranslation: () => ({ t: (key: string) => key }),
}));

jest.mock('react-native-safe-area-context', () => ({
    useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.mock('../../theme/theme', () => ({
    useTheme: () => ({
        colors: {
            background: '#fff',
            foreground: '#000',
            mutedForeground: '#666',
            destructive: '#E14141',
            destructiveForeground: '#fff',
            border: '#ddd',
            muted: '#eee',
            primary: '#0a0',
            primaryForeground: '#fff',
        },
        spacing: { xs: 4, sm: 8, md: 16, lg: 20, xl: 24, '2xl': 32 },
        radius: { sm: 8, md: 12, lg: 16 },
        typography: {
            sizes: { sm: 14, md: 16, lg: 18, '2xl': 24 },
            weights: { regular: '400', semibold: '600', bold: '700' },
        },
    }),
}));

beforeEach(() => {
    jest.clearAllMocks();
});

describe('StoreRecoveryScreen', () => {
    it('calls onRetry when "Try again" is pressed', () => {
        const onRetry = jest.fn();
        const { getByTestId } = render(
            <StoreRecoveryScreen onRetry={onRetry} onReset={jest.fn()} />,
        );

        fireEvent.press(getByTestId('store-recovery-retry'));
        expect(onRetry).toHaveBeenCalledTimes(1);
    });

    it('requires confirmation before "Reset data" calls onReset', () => {
        const onReset = jest.fn();
        let confirm: (() => void) | undefined;
        jest.spyOn(Alert, 'alert').mockImplementation((_t, _m, buttons) => {
            confirm = buttons?.find((b) => b.style === 'destructive')?.onPress;
        });

        const { getByTestId } = render(
            <StoreRecoveryScreen onRetry={jest.fn()} onReset={onReset} />,
        );

        fireEvent.press(getByTestId('store-recovery-reset'));
        // Confirmation shown but onReset NOT yet called (no auto-wipe).
        expect(Alert.alert).toHaveBeenCalledTimes(1);
        expect(onReset).not.toHaveBeenCalled();

        // User confirms the destructive action.
        confirm?.();
        expect(onReset).toHaveBeenCalledTimes(1);
    });
});
