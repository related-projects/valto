/**
 * Time-zone control for tests (REGISTRE V-91).
 *
 * A Valto month is the device's LOCAL month, so the aggregation code reads
 * local getters (getFullYear / getMonth). Testing that reliably needs the
 * process to behave as if it sat in a chosen zone -- and a test cannot set the
 * process zone: jest gives each test file a copied process.env (jest-util
 * createProcessObject / createProcessEnv), so assigning TZ never reaches the
 * real env setter that makes Node re-read the zone.
 *
 * The way around it is the one already used by the PDF export suites: read the
 * wall clock of a named zone out of the ICU tz database through
 * Intl.DateTimeFormat with an explicit timeZone, and hand those fields to the
 * local getters. toISOString and the UTC getters stay native throughout, and
 * nothing here depends on the machine zone.
 *
 * Two levels are offered, because the two jobs are different:
 *
 *   dateInZone(utcMs, tz)        -- moves the getters of ONE Date. Enough when
 *                                   the code under test only reads a fixture.
 *   installZoneClock(tz, nowMs)  -- moves the getters of EVERY Date, and fixes
 *                                   what `new Date()` returns. Needed when the
 *                                   code under test asks the clock itself, as
 *                                   getCurrentMonth() does.
 *
 * installZoneClock is global state. Every suite that calls it MUST call
 * restoreZoneClock() in afterEach; tests/__tests__/zoneClock.test.ts proves the
 * restore puts the native methods and the real timers back.
 */

/** Local-calendar getters this module is able to move into another zone. */
interface ZoneFields {
    year: number;
    monthIndex: number;
    day: number;
    hours: number;
    minutes: number;
    offsetMinutes: number;
}

/**
 * Read the wall clock of `timeZone` at the instant `utcMs`, straight out of the
 * ICU tz database. This is the single place that knows how to cross zones; both
 * dateInZone and installZoneClock go through it.
 */
function readZoneFields(utcMs: number, timeZone: string): ZoneFields {
    const date = new Date(utcMs);
    const parts = new Intl.DateTimeFormat('en-US', {
        timeZone,
        year: 'numeric',
        month: 'numeric',
        day: 'numeric',
        hour: 'numeric',
        minute: 'numeric',
        hourCycle: 'h23',
    }).formatToParts(date);
    const field = (type: Intl.DateTimeFormatPartTypes): number =>
        Number(parts.find(part => part.type === type)?.value);

    const year = field('year');
    const monthIndex = field('month') - 1;
    const day = field('day');
    const hours = field('hour');
    const minutes = field('minute');

    // Re-express the wall clock as if it were UTC; the gap to the true instant
    // is the zone offset. Seconds and milliseconds do not vary by zone, so they
    // are read straight off the instant and cancel out of the subtraction.
    const wallClockAsUtc = Date.UTC(
        year,
        monthIndex,
        day,
        hours,
        minutes,
        date.getUTCSeconds(),
        date.getUTCMilliseconds(),
    );
    const offsetMinutes = -(wallClockAsUtc - utcMs) / 60000;

    return { year, monthIndex, day, hours, minutes, offsetMinutes };
}

/**
 * A Date for the instant `utcMs` whose local getters report the wall clock of
 * `timeZone`, independent of the zone the process runs in.
 *
 * Instance-level: it mutates and returns that one Date and touches nothing
 * else. Use it for a fixture handed to a pure function. When the code under
 * test calls `new Date()` for itself, use installZoneClock instead.
 */
export function dateInZone(utcMs: number, timeZone: string): Date {
    const date = new Date(utcMs);
    const { year, monthIndex, day, hours, minutes, offsetMinutes } = readZoneFields(utcMs, timeZone);

    return Object.assign(date, {
        getFullYear: () => year,
        getMonth: () => monthIndex,
        getDate: () => day,
        getHours: () => hours,
        getMinutes: () => minutes,
        getTimezoneOffset: () => offsetMinutes,
    });
}

/**
 * The prototype the patch is applied to, captured at module load while Date is
 * still the native one.
 *
 * Under jest's modern fake timers the global Date is replaced by a ClockDate
 * class that EXTENDS the native Date and overrides only the constructor and
 * Date.now. Its prototype therefore inherits from this object and adds no
 * getFullYear of its own, so patching here is seen by faked and unfaked Dates
 * alike -- including fixtures built before the clock was installed.
 */
const nativeDatePrototype = Date.prototype;

/** Prototype methods replaced by the current install, keyed for exact restore. */
type PatchedGetter =
    | 'getFullYear'
    | 'getMonth'
    | 'getDate'
    | 'getHours'
    | 'getMinutes'
    | 'getTimezoneOffset';

const PATCHED_GETTERS: PatchedGetter[] = [
    'getFullYear',
    'getMonth',
    'getDate',
    'getHours',
    'getMinutes',
    'getTimezoneOffset',
];

/**
 * Non-null exactly while a zone clock is installed. Holds the native methods so
 * restoreZoneClock puts back the very same function objects, not equivalents --
 * a test can then assert identity to prove the restore was real.
 */
let savedGetters: Partial<Record<PatchedGetter, () => number>> | null = null;

/**
 * Timer APIs jest is told to leave alone. Everything fakeable EXCEPT 'Date', so
 * setTimeout and friends keep running for real: renderHook and waitFor need
 * real timers to settle, and faking them here would hang every hook test.
 */
const TIMER_APIS = [
    'hrtime',
    'nextTick',
    'performance',
    'queueMicrotask',
    'requestAnimationFrame',
    'cancelAnimationFrame',
    'requestIdleCallback',
    'cancelIdleCallback',
    'setImmediate',
    'clearImmediate',
    'setInterval',
    'clearInterval',
    'setTimeout',
    'clearTimeout',
] as const;

/**
 * Run the rest of the test as if the device sat in `timeZone` with its clock at
 * the instant `nowUtcMs`.
 *
 * Two effects, both needed to exercise a local month bucket end to end:
 *  - `new Date()` (and Date.now) return `nowUtcMs`, so getCurrentMonth() reads
 *    the instant the test chose;
 *  - every Date's local getters report `timeZone`, so both the clock and the
 *    transaction fixtures land on the same calendar.
 *
 * MUST be paired with restoreZoneClock() in afterEach.
 *
 * @param timeZone IANA zone name, e.g. 'Africa/Lagos'.
 * @param nowUtcMs The instant the clock is pinned to, in UTC milliseconds.
 */
export function installZoneClock(timeZone: string, nowUtcMs: number): void {
    if (savedGetters !== null) {
        throw new Error('installZoneClock: a zone clock is already installed; call restoreZoneClock first');
    }

    // Spread inline: jest.useFakeTimers takes a union of the modern and legacy
    // configs, and only an object literal at the call site narrows it to the
    // modern one that carries doNotFake.
    jest.useFakeTimers({ now: nowUtcMs, doNotFake: [...TIMER_APIS] });

    const saved: Partial<Record<PatchedGetter, () => number>> = {};
    for (const name of PATCHED_GETTERS) {
        saved[name] = nativeDatePrototype[name];
    }
    savedGetters = saved;

    // Each getter recomputes from its own instant, so a fixture built for a
    // different day is converted correctly too -- the zone is fixed, the
    // instant is not.
    const fieldsOf = function (this: Date): ZoneFields {
        return readZoneFields(this.getTime(), timeZone);
    };

    nativeDatePrototype.getFullYear = function (this: Date): number {
        return fieldsOf.call(this).year;
    };
    nativeDatePrototype.getMonth = function (this: Date): number {
        return fieldsOf.call(this).monthIndex;
    };
    nativeDatePrototype.getDate = function (this: Date): number {
        return fieldsOf.call(this).day;
    };
    nativeDatePrototype.getHours = function (this: Date): number {
        return fieldsOf.call(this).hours;
    };
    nativeDatePrototype.getMinutes = function (this: Date): number {
        return fieldsOf.call(this).minutes;
    };
    nativeDatePrototype.getTimezoneOffset = function (this: Date): number {
        return fieldsOf.call(this).offsetMinutes;
    };
}

/**
 * Undo installZoneClock: put the native prototype methods back and return to
 * real timers. Safe to call when nothing is installed, so it can sit in an
 * afterEach that also covers tests which never installed a clock.
 */
export function restoreZoneClock(): void {
    if (savedGetters !== null) {
        for (const name of PATCHED_GETTERS) {
            const native = savedGetters[name];
            if (native !== undefined) {
                nativeDatePrototype[name] = native;
            }
        }
        savedGetters = null;
    }

    jest.useRealTimers();
}
