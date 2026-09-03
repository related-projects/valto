/**
 * OnboardingScreen Tests
 *
 * Two guarantees the currency step used to break:
 *   - a failed currency selection is SHOWN, never a silent no-op;
 *   - re-entering the step presents a clean, usable list.
 */

const mockSetOnboardingCurrency = jest.fn().mockResolvedValue(undefined);
const mockSelectAndLockCurrency = jest.fn().mockResolvedValue(undefined);

jest.mock('../../../data/services/settingsService', () => ({
    setOnboardingCurrency: (...args: unknown[]) => mockSetOnboardingCurrency(...args),
    selectAndLockCurrency: (...args: unknown[]) => mockSelectAndLockCurrency(...args),
    lockCurrency: jest.fn().mockResolvedValue(undefined),
    updateSetting: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../../../core/events/dataEvents', () => ({
    dataEvents: {
        subscribe: jest.fn(() => jest.fn()),
        emit: jest.fn(),
        emitMultiple: jest.fn(),
    },
}));

jest.mock('../../../core/di/container', () => ({
    container: {
        get walletRepository() {
            return { create: jest.fn().mockResolvedValue({ id: 'w1' }) };
        },
    },
}));

jest.mock('react-i18next', () => ({
    useTranslation: () => ({ t: (key: string) => key }),
}));

jest.mock('react-native-safe-area-context', () => ({
    useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.mock('../../../hooks/useFormatting', () => ({
    useFormatting: () => ({
        parseAmount: (v: string) => (v ? Number(v) : null),
        normalizeAmount: (v: number) => Math.round(v * 100),
        decimals: 2,
    }),
}));

jest.mock('../../../theme/theme', () => ({
    useTheme: () => ({
        colors: {
            background: '#fff',
            foreground: '#000',
            mutedForeground: '#666',
            destructive: '#E14141',
            card: '#f5f5f5',
            muted: '#eee',
            accent: '#eef',
            primary: '#0a0',
            primaryForeground: '#fff',
        },
        spacing: { xs: 4, sm: 8, md: 16, lg: 20, xl: 24, '2xl': 32 },
        radius: { sm: 8, md: 12, lg: 16 },
        typography: {
            sizes: { xs: 12, sm: 14, md: 16, lg: 18, '2xl': 24, '3xl': 30 },
            weights: { regular: '400', semibold: '600', bold: '700' },
        },
        shadows: { card: {} },
    }),
}));

import { fireEvent, render, waitFor } from '@testing-library/react-native';
import React from 'react';

import { OnboardingScreen } from '../screens/OnboardingScreen';

beforeEach(() => {
    jest.clearAllMocks();
    mockSetOnboardingCurrency.mockResolvedValue(undefined);
    mockSelectAndLockCurrency.mockResolvedValue(undefined);
});

/** Walk from the welcome step to the currency step. */
function renderAtCurrencyStep() {
    const utils = render(<OnboardingScreen onComplete={jest.fn()} />);
    fireEvent.press(utils.getByTestId('onboarding_get_started'));
    return utils;
}

describe('OnboardingScreen - currency step error surfacing', () => {
    it('shows the failure when a currency selection is rejected', async () => {
        // Both the old and the new service entry point reject, so this test
        // isolates one thing: whether the step renders the failure at all.
        mockSetOnboardingCurrency.mockRejectedValue(new Error('storage unavailable'));
        mockSelectAndLockCurrency.mockRejectedValue(new Error('storage unavailable'));

        const { getByTestId } = renderAtCurrencyStep();

        // The list is long and virtualized; filter down to the target row first.
        fireEvent.changeText(getByTestId('currency_search_input'), 'EUR');
        fireEvent.press(getByTestId('currency_item_EUR'));

        await waitFor(() => {
            expect(getByTestId('onboarding_currency_error')).toHaveTextContent(
                'storage unavailable',
            );
        });

        // Still on the currency step - no silent advance.
        expect(getByTestId('currency_search_input')).toBeTruthy();
    });
});

describe('OnboardingScreen - re-entering the currency step', () => {
    it('clears a stale search query when the user steps back', async () => {
        const { getByTestId, queryByTestId } = renderAtCurrencyStep();

        const search = getByTestId('currency_search_input');
        fireEvent.changeText(search, 'EUR');
        expect(queryByTestId('currency_item_USD')).toBeNull();

        fireEvent.press(getByTestId('currency_item_EUR'));
        await waitFor(() => expect(getByTestId('onboarding_wallet_name')).toBeTruthy());

        fireEvent.press(getByTestId('onboarding_back_button'));

        await waitFor(() => {
            expect(getByTestId('currency_search_input').props.value).toBe('');
        });

        // A new choice is reachable again: the previous query no longer hides it.
        fireEvent.changeText(getByTestId('currency_search_input'), 'USD');
        expect(getByTestId('currency_item_USD')).toBeTruthy();
    });

    it('advances again after re-selecting a different currency', async () => {
        const { getByTestId } = renderAtCurrencyStep();

        fireEvent.changeText(getByTestId('currency_search_input'), 'EUR');
        fireEvent.press(getByTestId('currency_item_EUR'));
        await waitFor(() => expect(getByTestId('onboarding_wallet_name')).toBeTruthy());

        fireEvent.press(getByTestId('onboarding_back_button'));
        await waitFor(() => expect(getByTestId('currency_search_input')).toBeTruthy());

        fireEvent.changeText(getByTestId('currency_search_input'), 'USD');
        fireEvent.press(getByTestId('currency_item_USD'));

        await waitFor(() => expect(getByTestId('onboarding_wallet_name')).toBeTruthy());
    });
});
