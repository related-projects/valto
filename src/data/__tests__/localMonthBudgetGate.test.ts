import { installZoneClock, restoreZoneClock } from '../../../tests/helpers/zoneClock';
import { createTestDb } from '../../../tests/helpers/createTestDb';
import type { SqlDatabase } from '../storage/sql/SqlDatabase';
import { BudgetRepository } from '../repositories/BudgetRepository';
import { BudgetMonthClosedError } from '../../domain/useCases/errors';

/**
 * The past-month gate follows the local month (REGISTRE V-91, T6).
 *
 * BudgetRepository.updateFromDTO refuses to touch a budget whose month is
 * already behind getCurrentMonth(). While getCurrentMonth() read the UTC
 * calendar, a user west of UTC lost the ability to edit the budget for the
 * month they were still living in, for the last hours of every month: at
 * 20:30 on 31 March in New York the UTC clock had already turned to April, so
 * the March budget read as closed.
 *
 * The zone comes from the ICU tz database through tests/helpers/zoneClock, not
 * from TZ, so this asserts the same thing on every machine.
 */

// New York is UTC-4 on 31 March 2026, so 2026-04-01T00:30Z is 31 March 20:30
// local: the last evening of March on the device, already April in UTC.
const NEW_YORK = 'America/New_York';
const NEW_YORK_LAST_EVENING_OF_MARCH = Date.UTC(2026, 3, 1, 0, 30);

describe('V-91 T6 - the past-month gate follows the local month', () => {
    let storage: SqlDatabase;
    let repo: BudgetRepository;

    beforeEach(async () => {
        storage = await createTestDb();
        repo = new BudgetRepository(storage);
    });

    afterEach(() => {
        restoreZoneClock();
    });

    it('still allows editing the March budget at local 20:30 on 31 March', async () => {
        const created = await repo.create({
            categoryId: 'cat-food',
            month: '2026-03',
            limitAmount: 50000,
        });

        installZoneClock(NEW_YORK, NEW_YORK_LAST_EVENING_OF_MARCH);

        await expect(repo.updateFromDTO({ id: created.id, limitAmount: 64000 })).resolves.toBeDefined();
        expect((await repo.getById(created.id))?.limitAmount).toBe(64000);
    });

    it('does not throw BudgetMonthClosedError for the month the device is in', async () => {
        const created = await repo.create({
            categoryId: 'cat-food',
            month: '2026-03',
            limitAmount: 50000,
        });

        installZoneClock(NEW_YORK, NEW_YORK_LAST_EVENING_OF_MARCH);

        let caught: unknown;
        try {
            await repo.updateFromDTO({ id: created.id, limitAmount: 64000 });
        } catch (err) {
            caught = err;
        }

        expect(caught).not.toBeInstanceOf(BudgetMonthClosedError);
        expect(caught).toBeUndefined();
    });

    it('still closes a genuinely past month', async () => {
        const created = await repo.create({
            categoryId: 'cat-food',
            month: '2026-02',
            limitAmount: 50000,
        });

        installZoneClock(NEW_YORK, NEW_YORK_LAST_EVENING_OF_MARCH);

        await expect(
            repo.updateFromDTO({ id: created.id, limitAmount: 64000 }),
        ).rejects.toBeInstanceOf(BudgetMonthClosedError);
        expect((await repo.getById(created.id))?.limitAmount).toBe(50000);
    });
});
