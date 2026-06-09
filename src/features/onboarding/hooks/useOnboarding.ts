/**
 * useOnboarding Hook
 *
 * Manages the multi-step onboarding flow state.
 * Orchestrates currency selection, wallet creation, and
 * marks onboarding as complete in settings.
 *
 * Steps:
 *   0 - Welcome
 *   1 - Currency Selection
 *   2 - Wallet Creation
 *   3 - All Set (completion)
 */

import { useCallback, useState } from 'react';
import { container } from '../../../core/di/container';
import { dataEvents } from '../../../core/events/dataEvents';
import { selectAndLockCurrency, updateSetting } from '../../../data/services/settingsService';
import type { CurrencyDefinition } from '../../../domain/constants/currencies';

export type OnboardingStep = 0 | 1 | 2 | 3;

export interface UseOnboardingResult {
    step: OnboardingStep;
    /** Move to the next step */
    next: () => void;
    /** Move to the previous step */
    back: () => void;
    /** Select a currency and lock it */
    selectCurrency: (currency: CurrencyDefinition) => Promise<void>;
    /** Create a wallet and advance to completion */
    createWallet: (name: string, type: string, balanceCents: number) => Promise<void>;
    /** Mark onboarding complete */
    complete: () => Promise<void>;
    /** Loading state */
    loading: boolean;
    /** Error message */
    error: string | null;
    /** The selected currency code */
    selectedCurrency: string | null;
}

export function useOnboarding(): UseOnboardingResult {
    const [step, setStep] = useState<OnboardingStep>(0);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [selectedCurrency, setSelectedCurrency] = useState<string | null>(null);

    const next = useCallback(() => {
        setStep(prev => Math.min(prev + 1, 3) as OnboardingStep);
        setError(null);
    }, []);

    const back = useCallback(() => {
        setStep(prev => Math.max(prev - 1, 0) as OnboardingStep);
        setError(null);
    }, []);

    const selectCurrency = useCallback(async (currency: CurrencyDefinition) => {
        setLoading(true);
        setError(null);
        try {
            await selectAndLockCurrency(currency.code);
            setSelectedCurrency(currency.code);
            dataEvents.emit('settings');
            next();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to select currency');
        } finally {
            setLoading(false);
        }
    }, [next]);

    const createWallet = useCallback(async (name: string, type: string, balanceCents: number) => {
        setLoading(true);
        setError(null);
        try {
            await container.walletRepository.create({
                name,
                type: type as any,
                balance: balanceCents,
            });
            dataEvents.emit('wallets');
            next();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to create wallet');
        } finally {
            setLoading(false);
        }
    }, [next]);

    const complete = useCallback(async () => {
        setLoading(true);
        try {
            await updateSetting('onboardingCompleted', true);
            dataEvents.emit('settings');
        } catch (err) {
            console.error('Failed to mark onboarding complete:', err);
        } finally {
            setLoading(false);
        }
    }, []);

    return {
        step,
        next,
        back,
        selectCurrency,
        createWallet,
        complete,
        loading,
        error,
        selectedCurrency,
    };
}
