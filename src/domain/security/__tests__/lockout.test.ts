/**
 * PIN Lock-out Policy Tests (pure domain)
 *
 * Deterministic — a fixed `now` is injected everywhere, no real timers.
 */

import {
    applyAttempt,
    INITIAL_LOCKOUT_STATE,
    isLockedOut,
    LOCKOUT_BASE_MS,
    LOCKOUT_MAX_MS,
    LOCKOUT_THRESHOLD,
    lockoutDuration,
    lockoutRemainingMs,
    type LockoutState,
} from '../lockout';

const NOW = 1_000_000;

/** Replay N wrong attempts from INITIAL, returning the resulting state. */
function failTimes(n: number, now = NOW): LockoutState {
    let state = { ...INITIAL_LOCKOUT_STATE };
    for (let i = 0; i < n; i++) {
        state = applyAttempt(state, false, now).state;
    }
    return state;
}

describe('lockoutDuration', () => {
    it('is BASE at exactly the threshold', () => {
        expect(lockoutDuration(LOCKOUT_THRESHOLD)).toBe(LOCKOUT_BASE_MS);
    });

    it('doubles per extra failure', () => {
        expect(lockoutDuration(LOCKOUT_THRESHOLD + 1)).toBe(LOCKOUT_BASE_MS * 2);
        expect(lockoutDuration(LOCKOUT_THRESHOLD + 2)).toBe(LOCKOUT_BASE_MS * 4);
    });

    it('is capped at LOCKOUT_MAX_MS', () => {
        expect(lockoutDuration(LOCKOUT_THRESHOLD + 100)).toBe(LOCKOUT_MAX_MS);
    });
});

describe('applyAttempt — wrong PINs', () => {
    it('DoD#1: the THRESHOLD-th wrong attempt locks with remainingMs > 0', () => {
        const state = failTimes(LOCKOUT_THRESHOLD - 1);
        const { state: next, result } = applyAttempt(state, false, NOW);

        expect(result.ok).toBe(false);
        if (result.ok) throw new Error('unreachable');
        expect(result.locked).toBe(true);
        if (!result.locked) throw new Error('unreachable');
        expect(result.remainingMs).toBeGreaterThan(0);
        expect(next.lockedUntil).toBe(NOW + LOCKOUT_BASE_MS);
        expect(isLockedOut(next, NOW)).toBe(true);
    });

    it('reports attemptsRemaining before the threshold', () => {
        const { result } = applyAttempt({ ...INITIAL_LOCKOUT_STATE }, false, NOW);
        if (result.ok || result.locked) throw new Error('expected not-locked failure');
        expect(result.attemptsRemaining).toBe(LOCKOUT_THRESHOLD - 1);
    });

    it('DoD#4: backoff grows with each further failure (until the cap)', () => {
        const lockN = failTimes(LOCKOUT_THRESHOLD).lockedUntil!;
        const lockN1 = applyAttempt(failTimes(LOCKOUT_THRESHOLD), false, NOW).state.lockedUntil!;
        const lockN2 = applyAttempt(
            applyAttempt(failTimes(LOCKOUT_THRESHOLD), false, NOW).state,
            false,
            NOW,
        ).state.lockedUntil!;

        const durN = lockN - NOW;
        const durN1 = lockN1 - NOW;
        const durN2 = lockN2 - NOW;

        expect(durN1).toBeGreaterThan(durN);
        expect(durN2).toBeGreaterThan(durN1);
    });
});

describe('applyAttempt — correct PIN', () => {
    it('DoD#5: a correct PIN resets failedAttempts and lockedUntil', () => {
        const dirty = failTimes(LOCKOUT_THRESHOLD); // locked, attempts = 5
        expect(dirty.failedAttempts).toBe(LOCKOUT_THRESHOLD);
        expect(dirty.lockedUntil).not.toBeNull();

        const { state, result } = applyAttempt(dirty, true, NOW + LOCKOUT_MAX_MS);
        expect(result).toEqual({ ok: true });
        expect(state.failedAttempts).toBe(0);
        expect(state.lockedUntil).toBeNull();
    });
});

describe('isLockedOut / lockoutRemainingMs', () => {
    it('not locked when lockedUntil is null', () => {
        expect(isLockedOut(INITIAL_LOCKOUT_STATE, NOW)).toBe(false);
        expect(lockoutRemainingMs(INITIAL_LOCKOUT_STATE, NOW)).toBe(0);
    });

    it('locked while now < lockedUntil, clears once now passes it', () => {
        const state: LockoutState = { failedAttempts: 5, lockedUntil: NOW + 30_000 };
        expect(isLockedOut(state, NOW)).toBe(true);
        expect(lockoutRemainingMs(state, NOW)).toBe(30_000);
        expect(isLockedOut(state, NOW + 30_000)).toBe(false);
        expect(lockoutRemainingMs(state, NOW + 31_000)).toBe(0);
    });
});
