/**
 * GatedDatabase (test-only)
 *
 * Holds the first statement matching `pattern` until release() is called, so
 * the transaction that issued it stays open deterministically while another
 * chain runs. Everything else, transaction control included, goes straight to
 * the inner connection, whose runner is reused so every chain shares one lock.
 *
 * The same technique as the GatedDatabase in restoreConcurrentSave.test.ts,
 * with the pattern as a parameter.
 */

import type { SqlDatabase, SqlQueryResult } from '../../src/data/storage/sql/SqlDatabase';

export class GatedDatabase implements SqlDatabase {
    runInTransaction: <T>(work: () => Promise<T>) => Promise<T>;
    /** Settles when the gated statement has been issued and is being held. */
    readonly reached: Promise<void>;
    private markReached!: () => void;
    private releaseGate!: () => void;
    private readonly gate: Promise<void>;
    private armed = true;

    constructor(
        private inner: SqlDatabase,
        private pattern: RegExp,
    ) {
        this.runInTransaction = inner.runInTransaction.bind(inner);
        this.reached = new Promise<void>((resolve) => {
            this.markReached = resolve;
        });
        this.gate = new Promise<void>((resolve) => {
            this.releaseGate = resolve;
        });
    }

    execute = async (sql: string, params: unknown[] = []): Promise<SqlQueryResult> => {
        if (this.armed && this.pattern.test(sql)) {
            this.armed = false;
            this.markReached();
            await this.gate;
        }
        return this.inner.execute(sql, params);
    };

    release(): void {
        this.releaseGate();
    }
}
