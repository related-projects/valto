/**
 * useOnboarding Hook Tests
 *
 * Covers the step machine's interaction with the currency lock.
 *
 * Regression under test: the onboarding currency step used to lock the base
 * currency on selection, so stepping BACK from the wallet step and choosing
 * again threw 'Currency cannot be changed once selected.' - the throw was set
 * into `error`, which the currency step never rendered, leaving the user stuck
 * behind the `needsOnboarding` gate with no way forward and no message.
 */

jest.mock('@react-native-async-storage/async-storage', () =>
    require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

jest.mock('../../../core/events/dataEvents', () => ({
    dataEvents: {
        subscribe: jest.fn(() => jest.fn()),
        emit: jest.fn(),
        emitMultiple: jest.fn(),
    },
}));

const mockCreateWallet = jest.fn().mockResolvedValue({ id: 'w1' });

jest.mock('../../../core/di/container', () => ({
    container: {
        get walletRepository() {
            return { create: mockCreateWallet };
        },
    },
}));

import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, renderHook, waitFor } from '@testing-library/react-native';

import { loadSettings, saveSettings, type AppSettings } from '../../../data/services/settingsService';
import { getCurrencyByCode } from '../../../domain/constants/currencies';
import { useOnboarding } from '../hooks/useOnboarding';

const EUR = getCurrencyByCode('EUR')!;
const USD = getCurrencyByCode('USD')!;

/** Write a settings snapshot straight to storage, bypassing every lock guard. */
async function seedSettings(overrides: Partial<AppSettings>): Promise<void> {
    const current = await loadSettings();
    await saveSettings({ ...current, ...overrides });
}

beforeEach(async () => {
    await AsyncStorage.clear();
    jest.clearAllMocks();
});

describe('useOnboarding - back navigation out of the currency step', () => {
    it('lets the user re-select a currency after stepping back from the wallet step', async () => {
        const { result } = renderHook(() => useOnboarding());

        // Welcome -> currency step
        act(() => result.current.next());
        expect(result.current.step).toBe(1);

        // First pass: pick EUR, which advances to the wallet step.
        await act(async () => {
            await result.current.selectCurrency(EUR);
        });
        await waitFor(() => expect(result.current.step).toBe(2));

        // The user changes their mind and goes back.
        act(() => result.current.back());
        expect(result.current.step).toBe(1);

        // Second pass: a DIFFERENT currency must take effect and move forward.
        await act(async () => {
            await result.current.selectCurrency(USD);
        });

        await waitFor(() => expect(result.current.step).toBe(2));
        expect(result.current.error).toBeNull();
        expect((await loadSettings()).currency).toBe('USD');
    });

    it('lets the user re-select the SAME currency after stepping back', async () => {
        const { result } = renderHook(() => useOnboarding());

        act(() => result.current.next());
        await act(async () => {
            await result.current.selectCurrency(EUR);
        });
        await waitFor(() => expect(result.current.step).toBe(2));

        act(() => result.current.back());
        await act(async () => {
            await result.current.selectCurrency(EUR);
        });

        await waitFor(() => expect(result.current.step).toBe(2));
        expect(result.current.error).toBeNull();
    });
});

describe('useOnboarding - when the currency locks', () => {
    it('does not lock the currency while onboarding is still in progress', async () => {
        const { result } = renderHook(() => useOnboarding());

        act(() => result.current.next());
        await act(async () => {
            await result.current.selectCurrency(EUR);
        });
        await waitFor(() => expect(result.current.step).toBe(2));

        const settings = await loadSettings();
        expect(settings.currency).toBe('EUR');
        expect(settings.currencyLocked).toBe(false);
        expect(settings.onboardingCompleted).toBe(false);
    });

    it('locks the currency when onboarding completes', async () => {
        const { result } = renderHook(() => useOnboarding());

        act(() => result.current.next());
        await act(async () => {
            await result.current.selectCurrency(EUR);
        });
        await waitFor(() => expect(result.current.step).toBe(2));

        await act(async () => {
            await result.current.createWallet('Main', 'cash', 0);
        });
        await waitFor(() => expect(result.current.step).toBe(3));

        await act(async () => {
            await result.current.complete();
        });

        const settings = await loadSettings();
        expect(settings.currency).toBe('EUR');
        expect(settings.currencyLocked).toBe(true);
        expect(settings.onboardingCompleted).toBe(true);
    });

    it('recovers an install left locked mid-flow by the previous behaviour', async () => {
        // Exactly the state a killed-mid-onboarding (or pre-fix) app is left in:
        // the currency is locked on disk but onboarding never completed.
        await seedSettings({
            currency: 'EUR',
            currencyLocked: true,
            onboardingCompleted: false,
        });

        const { result } = renderHook(() => useOnboarding());

        act(() => result.current.next());
        await act(async () => {
            await result.current.selectCurrency(USD);
        });

        await waitFor(() => expect(result.current.step).toBe(2));
        expect(result.current.error).toBeNull();

        const settings = await loadSettings();
        expect(settings.currency).toBe('USD');
        expect(settings.currencyLocked).toBe(false);
    });
});

describe('useOnboarding - error surfacing', () => {
    it('surfaces a currency-selection failure instead of failing silently', async () => {
        // Onboarding is already finished: the lock is now real, so the service
        // rejects. The hook must expose that, not stay silently on the step.
        await seedSettings({ onboardingCompleted: true, currencyLocked: true });

        const { result } = renderHook(() => useOnboarding());

        act(() => result.current.next());
        await act(async () => {
            await result.current.selectCurrency(USD);
        });

        await waitFor(() => expect(result.current.error).toBeTruthy());
        expect(result.current.error).toContain('Currency cannot be changed');
        expect(result.current.step).toBe(1);
    });

    it('surfaces a completion failure and reports that it did not complete', async () => {
        // A failed write must never be reported as a finished onboarding: the
        // gate would close while `onboardingCompleted` is still false on disk.
        const spy = jest
            .spyOn(AsyncStorage, 'setItem')
            .mockRejectedValue(new Error('disk full'));

        const { result } = renderHook(() => useOnboarding());

        let completed: boolean | undefined;
        await act(async () => {
            completed = await result.current.complete();
        });

        expect(completed).toBe(false);
        await waitFor(() => expect(result.current.error).toBeTruthy());
        expect(result.current.error).toContain('Failed to write to storage');

        spy.mockRestore();
    });
});
