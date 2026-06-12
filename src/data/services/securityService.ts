/**
 * Security Service
 *
 * Handles PIN hashing, verification, and security config persistence.
 * PIN is never stored in plain text — only the SHA-256 hash is persisted.
 * Uses the existing storage abstraction.
 */

import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import { PIN_LENGTH, type SecurityConfig } from '../../domain/security/types';
import {
    applyAttempt,
    INITIAL_LOCKOUT_STATE,
    isLockedOut,
    lockoutRemainingMs,
    type LockoutState,
    type VerifyResult,
} from '../../domain/security/lockout';
import { asyncStorageAdapter, StorageKeys } from '../storage';

// ─── PIN Hashing ──────────────────────────────────────────────────────

/**
 * Hash a PIN using SHA-256.
 * Salted with a fixed app-level salt to prevent rainbow table attacks.
 */
export async function hashPin(pin: string): Promise<string> {
    const salted = `valto:pin:${pin}`;
    return Crypto.digestStringAsync(
        Crypto.CryptoDigestAlgorithm.SHA256,
        salted,
    );
}

/**
 * Verify a PIN against a stored hash.
 * Returns true if the PIN matches.
 */
export async function verifyPin(input: string, storedHash: string): Promise<boolean> {
    const inputHash = await hashPin(input);
    // Constant-time-ish comparison (JS doesn't truly guarantee it,
    // but this is a local-only PIN on the user's own device)
    if (inputHash.length !== storedHash.length) return false;
    let mismatch = 0;
    for (let i = 0; i < inputHash.length; i++) {
        mismatch |= inputHash.charCodeAt(i) ^ storedHash.charCodeAt(i);
    }
    return mismatch === 0;
}

// ─── PIN Validation ───────────────────────────────────────────────────

/**
 * Validate PIN format.
 * Must be exactly PIN_LENGTH digits.
 */
export function isValidPin(pin: string): boolean {
    return pin.length === PIN_LENGTH && /^\d+$/.test(pin);
}

// ─── Security Config Persistence ──────────────────────────────────────

/**
 * Load security configuration from storage.
 * Returns null if security is not configured.
 */
export async function loadSecurityConfig(): Promise<SecurityConfig | null> {
    try {
        return await asyncStorageAdapter.get<SecurityConfig>(StorageKeys.SECURITY_CONFIG);
    } catch {
        return null;
    }
}

/**
 * Save security configuration to storage.
 */
export async function saveSecurityConfig(config: SecurityConfig): Promise<void> {
    await asyncStorageAdapter.set(StorageKeys.SECURITY_CONFIG, config);
}

/**
 * Clear all security data (PIN hash, biometric settings).
 * Called when user disables security.
 */
export async function clearSecurityConfig(): Promise<void> {
    await asyncStorageAdapter.remove(StorageKeys.SECURITY_CONFIG);
}

/**
 * Create a new security config with a PIN.
 * Hashes the PIN before storing.
 */
export async function setupSecurity(
    pin: string,
    biometricsEnabled: boolean = false,
): Promise<SecurityConfig> {
    if (!isValidPin(pin)) {
        throw new Error(`PIN must be exactly ${PIN_LENGTH} digits`);
    }
    const pinHash = await hashPin(pin);
    const config: SecurityConfig = {
        pinHash,
        biometricsEnabled,
        autoLockTimeout: 0, // Immediate lock by default
    };
    await saveSecurityConfig(config);
    return config;
}

// ─── PIN Lock-out (brute-force throttle) ──────────────────────────────
//
// The durable lock-out state lives in the device secure keystore
// (expo-secure-store → iOS Keychain / Android Keystore), NOT AsyncStorage,
// so a kill+restart cannot reset the failed-attempt counter and it resists
// tampering. The exponential-backoff policy itself is the pure domain module
// `domain/security/lockout`.

/** Secure-store key holding the serialized {@link LockoutState}. */
const LOCKOUT_KEY = 'valto.pin.lockout';

/** Port for persisting lock-out state (so tests can inject a fake). */
export interface LockoutPersistence {
    load(): Promise<LockoutState>;
    save(state: LockoutState): Promise<void>;
}

/** Default persistence backed by the device secure keystore. */
export const secureStoreLockoutStore: LockoutPersistence = {
    async load(): Promise<LockoutState> {
        try {
            const raw = await SecureStore.getItemAsync(LOCKOUT_KEY);
            if (!raw) return { ...INITIAL_LOCKOUT_STATE };
            const parsed = JSON.parse(raw) as Partial<LockoutState>;
            return {
                failedAttempts:
                    typeof parsed.failedAttempts === 'number' ? parsed.failedAttempts : 0,
                lockedUntil:
                    typeof parsed.lockedUntil === 'number' ? parsed.lockedUntil : null,
            };
        } catch {
            return { ...INITIAL_LOCKOUT_STATE };
        }
    },
    async save(state: LockoutState): Promise<void> {
        await SecureStore.setItemAsync(LOCKOUT_KEY, JSON.stringify(state), {
            keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK,
        });
    },
};

/** Injectable time source — defaults to wall clock. */
export type Clock = () => number;

/**
 * Lock-out-aware PIN verifier.
 *
 * Reads its state from the injected persistence on every call (no in-memory
 * cache), so a fresh instance over the same store observes the same lock-out —
 * a kill+restart cannot clear it. The clock is injectable for deterministic
 * tests.
 */
export class PinLockoutService {
    constructor(
        private readonly store: LockoutPersistence,
        private readonly clock: Clock = () => Date.now(),
    ) {}

    /** Current durable state. */
    getState(): Promise<LockoutState> {
        return this.store.load();
    }

    async isLockedOut(now: number = this.clock()): Promise<boolean> {
        return isLockedOut(await this.store.load(), now);
    }

    async lockoutRemainingMs(now: number = this.clock()): Promise<number> {
        return lockoutRemainingMs(await this.store.load(), now);
    }

    /** Clear the lock-out (used after a successful biometric unlock / setup). */
    async reset(): Promise<void> {
        await this.store.save({ ...INITIAL_LOCKOUT_STATE });
    }

    /**
     * Verify a PIN under the lock-out policy.
     *
     * While locked the call is rejected as locked WITHOUT comparing the hash —
     * the short-circuit IS the throttle. `compare` is injectable so tests can
     * assert it is never invoked during a lock-out.
     */
    async verify(
        pin: string,
        storedHash: string,
        compare: (pin: string, hash: string) => Promise<boolean> = verifyPin,
        now: number = this.clock(),
    ): Promise<VerifyResult> {
        const current = await this.store.load();

        if (isLockedOut(current, now)) {
            return {
                ok: false,
                locked: true,
                remainingMs: lockoutRemainingMs(current, now),
            };
        }

        const correct = await compare(pin, storedHash);
        const { state, result } = applyAttempt(current, correct, now);
        await this.store.save(state);
        return result;
    }
}

/** App-wide singleton wired to the secure keystore. */
export const pinLockoutService = new PinLockoutService(secureStoreLockoutStore);
