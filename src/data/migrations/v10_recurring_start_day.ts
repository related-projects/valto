/**
 * v10 - Recurring start day (REGISTRE V-116, Owner decision 3, pass 78)
 *
 * Additive only. Adds recurring_rules.start_day, the calendar day a rule
 * starts on; see applyStartDaySchema. Every occurrence is derived from this
 * day, so a zone change moves neither the start nor the anchor day.
 *
 * Backfill: every rule with no day yet gets the local day of its start date,
 * read in the device's zone at the moment the migration runs - for existing
 * rules the day is fixed at the update, in the phone's zone then (Owner
 * decision 3; the same reading migration v9 made of the end, V-103 decision
 * D11). Verified by migrationV10StartDay.test.ts - "V-116 A3." and "V-116 A3
 * (v6 -> v10).".
 *
 * Idempotent: the column is added only when missing, and only a day that is
 * still NULL is filled; a day already there is never rewritten. One
 * transaction, so a failure leaves the database at v9 for the next boot.
 */

import { startDayOf } from '../../domain/calculations/recurrenceDates';
import { recurringMapper } from '../storage/sql/mappers';
import { applyStartDaySchema } from '../storage/sql/schema';
import type { Migration } from './migrationRunner';

export const v10_recurring_start_day: Migration = {
    version: 10,
    name: 'recurring_start_day',
    up: async ({ db }) => {
        await db.runInTransaction(async () => {
            await applyStartDaySchema(db);

            const { rows } = await db.execute('SELECT * FROM recurring_rules WHERE start_day IS NULL');
            for (const row of rows) {
                const rule = recurringMapper.fromRow(row);
                await db.execute(
                    'UPDATE recurring_rules SET start_day = ? WHERE id = ? AND start_day IS NULL',
                    [startDayOf(rule), rule.id],
                );
            }
        });
    },
};
