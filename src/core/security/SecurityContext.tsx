/**
 * Security Context
 *
 * Provides session-level lock/unlock state and authentication methods.
 * Auto-locks when the app goes to background (via AppState listener).
 * Must be wrapped around the app root to enable security features.
 */

import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import { authenticateWithBiometrics, checkBiometricCapability } from '../../data/services/biometricService';
import {
    clearSecurityConfig,
    loadSecurityConfig,
    pinLockoutService,
    setupSecurity,
} from '../../data/services/securityService';
import type { VerifyResult } from '../../domain/security/lockout';
import type { BiometricCapability, SecurityConfig } from '../../domain/security/types';

// ─── Context Value ────────────────────────────────────────────────────

interface SecurityContextValue {
    /** Whether the session is currently unlocked */
    isUnlocked: boolean;
    /** Whether security (PIN) is configured */
    isSecurityEnabled: boolean;
    /** Current security config (null if not configured) */
    securityConfig: SecurityConfig | null;
    /** Device biometric capability */
    biometrics: BiometricCapability;
    /** Attempt to unlock with PIN. Returns the lock-out-aware verify result. */
    unlockWithPin: (pin: string) => Promise<VerifyResult>;
    /** Attempt to unlock with biometrics */
    unlockWithBiometrics: () => Promise<boolean>;
    /** Lock the session (called on background) */
    lock: () => void;
    /** Set up security for the first time */
    enableSecurity: (pin: string, useBiometrics: boolean) => Promise<void>;
    /** Disable security and clear all security data */
    disableSecurity: () => Promise<void>;
    /** Reload config from storage (after restore, etc.) */
    reloadConfig: () => Promise<void>;
    /** Number of consecutive failed PIN attempts */
    failedAttempts: number;
    /** Epoch ms the PIN pad is locked until (brute-force throttle), or null. */
    lockedUntil: number | null;
    /** Whether loading is in progress */
    loading: boolean;
}

const SecurityCtx = createContext<SecurityContextValue | null>(null);

// ─── Provider ─────────────────────────────────────────────────────────

export const SecurityProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [isUnlocked, setIsUnlocked] = useState(true); // Start unlocked until config loads
    const [config, setConfig] = useState<SecurityConfig | null>(null);
    const [biometrics, setBiometrics] = useState<BiometricCapability>({
        available: false,
        enrolled: false,
        biometricTypes: [],
    });
    const [failedAttempts, setFailedAttempts] = useState(0);
    const [lockedUntil, setLockedUntil] = useState<number | null>(null);
    const [loading, setLoading] = useState(true);
    const appStateRef = useRef<AppStateStatus>(AppState.currentState);

    // Load security config and biometric capabilities on mount
    const reloadConfig = useCallback(async () => {
        setLoading(true);
        try {
            const [savedConfig, bioCap, lockoutState] = await Promise.all([
                loadSecurityConfig(),
                checkBiometricCapability(),
                pinLockoutService.getState(),
            ]);
            setConfig(savedConfig);
            setBiometrics(bioCap);
            // Hydrate the durable brute-force state so the UI reflects any
            // lock-out that survived a restart.
            setFailedAttempts(lockoutState.failedAttempts);
            setLockedUntil(lockoutState.lockedUntil);

            // If security is enabled, start locked
            if (savedConfig) {
                setIsUnlocked(false);
            } else {
                setIsUnlocked(true);
            }
        } catch {
            // On error, unlock to prevent user lockout
            setIsUnlocked(true);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        reloadConfig();
    }, [reloadConfig]);

    // Auto-lock on background
    useEffect(() => {
        const subscription = AppState.addEventListener('change', (nextState: AppStateStatus) => {
            const prev = appStateRef.current;
            appStateRef.current = nextState;

            // If going from active to background/inactive AND security is enabled
            if (prev === 'active' && nextState !== 'active' && config) {
                // For autoLockTimeout === 0 (immediate), lock right away.
                // NOTE: do NOT reset the failed-attempt counter here — the
                // brute-force throttle must survive backgrounding/restart.
                if (config.autoLockTimeout === 0) {
                    setIsUnlocked(false);
                }
            }
        });

        return () => subscription.remove();
    }, [config]);

    // ── PIN unlock ────────────────────────────────────────────────────
    const unlockWithPin = useCallback(async (pin: string): Promise<VerifyResult> => {
        if (!config) {
            setIsUnlocked(true);
            return { ok: true }; // No security configured
        }

        // Lock-out-aware verify: while locked it short-circuits without ever
        // comparing the PIN hash (the throttle). Mirror the durable state into
        // React state so the pad can disable + count down.
        const result = await pinLockoutService.verify(pin, config.pinHash);
        const state = await pinLockoutService.getState();
        setFailedAttempts(state.failedAttempts);
        setLockedUntil(state.lockedUntil);

        if (result.ok) {
            setIsUnlocked(true);
        }
        return result;
    }, [config]);

    // ── Biometric unlock ──────────────────────────────────────────────
    const unlockWithBiometrics = useCallback(async (): Promise<boolean> => {
        if (!config?.biometricsEnabled) return false;
        if (!biometrics.available || !biometrics.enrolled) return false;

        const success = await authenticateWithBiometrics();
        if (success) {
            // Biometrics is a stronger, non-brute-forceable factor — a success
            // clears any PIN lock-out.
            await pinLockoutService.reset();
            setIsUnlocked(true);
            setFailedAttempts(0);
            setLockedUntil(null);
        }
        return success;
    }, [config, biometrics]);

    // ── Lock ──────────────────────────────────────────────────────────
    const lock = useCallback(() => {
        if (config) {
            // Lock the session but preserve the brute-force counter.
            setIsUnlocked(false);
        }
    }, [config]);

    // ── Enable security ───────────────────────────────────────────────
    const enableSecurity = useCallback(async (pin: string, useBiometrics: boolean) => {
        const newConfig = await setupSecurity(pin, useBiometrics);
        await pinLockoutService.reset();
        setConfig(newConfig);
        setIsUnlocked(true); // Stay unlocked after setup
        setFailedAttempts(0);
        setLockedUntil(null);
    }, []);

    // ── Disable security ──────────────────────────────────────────────
    const disableSecurity = useCallback(async () => {
        await clearSecurityConfig();
        await pinLockoutService.reset();
        setConfig(null);
        setIsUnlocked(true);
        setFailedAttempts(0);
        setLockedUntil(null);
    }, []);

    const value: SecurityContextValue = {
        isUnlocked,
        isSecurityEnabled: config !== null,
        securityConfig: config,
        biometrics,
        unlockWithPin,
        unlockWithBiometrics,
        lock,
        enableSecurity,
        disableSecurity,
        reloadConfig,
        failedAttempts,
        lockedUntil,
        loading,
    };

    return <SecurityCtx.Provider value={value}>{children}</SecurityCtx.Provider>;
};

// ─── Hook ─────────────────────────────────────────────────────────────

/**
 * Access security context. Must be used within <SecurityProvider>.
 */
export function useSecurity(): SecurityContextValue {
    const ctx = useContext(SecurityCtx);
    if (!ctx) {
        throw new Error('useSecurity must be used within <SecurityProvider>');
    }
    return ctx;
}
