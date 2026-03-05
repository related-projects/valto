/**
 * Security Domain Types
 *
 * Core types for the security module.
 * These are pure domain types — no UI or storage dependencies.
 */

/** Supported authentication methods */
export type AuthMethod = 'pin' | 'biometrics';

/** Persisted security configuration */
export interface SecurityConfig {
    /** SHA-256 hash of the user's PIN (never store raw PIN) */
    pinHash: string;
    /** Whether biometric authentication is enabled as an alternative to PIN */
    biometricsEnabled: boolean;
    /** Auto-lock timeout in milliseconds. 0 = immediate (lock on any background) */
    autoLockTimeout: number;
}

/** Result of a biometric hardware check */
export interface BiometricCapability {
    /** Whether the device has biometric hardware */
    available: boolean;
    /** Whether the user has enrolled biometric data (fingerprints, face, etc.) */
    enrolled: boolean;
    /** Human-readable description of available biometric types */
    biometricTypes: string[];
}

/** PIN validation rules */
export const PIN_LENGTH = 4;
export const MAX_PIN_ATTEMPTS = 5;
