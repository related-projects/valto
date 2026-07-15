/**
 * Security Service Tests
 *
 * Tests PIN hashing, verification, validation, and config persistence.
 * Uses the in-memory storage mock from the existing test setup.
 */

import {
    clearSecurityConfig,
    hashPin,
    isValidPin,
    loadSecurityConfig,
    saveSecurityConfig,
    setupSecurity,
    verifyPin,
} from '../../data/services/securityService';
import type { SecurityConfig } from '../../domain/security/types';
import { MAX_PIN_ATTEMPTS, PIN_LENGTH } from '../../domain/security/types';

// ─── Mock expo-crypto ─────────────────────────────────────────────────
// We mock the digest function for deterministic test output.

jest.mock('expo-crypto', () => ({
    digestStringAsync: jest.fn(async (_algo: string, data: string) => {
        // Simple deterministic hash for testing — NOT cryptographic!
        let hash = 0;
        for (let i = 0; i < data.length; i++) {
            const char = data.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // Convert to 32-bit integer
        }
        return Math.abs(hash).toString(16).padStart(16, '0');
    }),
    CryptoDigestAlgorithm: {
        SHA256: 'SHA-256',
    },
}));

// Mock AsyncStorage using the standard mock from the library
jest.mock('@react-native-async-storage/async-storage', () =>
    require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

import AsyncStorage from '@react-native-async-storage/async-storage';

beforeEach(async () => {
    await AsyncStorage.clear();
    jest.clearAllMocks();
});

// ─── PIN Hashing ──────────────────────────────────────────────────────

describe('PIN Hashing', () => {
    it('produces a non-empty hash', async () => {
        const hash = await hashPin('1234');
        expect(hash).toBeTruthy();
        expect(hash.length).toBeGreaterThan(0);
    });

    it('hash is NOT the raw PIN', async () => {
        const hash = await hashPin('1234');
        expect(hash).not.toBe('1234');
    });

    it('same PIN produces same hash (deterministic)', async () => {
        const hash1 = await hashPin('1234');
        const hash2 = await hashPin('1234');
        expect(hash1).toBe(hash2);
    });

    it('different PINs produce different hashes', async () => {
        const hash1 = await hashPin('1234');
        const hash2 = await hashPin('5678');
        expect(hash1).not.toBe(hash2);
    });
});

// ─── PIN Verification ─────────────────────────────────────────────────

describe('PIN Verification', () => {
    it('correct PIN verifies successfully', async () => {
        const hash = await hashPin('4321');
        const result = await verifyPin('4321', hash);
        expect(result).toBe(true);
    });

    it('wrong PIN does not verify', async () => {
        const hash = await hashPin('4321');
        const result = await verifyPin('0000', hash);
        expect(result).toBe(false);
    });

    it('empty PIN does not verify against valid hash', async () => {
        const hash = await hashPin('1234');
        const result = await verifyPin('', hash);
        expect(result).toBe(false);
    });
});

// ─── PIN Validation ───────────────────────────────────────────────────

describe('PIN Validation', () => {
    it('accepts valid 4-digit PIN', () => {
        expect(isValidPin('1234')).toBe(true);
    });

    it('rejects PIN that is too short', () => {
        expect(isValidPin('123')).toBe(false);
    });

    it('rejects PIN that is too long', () => {
        expect(isValidPin('12345')).toBe(false);
    });

    it('rejects PIN with non-digit characters', () => {
        expect(isValidPin('12ab')).toBe(false);
    });

    it('rejects empty PIN', () => {
        expect(isValidPin('')).toBe(false);
    });
});

// ─── Security Config Persistence ──────────────────────────────────────

describe('Security Config Persistence', () => {
    it('returns null when no config is stored', async () => {
        const config = await loadSecurityConfig();
        expect(config).toBeNull();
    });

    it('saves and loads config correctly', async () => {
        const config: SecurityConfig = {
            pinHash: 'abc123',
            biometricsEnabled: true,
            autoLockTimeout: 0,
        };
        await saveSecurityConfig(config);
        const loaded = await loadSecurityConfig();
        expect(loaded).toEqual(config);
    });

    it('clearSecurityConfig removes stored config', async () => {
        const config: SecurityConfig = {
            pinHash: 'abc123',
            biometricsEnabled: false,
            autoLockTimeout: 0,
        };
        await saveSecurityConfig(config);
        await clearSecurityConfig();
        const loaded = await loadSecurityConfig();
        expect(loaded).toBeNull();
    });
});

// ─── Setup Security ───────────────────────────────────────────────────

describe('setupSecurity', () => {
    it('creates and persists security config', async () => {
        const config = await setupSecurity('1234', true);
        expect(config.pinHash).toBeTruthy();
        expect(config.pinHash).not.toBe('1234');
        expect(config.biometricsEnabled).toBe(true);
        expect(config.autoLockTimeout).toBe(0);

        const loaded = await loadSecurityConfig();
        expect(loaded).toEqual(config);
    });

    it('rejects invalid PIN', async () => {
        await expect(setupSecurity('12', false)).rejects.toThrow();
    });

    it('verifies stored PIN matches original', async () => {
        const config = await setupSecurity('9999', false);
        const valid = await verifyPin('9999', config.pinHash);
        expect(valid).toBe(true);

        const invalid = await verifyPin('0000', config.pinHash);
        expect(invalid).toBe(false);
    });
});

// ─── Domain Constants ─────────────────────────────────────────────────

describe('Security Constants', () => {
    it('PIN_LENGTH is 4', () => {
        expect(PIN_LENGTH).toBe(4);
    });

    it('MAX_PIN_ATTEMPTS is 5', () => {
        expect(MAX_PIN_ATTEMPTS).toBe(5);
    });
});
