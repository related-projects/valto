/**
 * v8 - Recurring end occurrence index (REGISTRE V-114, V-103)
 *
 * Additive only. Adds recurring_rules.end_occurrence_index, the number of the
 * last occurrence a rule may generate; see applyEndOccurrenceSchema.
 *
 * Backfill: every rule with an end date and no number yet gets the number its
 * end date implied to the unfixed code - the last occurrence whose local day
 * is on or before the local day of the end, read in the device's zone at the
 * moment the migration runs (Owner decision 2 of 01/10, pass 71; the same
 * reading migration v7 made of the watermark, register policy no. 10).
 * Verified by migrationV8EndOccurrenceIndex.test.ts - "migration v8: each
 * rule with an end gets the number of its last occurrence, and running it
 * again changes nothing".
 *
 * Idempotent: the column is added only when missing, and only a number that
 * is still NULL on a rule that has an end is filled; a number already there is
 * never rewritten. One transaction, so a failure leaves the database at v7 for
 * the next boot.
 */

import { deriveEndOccurrenceIndex } from '../../domain/calculations/recurrenceDates';
import { recurringMapper } from '../storage/sql/mappers';
import { applyEndOccurrenceSchema } from '../storage/sql/schema';
import type { Migration } from './migrationRunner';

export const v8_recurring_end_occurrence_index: Migration = {
    version: 8,
    name: 'recurring_end_occurrence_index',
    up: async ({ db }) => {
        await db.runInTransaction(async () => {
            await applyEndOccurrenceSchema(db);

            const { rows } = await db.execute(
                'SELECT * FROM recurring_rules WHERE end_date IS NOT NULL AND end_occurrence_index IS NULL',
            );
            for (const row of rows) {
                const rule = recurringMapper.fromRow(row);
                if (!rule.endDate) continue;
                await db.execute(
                    'UPDATE recurring_rules SET end_occurrence_index = ? WHERE id = ? AND end_occurrence_index IS NULL',
                    [deriveEndOccurrenceIndex({ ...rule, endDate: rule.endDate }), rule.id],
                );
            }
        });
    },
};
