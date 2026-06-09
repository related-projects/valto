/**
 * getGreeting Unit Tests
 *
 * Covers all four time-of-day ranges and every boundary transition.
 * All tests use fixed Date inputs — no reliance on real time.
 */

import { getGreeting } from '../getGreeting';

/** Helper to create a Date at a precise hour:minute on an arbitrary day. */
const at = (hour: number, minute = 0): Date =>
    new Date(2026, 0, 15, hour, minute, 0, 0); // 2026-01-15

describe('getGreeting', () => {
    // ─── Morning (05:00 – 11:59) ──────────────────────────────────────

    it('returns morning at exactly 05:00', () => {
        expect(getGreeting(at(5, 0))).toBe('dashboard.greetings.morning');
    });

    it('returns morning at 09:30', () => {
        expect(getGreeting(at(9, 30))).toBe('dashboard.greetings.morning');
    });

    it('returns morning at 11:59 (upper boundary)', () => {
        expect(getGreeting(at(11, 59))).toBe('dashboard.greetings.morning');
    });

    // ─── Afternoon (12:00 – 16:59) ────────────────────────────────────

    it('returns afternoon at exactly 12:00', () => {
        expect(getGreeting(at(12, 0))).toBe('dashboard.greetings.afternoon');
    });

    it('returns afternoon at 14:00', () => {
        expect(getGreeting(at(14, 0))).toBe('dashboard.greetings.afternoon');
    });

    it('returns afternoon at 16:59 (upper boundary)', () => {
        expect(getGreeting(at(16, 59))).toBe('dashboard.greetings.afternoon');
    });

    // ─── Evening (17:00 – 21:59) ──────────────────────────────────────

    it('returns evening at exactly 17:00', () => {
        expect(getGreeting(at(17, 0))).toBe('dashboard.greetings.evening');
    });

    it('returns evening at 19:30', () => {
        expect(getGreeting(at(19, 30))).toBe('dashboard.greetings.evening');
    });

    it('returns evening at 21:59 (upper boundary)', () => {
        expect(getGreeting(at(21, 59))).toBe('dashboard.greetings.evening');
    });

    // ─── Night (22:00 – 04:59) ────────────────────────────────────────

    it('returns night at exactly 22:00', () => {
        expect(getGreeting(at(22, 0))).toBe('dashboard.greetings.night');
    });

    it('returns night at midnight (00:00)', () => {
        expect(getGreeting(at(0, 0))).toBe('dashboard.greetings.night');
    });

    it('returns night at 02:00', () => {
        expect(getGreeting(at(2, 0))).toBe('dashboard.greetings.night');
    });

    it('returns night at 04:59 (upper boundary)', () => {
        expect(getGreeting(at(4, 59))).toBe('dashboard.greetings.night');
    });

    // ─── Boundary transitions ─────────────────────────────────────────

    it('transitions from night to morning at 05:00', () => {
        expect(getGreeting(at(4, 59))).toBe('dashboard.greetings.night');
        expect(getGreeting(at(5, 0))).toBe('dashboard.greetings.morning');
    });

    it('transitions from morning to afternoon at 12:00', () => {
        expect(getGreeting(at(11, 59))).toBe('dashboard.greetings.morning');
        expect(getGreeting(at(12, 0))).toBe('dashboard.greetings.afternoon');
    });

    it('transitions from afternoon to evening at 17:00', () => {
        expect(getGreeting(at(16, 59))).toBe('dashboard.greetings.afternoon');
        expect(getGreeting(at(17, 0))).toBe('dashboard.greetings.evening');
    });

    it('transitions from evening to night at 22:00', () => {
        expect(getGreeting(at(21, 59))).toBe('dashboard.greetings.evening');
        expect(getGreeting(at(22, 0))).toBe('dashboard.greetings.night');
    });
});
