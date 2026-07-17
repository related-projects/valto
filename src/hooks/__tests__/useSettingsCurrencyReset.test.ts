/**
 * useSettings — currency reset gating (DoD 3)
 *
 * The financial wipe must run ONLY after the user presses the destructive
 * confirmation, never merely on arming the reset or selecting a currency.
 */

import { act, renderHook, waitFor } from '@testing-library/react-native';
import { Alert } from 'react-native';
import type { AppSettings } from '../../domain/entities/Settings';

const LOCKED_USD: AppSettings = {
    theme: 'system',
    currency: 'USD',
    currencyLocked: true,
    notificationsEnabled: false,
    language: 'en',
    dateFormat: 'MM/DD/YYYY',
    firstDayOfWeek: 'monday',
    decimalSeparator: 'dot',
    onboardingCompleted: true,
};

jest.mock('../../data/services/resetService', () => ({
    resetAppData: jest.fn(),
    resetFinancialDataForCurrencyReset: jest
        .fn()
        .mockResolvedValue({ ...LOCKED_USD, currency: 'XOF' }),
}));

jest.mock('../../data/services/settingsService', () => ({
    loadSettings: jest.fn().mockResolvedValue({ ...LOCKED_USD }),
    selectAndLockCurrency: jest.fn(),
    updateSetting: jest.fn(),
}));

jest.mock('../../data/services/backupService', () => ({
    createAndShareBackup: jest.fn(),
    pickAndRestoreBackup: jest.fn(),
}));
jest.mock('../../data/services/notificationService', () => ({ setNotificationsEnabled: jest.fn() }));
jest.mock('../../theme/theme', () => ({ useTheme: () => ({ setThemePreference: jest.fn() }) }));
jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
jest.mock('i18next', () => ({ __esModule: true, default: { changeLanguage: jest.fn() } }));

import { resetFinancialDataForCurrencyReset } from '../../data/services/resetService';
import { useSettings } from '../useSettings';

type AlertButton = { text?: string; style?: string; onPress?: () => void | Promise<void> };

function lastDestructiveButton(spy: jest.SpyInstance): AlertButton {
    const calls = spy.mock.calls;
    const buttons = calls[calls.length - 1][2] as AlertButton[];
    return buttons.find(b => b.style === 'destructive')!;
}

describe('useSettings currency reset gating', () => {
    beforeEach(() => jest.clearAllMocks());

    it('wipes only after the destructive confirmation is pressed', async () => {
        const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
        const { result } = renderHook(() => useSettings());
        await waitFor(() => expect(result.current.isCurrencyLocked).toBe(true));

        // Arm the reset (outer confirm) and press Continue.
        act(() => result.current.resetCurrency());
        act(() => lastDestructiveButton(alertSpy).onPress?.());
        await waitFor(() => expect(result.current.isResettingCurrency).toBe(true));

        // Pick a new currency → inner confirm shown, but NO wipe yet.
        await act(async () => {
            await result.current.handleCurrencySelect({ code: 'XOF', symbol: 'CFA', name: 'West African CFA Franc', decimals: 0 });
        });
        expect(resetFinancialDataForCurrencyReset).not.toHaveBeenCalled();

        // Press the inner destructive button → wipe runs exactly once, with the picked code.
        await act(async () => {
            await lastDestructiveButton(alertSpy).onPress?.();
        });
        expect(resetFinancialDataForCurrencyReset).toHaveBeenCalledTimes(1);
        expect(resetFinancialDataForCurrencyReset).toHaveBeenCalledWith('XOF');

        alertSpy.mockRestore();
    });

    it('does not wipe if the currency picker is dismissed after arming', async () => {
        const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
        const { result } = renderHook(() => useSettings());
        await waitFor(() => expect(result.current.isCurrencyLocked).toBe(true));

        act(() => result.current.resetCurrency());
        act(() => lastDestructiveButton(alertSpy).onPress?.());
        await waitFor(() => expect(result.current.isResettingCurrency).toBe(true));

        // User dismisses the picker without choosing.
        act(() => result.current.cancelCurrencyReset());

        await waitFor(() => expect(result.current.isResettingCurrency).toBe(false));
        expect(result.current.isCurrencyLocked).toBe(true);
        expect(resetFinancialDataForCurrencyReset).not.toHaveBeenCalled();

        alertSpy.mockRestore();
    });
});
