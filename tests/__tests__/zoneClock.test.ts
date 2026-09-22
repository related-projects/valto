import { dateInZone, installZoneClock, restoreZoneClock } from '../helpers/zoneClock';

/**
 * Tests for the zone helper itself (REGISTRE V-91).
 *
 * installZoneClock patches Date.prototype and installs jest's fake Date for the
 * whole process, so a leak would not fail here -- it would fail somewhere else,
 * in a suite that never mentioned time zones. These tests pin the contract:
 * the patch works, and restoreZoneClock puts back the very same native function
 * objects and the real clock.
 */

// Captured before anything is installed, so identity comparisons below are
// against the genuine natives.
const nativeGetFullYear = Date.prototype.getFullYear;
const nativeGetMonth = Date.prototype.getMonth;
const nativeGetDate = Date.prototype.getDate;
const nativeGetHours = Date.prototype.getHours;
const nativeGetMinutes = Date.prototype.getMinutes;
const nativeGetTimezoneOffset = Date.prototype.getTimezoneOffset;

// Lagos is UTC+1 with no DST, so 2026-02-28T23:00Z is 2026-03-01 00:00 local.
const LAGOS_MARCH_FIRST_MIDNIGHT = Date.UTC(2026, 1, 28, 23, 0);

afterEach(() => {
    restoreZoneClock();
});

describe('dateInZone', () => {
    it('reports the wall clock of the named zone, not the machine zone', () => {
        const date = dateInZone(LAGOS_MARCH_FIRST_MIDNIGHT, 'Africa/Lagos');

        expect(date.getFullYear()).toBe(2026);
        expect(date.getMonth()).toBe(2); // March
        expect(date.getDate()).toBe(1);
        expect(date.getHours()).toBe(0);
        expect(date.getMinutes()).toBe(0);
        expect(date.getTimezoneOffset()).toBe(-60);
    });

    it('leaves the instant and the UTC getters native', () => {
        const date = dateInZone(LAGOS_MARCH_FIRST_MIDNIGHT, 'Africa/Lagos');

        expect(date.getTime()).toBe(LAGOS_MARCH_FIRST_MIDNIGHT);
        expect(date.toISOString()).toBe('2026-02-28T23:00:00.000Z');
        expect(date.getUTCFullYear()).toBe(2026);
        expect(date.getUTCMonth()).toBe(1); // February
        expect(date.getUTCDate()).toBe(28);
    });

    it('moves only the Date it is given', () => {
        dateInZone(LAGOS_MARCH_FIRST_MIDNIGHT, 'Pacific/Kiritimati');

        const untouched = new Date(LAGOS_MARCH_FIRST_MIDNIGHT);
        expect(untouched.getFullYear).toBe(nativeGetFullYear);
    });
});

describe('installZoneClock', () => {
    it('fixes what new Date() returns', () => {
        installZoneClock('Africa/Lagos', LAGOS_MARCH_FIRST_MIDNIGHT);

        expect(new Date().getTime()).toBe(LAGOS_MARCH_FIRST_MIDNIGHT);
        expect(Date.now()).toBe(LAGOS_MARCH_FIRST_MIDNIGHT);
    });

    it('moves the local getters of the clock itself', () => {
        installZoneClock('Africa/Lagos', LAGOS_MARCH_FIRST_MIDNIGHT);

        const now = new Date();
        expect(now.getFullYear()).toBe(2026);
        expect(now.getMonth()).toBe(2); // March, though the instant is 28 February UTC
    });

    it('moves the local getters of any Date, whatever its instant', () => {
        installZoneClock('Africa/Lagos', LAGOS_MARCH_FIRST_MIDNIGHT);

        // A different day entirely: the zone is fixed, the instant is not.
        const other = new Date(Date.UTC(2025, 11, 31, 23, 30));
        expect(other.getFullYear()).toBe(2026);
        expect(other.getMonth()).toBe(0); // January
        expect(other.getDate()).toBe(1);
    });

    it('moves a Date built before the clock was installed', () => {
        const built = new Date(LAGOS_MARCH_FIRST_MIDNIGHT);

        installZoneClock('Africa/Lagos', LAGOS_MARCH_FIRST_MIDNIGHT);

        expect(built.getMonth()).toBe(2);
    });

    it('applies the zone it is given, west of UTC too', () => {
        // New York is UTC-4 on 1 April 2026 (DST), so 2026-04-01T00:30Z is
        // 31 March 20:30 local.
        installZoneClock('America/New_York', Date.UTC(2026, 3, 1, 0, 30));

        const now = new Date();
        expect(now.getMonth()).toBe(2); // March
        expect(now.getDate()).toBe(31);
        expect(now.getHours()).toBe(20);
    });

    it('leaves real timers running, so async helpers still settle', async () => {
        installZoneClock('Africa/Lagos', LAGOS_MARCH_FIRST_MIDNIGHT);

        await expect(new Promise(resolve => setTimeout(() => resolve('settled'), 1))).resolves.toBe('settled');
    });

    it('refuses to stack a second install', () => {
        installZoneClock('Africa/Lagos', LAGOS_MARCH_FIRST_MIDNIGHT);

        expect(() => installZoneClock('America/New_York', LAGOS_MARCH_FIRST_MIDNIGHT)).toThrow(
            'a zone clock is already installed',
        );
    });
});

describe('restoreZoneClock', () => {
    it('puts back the native prototype methods, by identity', () => {
        installZoneClock('Africa/Lagos', LAGOS_MARCH_FIRST_MIDNIGHT);
        expect(Date.prototype.getFullYear).not.toBe(nativeGetFullYear);

        restoreZoneClock();

        expect(Date.prototype.getFullYear).toBe(nativeGetFullYear);
        expect(Date.prototype.getMonth).toBe(nativeGetMonth);
        expect(Date.prototype.getDate).toBe(nativeGetDate);
        expect(Date.prototype.getHours).toBe(nativeGetHours);
        expect(Date.prototype.getMinutes).toBe(nativeGetMinutes);
        expect(Date.prototype.getTimezoneOffset).toBe(nativeGetTimezoneOffset);
    });

    it('puts back the real clock', () => {
        installZoneClock('Africa/Lagos', LAGOS_MARCH_FIRST_MIDNIGHT);
        expect(Date.now()).toBe(LAGOS_MARCH_FIRST_MIDNIGHT);

        restoreZoneClock();

        // The real clock is years past the pinned instant and keeps moving.
        expect(Date.now()).toBeGreaterThan(Date.UTC(2026, 8, 1));
        expect(new Date().getTime()).not.toBe(LAGOS_MARCH_FIRST_MIDNIGHT);
    });

    it('allows a fresh install once it has run', () => {
        installZoneClock('Africa/Lagos', LAGOS_MARCH_FIRST_MIDNIGHT);
        restoreZoneClock();

        expect(() => installZoneClock('America/New_York', LAGOS_MARCH_FIRST_MIDNIGHT)).not.toThrow();
    });

    it('is safe to call when nothing was installed', () => {
        expect(() => restoreZoneClock()).not.toThrow();
        expect(Date.prototype.getFullYear).toBe(nativeGetFullYear);
    });
});
