/**
 * FaultInjectingDatabase (test-only)
 *
 * Decorator over a real SqlDatabase that throws on a chosen data statement to
 * simulate a mid-transaction failure (e.g. the 2nd write of a transfer). Used
 * by the rollback-injection test to prove atomicity.
 *
 * Transaction control (BEGIN/COMMIT/ROLLBACK/SAVEPOINT) is delegated to the
 * inner database unchanged, so the injected throw propagates out of `work()`
 * and triggers a real ROLLBACK on the same connection.
 */

import { SqlDatabase, SqlQueryResult } from '../../src/data/storage/sql/SqlDatabase';

type FailPredicate = (sql: string, matchIndex: number) => boolean;

export class FaultInjectingDatabase implements SqlDatabase {
    runInTransaction: <T>(work: () => Promise<T>) => Promise<T>;
    private matchCount = 0;

    constructor(
        private inner: SqlDatabase,
        private shouldFail: FailPredicate,
        private message = 'Injected write failure',
    ) {
        // Reuse the inner connection's transaction runner so BEGIN/COMMIT and
        // the ROLLBACK triggered by our throw all act on the same connection.
        this.runInTransaction = inner.runInTransaction.bind(inner);
    }

    execute = async (sql: string, params: unknown[] = []): Promise<SqlQueryResult> => {
        // Only count data statements, not transaction control.
        if (!/^\s*(BEGIN|COMMIT|ROLLBACK|SAVEPOINT|RELEASE)/i.test(sql)) {
            this.matchCount++;
            if (this.shouldFail(sql, this.matchCount)) {
                throw new Error(this.message);
            }
        }
        return this.inner.execute(sql, params);
    };

    /** Fail the Nth (1-based) statement whose SQL matches `pattern`. */
    static failOnNthMatch(
        inner: SqlDatabase,
        pattern: RegExp,
        occurrence: number,
    ): FaultInjectingDatabase {
        let seen = 0;
        return new FaultInjectingDatabase(inner, (sql) => {
            if (pattern.test(sql)) {
                seen++;
                return seen === occurrence;
            }
            return false;
        });
    }
}
