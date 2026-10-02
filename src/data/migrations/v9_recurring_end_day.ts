/**
 * v9 - Recurring end day (REGISTRE V-103, Owner decision D11, pass 75)
 *
 * Additive only. Adds recurring_rules.end_day, the calendar day of the end the
 * user chose; see applyEndDaySchema. A schedule change finds the rule's last
 * occurrence again from this day, so a zone change cannot move it.
 *
 * Backfill: every rule with an end date and no day yet gets the local day of
 * its end date, read in the device's zone at the moment the migration runs -
 * for existing rules the day is fixed at the update, in the phone's zone then
 * (Owner decision D11; the same reading migration v8 made of the end).
 * Verified by migrationV9EndDay.test.ts - "V-103 A3.".
 *
 * Idempotent: the column is added only when missing, and only a day that is
 * still NULL on a rule that has an end is filled; a day already there is never
 * rewritten. One transaction, so a failure leaves the database at v8 for the
 * next boot.
 */

import { endDayOf } from '../../domain/calculations/recurrenceDates';
import { recurringMapper } from '../storage/sql/mappers';
import { applyEndDaySchema } from '../storage/sql/schema';
import type { Migration } from './migrationRunner';

export const v9_recurring_end_day: Migration = {
    version: 9,
    name: 'recurring_end_day',
    up: async ({ db }) => {
        await db.runInTransaction(async () => {
            await applyEndDaySchema(db);

            const { rows } = await db.execute(
                'SELECT * FROM recurring_rules WHERE end_date IS NOT NULL AND end_day IS NULL',
            );
            for (const row of rows) {
                const rule = recurringMapper.fromRow(row);
                const endDay = endDayOf(rule);
                if (endDay === undefined) continue;
                await db.execute(
                    'UPDATE recurring_rules SET end_day = ? WHERE id = ? AND end_day IS NULL',
                    [endDay, rule.id],
                );
            }
        });
    },
};
