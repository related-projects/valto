/**
 * Security Service
 *
 * Handles PIN hashing, verification, and security config persistence.
 * PIN is never stored in plain text — only the SHA-256 hash is persisted.
 * Uses the existing storage abstraction.
 */

import * as Crypto from 'expo-crypto';
import { PIN_LENGTH, type SecurityConfig } from '../../domain/security/types';
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
