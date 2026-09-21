import { dateInZone, installZoneClock, restoreZoneClock } from '../../../tests/helpers/zoneClock';
import { getCurrentMonth } from '../entities/Budget';
import { calculateYearToDateSummary } from '../calculations/ytdSummary';
import { TransactionType, type Transaction } from '../entities/Transaction';

/**
 * Local month and year buckets - domain layer (REGISTRE V-91).
 *
 * A Valto month is the DEVICE'S LOCAL month. Aggregation used to build its
 * YYYY-MM key from the UTC calendar, which disagrees with the local one for the
 * hours between local midnight and UTC midnight: east of UTC a row entered just
 * after midnight on the 1st was filed under the previous month, and west of UTC
 * a row entered on the evening of the last day was filed under the next one.
 *
 * The same read seeds getCurrentMonth(), which is stored as budgets.month and
 * gates the "a past month is closed" rule - so west of UTC a user could be
 * locked out of the budget for the month they were still living in.
 *
 * The process zone cannot be set from a test (jest copies process.env), so
 * these use tests/helpers/zoneClock: the zone is read from the ICU tz database
 * through Intl, never from TZ. Every case therefore asserts the same thing on
 * every machine and on every CI runner.
 */

// Lagos is UTC+1 all year, with no DST to reason about.
const LAGOS = 'Africa/Lagos';
// New York is UTC-4 on 31 March 2026 (DST is already in force).
const NEW_YORK = 'America/New_York';

function makeTransaction(date: Date, overrides: Partial<Transaction> = {}): Transaction {
    return {
        id: 'tx-1',
        type: TransactionType.EXPENSE,
        amount: 5000,
        categoryId: 'cat-food',
        walletId: 'w-1',
        date,
        createdAt: date,
        ...overrides,
    };
}

afterEach(() => {
    restoreZoneClock();
});

describe('V-91 T4 - year-to-date buckets by the local year', () => {
    it('counts a row at local midnight on 1 January in the new year', () => {
        // 2025-12-31T23:00Z is 2026-01-01 00:00 in Lagos. The row belongs to
        // 2026 on the device, though its UTC year is still 2025.
        const newYearsDay = dateInZone(Date.UTC(2025, 11, 31, 23, 0), LAGOS);
        const row = makeTransaction(newYearsDay, { type: TransactionType.INCOME, amount: 400000 });

        const summary = calculateYearToDateSummary([row], 2026);

        expect(summary.transactionCount).toBe(1);
        expect(summary.totalIncome).toBe(400000);
    });

    it('does not count that row in the previous year', () => {
        const newYearsDay = dateInZone(Date.UTC(2025, 11, 31, 23, 0), LAGOS);
        const row = makeTransaction(newYearsDay, { type: TransactionType.INCOME, amount: 400000 });

        const summary = calculateYearToDateSummary([row], 2025);

        expect(summary.transactionCount).toBe(0);
        expect(summary.totalIncome).toBe(0);
    });
});

describe('V-91 T5 - getCurrentMonth follows the local month east of UTC', () => {
    it('returns the new month at local 00:30 on 1 March', () => {
        // 2026-02-28T23:30Z is 2026-03-01 00:30 in Lagos.
        installZoneClock(LAGOS, Date.UTC(2026, 1, 28, 23, 30));

        expect(getCurrentMonth()).toBe('2026-03');
    });
});

describe('V-91 T6 - getCurrentMonth follows the local month west of UTC', () => {
    it('still returns March at local 20:30 on 31 March', () => {
        // 2026-04-01T00:30Z is 2026-03-31 20:30 in New York.
        installZoneClock(NEW_YORK, Date.UTC(2026, 3, 1, 0, 30));

        expect(getCurrentMonth()).toBe('2026-03');
    });
});
