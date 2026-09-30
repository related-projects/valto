/**
 * v7 - Recurring occurrence key (REGISTRE V-98)
 *
 * Additive only. Adds the occurrence key - the rule's number of its last
 * generated occurrence and schedule version, each generated transaction's
 * (rule, schedule version, number) - and the partial unique index over it;
 * see applyOccurrenceKeySchema.
 *
 * Backfill: every rule without a number gets the one the unfixed engine's
 * watermark already implied, read in the device's zone at the moment the
 * migration runs - the same zone the first engine run of this boot reads it
 * in, a few statements later. The first run after the upgrade therefore
 * emits exactly what the unfixed engine would have emitted: nothing again,
 * nothing skipped (register policy no. 10). Verified by
 * migrationV7OccurrenceKey.test.ts - "migration v7: backfills each index so
 * the first run emits exactly what the unfixed engine would have".
 *
 * Existing transactions get no key: which rule wrote a row was never
 * recorded, and duplicates already in a ledger are neither identified nor
 * repaired (owner decision, V-98).
 *
 * Idempotent: a column is added only when missing, the index is created IF
 * NOT EXISTS, and only rules whose number is still NULL are backfilled. One
 * transaction, so a failure leaves the database at v6 for the next boot.
 */

import { deriveLastGeneratedIndex } from '../../domain/calculations/recurrenceDates';
import { recurringMapper } from '../storage/sql/mappers';
import { applyOccurrenceKeySchema } from '../storage/sql/schema';
import type { Migration } from './migrationRunner';

export const v7_recurring_occurrence_key: Migration = {
    version: 7,
    name: 'recurring_occurrence_key',
    up: async ({ db }) => {
        await db.runInTransaction(async () => {
            await applyOccurrenceKeySchema(db);

            const { rows } = await db.execute(
                'SELECT * FROM recurring_rules WHERE last_generated_index IS NULL',
            );
            for (const row of rows) {
                const rule = recurringMapper.fromRow(row);
                await db.execute(
                    'UPDATE recurring_rules SET last_generated_index = ? WHERE id = ?',
                    [deriveLastGeneratedIndex(rule), rule.id],
                );
            }
        });
    },
};
