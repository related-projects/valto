/**
 * PIN Lock-out Service Tests
 *
 * Exercises the durable, secure-store-backed throttle with an injected clock
 * and a stateful in-memory secure-store mock. Deterministic — no real timers.
 */

// Stateful expo-secure-store mock (overrides the static global one for this
// file) so persistence across "instances"/restarts is observable.
const mockSecureStoreData: Record<string, string> = {};
jest.mock('expo-secure-store', () => ({
    getItemAsync: jest.fn(async (k: string) => mockSecureStoreData[k] ?? null),
    setItemAsync: jest.fn(async (k: string, v: string) => {
        mockSecureStoreData[k] = v;
    }),
    deleteItemAsync: jest.fn(async (k: string) => {
        delete mockSecureStoreData[k];
    }),
    AFTER_FIRST_UNLOCK: 'AFTER_FIRST_UNLOCK',
}));

import { LOCKOUT_THRESHOLD } from '../../domain/security/lockout';
import {
    PinLockoutService,
    secureStoreLockoutStore,
} from '../../data/services/securityService';

const NOW = 5_000_000;
const HASH = 'STORED_HASH';
const wrong = async () => false; // compare that always says "wrong"
const right = async () => true; // compare that always says "correct"

beforeEach(() => {
    for (const k of Object.keys(mockSecureStoreData)) delete mockSecureStoreData[k];
    jest.clearAllMocks();
});

/** Fixed-clock service over the real secure-store-backed persistence. */
function service(now: number = NOW): PinLockoutService {
    return new PinLockoutService(secureStoreLockoutStore, () => now);
}

describe('PinLockoutService.verify', () => {
    it('DoD#1: after THRESHOLD wrong attempts the next verify is locked with remainingMs > 0', async () => {
        const svc = service();
        for (let i = 0; i < LOCKOUT_THRESHOLD - 1; i++) {
            const r = await svc.verify('0000', HASH, wrong);
            expect(r.ok).toBe(false);
        }
        const result = await svc.verify('0000', HASH, wrong);
        expect(result.ok).toBe(false);
        if (result.ok || !result.locked) throw new Error('expected locked');
        expect(result.remainingMs).toBeGreaterThan(0);
    });

    it('DoD#2: while locked, verify is rejected WITHOUT comparing the hash (throttle short-circuits)', async () => {
        const compare = jest.fn(wrong);
        const svc = service();

        // Reach the lock-out.
        for (let i = 0; i < LOCKOUT_THRESHOLD; i++) {
            await svc.verify('0000', HASH, compare);
        }
        expect(await svc.isLockedOut(NOW)).toBe(true);

        compare.mockClear();
        const result = await svc.verify('0000', HASH, compare);

        expect(compare).not.toHaveBeenCalled(); // hash never compared
        if (result.ok || !result.locked) throw new Error('expected locked');
        expect(result.remainingMs).toBeGreaterThan(0);
    });

    it('DoD#5: a correct PIN (while not locked) resets the state', async () => {
        const svc = service();
        await svc.verify('0000', HASH, wrong); // 1 failure
        await svc.verify('0000', HASH, wrong); // 2 failures

        const result = await svc.verify('1234', HASH, right);
        expect(result).toEqual({ ok: true });

        const state = await svc.getState();
        expect(state.failedAttempts).toBe(0);
        expect(state.lockedUntil).toBeNull();
    });
});

describe('persistence across instances / restart', () => {
    it('DoD#3: a fresh service over the same store is still locked', async () => {
        const svc1 = service();
        for (let i = 0; i < LOCKOUT_THRESHOLD; i++) {
            await svc1.verify('0000', HASH, wrong);
        }
        expect(await svc1.isLockedOut(NOW)).toBe(true);

        // Simulate kill + restart: brand-new instance, same durable store.
        const svc2 = new PinLockoutService(secureStoreLockoutStore, () => NOW);
        expect(await svc2.isLockedOut(NOW)).toBe(true);
        expect(await svc2.lockoutRemainingMs(NOW)).toBeGreaterThan(0);
    });

    it('lock-out clears once the clock passes lockedUntil', async () => {
        const svc = service();
        for (let i = 0; i < LOCKOUT_THRESHOLD; i++) {
            await svc.verify('0000', HASH, wrong);
        }
        const remaining = await svc.lockoutRemainingMs(NOW);
        const later = new PinLockoutService(secureStoreLockoutStore, () => NOW + remaining + 1);
        expect(await later.isLockedOut()).toBe(false);
    });

    it('reset() clears the durable state', async () => {
        const svc = service();
        for (let i = 0; i < LOCKOUT_THRESHOLD; i++) {
            await svc.verify('0000', HASH, wrong);
        }
        await svc.reset();
        expect(await svc.isLockedOut(NOW)).toBe(false);
        const state = await svc.getState();
        expect(state).toEqual({ failedAttempts: 0, lockedUntil: null });
    });
});

describe('secureStoreLockoutStore', () => {
    it('returns the initial state when nothing is persisted', async () => {
        expect(await secureStoreLockoutStore.load()).toEqual({
            failedAttempts: 0,
            lockedUntil: null,
        });
    });

    it('round-trips a saved state', async () => {
        await secureStoreLockoutStore.save({ failedAttempts: 3, lockedUntil: 123 });
        expect(await secureStoreLockoutStore.load()).toEqual({
            failedAttempts: 3,
            lockedUntil: 123,
        });
    });

    it('falls back to the initial state on corrupt data', async () => {
        mockSecureStoreData['valto.pin.lockout'] = '{not json';
        expect(await secureStoreLockoutStore.load()).toEqual({
            failedAttempts: 0,
            lockedUntil: null,
        });
    });
});
