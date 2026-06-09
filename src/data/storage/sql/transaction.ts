/**
 * Transaction Runner
 *
 * Shared `runInTransaction` implementation used by every SqlDatabase adapter.
 * Opens BEGIN → runs work → COMMIT; ROLLBACK + rethrow on any error. Nested
 * calls degrade to SAVEPOINTs so a transactional use case invoked inside an
 * outer transaction is still atomic (and never issues an illegal nested BEGIN).
 *
 * Concurrency on an async connection:
 * better-sqlite3 is synchronous, so two `runInTransaction` calls can never
 * interleave there. op-sqlite is ASYNC, so without serialization two
 * independent top-level transactions on the single shared connection could
 * overlap — the second BEGIN would hit "cannot start a transaction within a
 * transaction", or worse, silently couple two unrelated units of work into one
 * commit/rollback. A promise-chain mutex forces ONE top-level transaction to
 * run to completion before the next starts.
 *
 * Re-entrance stays cheap: a `runInTransaction` issued from inside an active
 * transaction's `work()` (same flow) sees `depth > 0` and nests via SAVEPOINT
 * WITHOUT taking the mutex — taking it would deadlock the flow against its own
 * outer transaction. Because the mutex is awaited BEFORE `depth` is set, two
 * independent top-level calls issued in the same tick both observe `depth === 0`
 * and serialize, rather than one wrongly nesting into the other.
 */

import type { SqlQueryResult } from './SqlDatabase';

type Execute = (sql: string, params?: unknown[]) => Promise<SqlQueryResult>;

export function createTransactionRunner(execute: Execute) {
    // Nesting depth of the CURRENTLY-RUNNING top-level transaction. 0 between
    // transactions; set to 1 only after the mutex has been acquired.
    let depth = 0;
    // Mutex tail: each top-level transaction chains behind the previous one.
    let tail: Promise<unknown> = Promise.resolve();

    async function runSavepoint<T>(work: () => Promise<T>): Promise<T> {
        const name = `sp_${depth}`;
        await execute(`SAVEPOINT ${name}`);
        depth++;
        try {
            const result = await work();
            await execute(`RELEASE ${name}`);
            depth--;
            return result;
        } catch (error) {
            try {
                await execute(`ROLLBACK TO ${name}`);
                await execute(`RELEASE ${name}`);
            } finally {
                depth--;
            }
            throw error;
        }
    }

    async function runTopLevel<T>(work: () => Promise<T>): Promise<T> {
        await execute('BEGIN');
        depth = 1;
        try {
            const result = await work();
            await execute('COMMIT');
            depth = 0;
            return result;
        } catch (error) {
            try {
                await execute('ROLLBACK');
            } finally {
                depth = 0;
            }
            throw error;
        }
    }

    return function runInTransaction<T>(work: () => Promise<T>): Promise<T> {
        // Re-entrant: already inside the active top-level transaction's work.
        // Nest via SAVEPOINT and never wait on the mutex (that would deadlock
        // the flow against its own outer transaction).
        if (depth > 0) {
            return runSavepoint(work);
        }
        // Top-level: queue behind any in-flight top-level transaction. `depth`
        // stays 0 until the prior transaction fully drains, so concurrent
        // top-level calls serialize instead of colliding on BEGIN.
        const result = tail.then(() => runTopLevel(work));
        // Keep the chain alive even if this transaction rejects.
        tail = result.then(
            () => undefined,
            () => undefined,
        );
        return result;
    };
}
