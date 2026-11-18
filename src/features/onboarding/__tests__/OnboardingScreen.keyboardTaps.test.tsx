/**
 * OnboardingScreen - one tap on a currency row with the keyboard up (pass 95)
 *
 * First Maestro run, 18/11: after typing "USD" in the currency search, one tap
 * on the USD row only closed the keyboard and the step did not advance. The
 * rows sit in a FlatList under the search field, and that FlatList left
 * keyboardShouldPersistTaps unset, which React Native reads as "never": the
 * list takes the first tap to close the keyboard.
 *
 * Jest has no soft keyboard and no native responder, so this pins the prop
 * every scroll view above the row must carry (see test-utils/scrollAncestors).
 * The on-device proof is the next Maestro run.
 *
 * Harness as in OnboardingScreen.test.tsx. jest.mock calls are hoisted above
 * the imports, and no factory reads a module-level value.
 */

import { fireEvent, render } from '@testing-library/react-native';
import React from 'react';

import { scrollAncestorTapModes } from '../../../test-utils/scrollAncestors';
import { OnboardingScreen } from '../screens/OnboardingScreen';

jest.mock('../../../data/services/settingsService', () => ({
    setOnboardingCurrency: jest.fn().mockResolvedValue(undefined),
    selectAndLockCurrency: jest.fn().mockResolvedValue(undefined),
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
    getUseCaseDeps: () => ({ runInTransaction: (work: () => Promise<unknown>) => work() }),
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
        amountPlaceholder: '0.00',
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

describe('pass 95. OnboardingScreen currency rows with the keyboard up', () => {
    it('pass 95. the scroll view above a filtered currency row keeps the tap for the row', () => {
        const { getByTestId } = render(<OnboardingScreen onComplete={jest.fn()} />);
        fireEvent.press(getByTestId('onboarding_get_started'));
        fireEvent.changeText(getByTestId('currency_search_input'), 'USD');

        expect(scrollAncestorTapModes(getByTestId('currency_item_USD'))).toEqual(['handled']);
    });
});
