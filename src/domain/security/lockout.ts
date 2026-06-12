/**
 * PIN Lock-out Policy (pure domain)
 *
 * Exponential-backoff brute-force throttle for the unlock PIN. All functions
 * here are pure and time-injectable (`now` is always passed in) so the policy
 * is exercised deterministically under Jest — no real timers, no sleeps.
 *
 * The orchestration that loads/persists state and compares the PIN hash lives
 * in the data layer (securityService); this module only owns the math.
 */

// ─── Tunable policy constants (single source of truth) ────────────────

/** Failed attempts allowed before the first lock-out kicks in. */
export const LOCKOUT_THRESHOLD = 5;
/** Duration of the first lock-out. */
export const LOCKOUT_BASE_MS = 30_000;
/** Hard cap on any single lock-out. */
export const LOCKOUT_MAX_MS = 15 * 60_000;

// ─── State & result types ─────────────────────────────────────────────

/** Durable brute-force state (persisted in the secure keystore). */
export interface LockoutState {
    /** Consecutive failed PIN attempts. */
    failedAttempts: number;
    /** Epoch ms until which input is locked, or null when not locked. */
    lockedUntil: number | null;
}

export const INITIAL_LOCKOUT_STATE: LockoutState = {
    failedAttempts: 0,
    lockedUntil: null,
};

/** Discriminated result of a verify attempt. */
export type VerifyResult =
    | { ok: true }
    | { ok: false; locked: true; remainingMs: number }
    | { ok: false; locked: false; attemptsRemaining: number };

// ─── Pure policy ──────────────────────────────────────────────────────

/**
 * Lock-out duration for a given failed-attempt count.
 * duration(n) = min(BASE * 2^(n - THRESHOLD), MAX).
 * At exactly THRESHOLD this is BASE; it doubles per extra failure up to MAX.
 */
export function lockoutDuration(failedAttempts: number): number {
    const exponent = failedAttempts - LOCKOUT_THRESHOLD;
    const ms = LOCKOUT_BASE_MS * Math.pow(2, exponent);
    return Math.min(ms, LOCKOUT_MAX_MS);
}

/** True while `now` is before the locked-until instant. */
export function isLockedOut(state: LockoutState, now: number): boolean {
    return state.lockedUntil !== null && now < state.lockedUntil;
}

/** Milliseconds remaining on the current lock-out (0 when not locked). */
export function lockoutRemainingMs(state: LockoutState, now: number): number {
    if (state.lockedUntil === null) return 0;
    return Math.max(0, state.lockedUntil - now);
}

/**
 * Pure state transition for one attempt whose hash comparison already ran.
 * MUST NOT be called while locked — the caller short-circuits that case
 * without ever comparing the hash (that short-circuit is the throttle).
 */
export function applyAttempt(
    state: LockoutState,
    pinCorrect: boolean,
    now: number,
): { state: LockoutState; result: VerifyResult } {
    if (pinCorrect) {
        return { state: { ...INITIAL_LOCKOUT_STATE }, result: { ok: true } };
    }

    const failedAttempts = state.failedAttempts + 1;

    if (failedAttempts >= LOCKOUT_THRESHOLD) {
        const lockedUntil = now + lockoutDuration(failedAttempts);
        return {
            state: { failedAttempts, lockedUntil },
            result: { ok: false, locked: true, remainingMs: lockedUntil - now },
        };
    }

    return {
        state: { failedAttempts, lockedUntil: null },
        result: { ok: false, locked: false, attemptsRemaining: LOCKOUT_THRESHOLD - failedAttempts },
    };
}
