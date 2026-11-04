/**
 * EverChangingRuleDatabase (test-only)
 *
 * While `enabled`, every read of one rule by id returns another amount, so the
 * stored rule never matches the copy the engine is processing and the engine
 * hits its restart limit (REGISTRE V-115, MAX_RULE_RESTARTS): the rule is
 * reported in the run's errors and nothing is written for it. The same forcing
 * as EverChangingRecurringRepository in recurringStaleEngineCopy.test.ts, made
 * at the connection so the app's own container and repositories can run on it.
 *
 * Only the by-id read of that rule is changed (sqlGetById in mappers.ts); the
 * list read the screens use is not. Everything else, transaction control
 * included, goes straight to the inner connection, whose runner is reused.
 */

import type { SqlDatabase, SqlQueryResult } from '../../src/data/storage/sql/SqlDatabase';

const BY_ID = /^\s*SELECT \* FROM recurring_rules WHERE id = \?/i;

export class EverChangingRuleDatabase implements SqlDatabase {
    runInTransaction: <T>(work: () => Promise<T>) => Promise<T>;
    /** The rule whose by-id reads are changed. */
    ruleId: string | null = null;
    /** Whether its reads are changed right now. */
    enabled = false;
    /** By-id reads of the rule changed so far. */
    changedReads = 0;

    constructor(private inner: SqlDatabase) {
        this.runInTransaction = inner.runInTransaction.bind(inner);
    }

    execute = async (sql: string, params: unknown[] = []): Promise<SqlQueryResult> => {
        const result = await this.inner.execute(sql, params);
        if (!this.enabled || this.ruleId === null || !BY_ID.test(sql) || params[0] !== this.ruleId) {
            return result;
        }
        this.changedReads++;
        const rows = result.rows.map((row) => ({ ...row, amount: Number(row.amount) + this.changedReads }));
        return { ...result, rows };
    };

    armWriteGuard(): void {
        this.inner.armWriteGuard?.();
    }
}
