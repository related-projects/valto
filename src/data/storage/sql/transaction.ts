/**
 * Transaction Runner
 *
 * Shared `runInTransaction` implementation used by every SqlDatabase adapter.
 * Opens BEGIN -> runs work -> COMMIT; ROLLBACK + rethrow on any error.
 *
 * One transaction at a time per connection (REGISTRE V-106):
 * op-sqlite is ASYNC and runs every statement of the single shared connection
 * in the order it was issued, whichever call chain issued it. Without a lock,
 * statements of two independent units of work would interleave inside one
 * BEGIN/COMMIT and share its fate. A promise-chain lock therefore lets ONE
 * transaction run at a time: a call made while another transaction is open
 * waits until that transaction's COMMIT or ROLLBACK has settled, then runs as
 * its own top-level transaction. There are no savepoints: a call from another
 * chain can never become part of an unrelated transaction, so it can never be
 * reported as a success and then be rolled back with it. Verified by
 * transactionConcurrency.test.ts - "V-106 a: a write made by another chain
 * survives the rollback..." and transactionExclusive.test.ts - "V-106 b1",
 * "V-106 b2", "V-106 d1" and "V-106 d2".
 *
 * The lock is released on every exit path - after COMMIT or ROLLBACK has
 * settled, and also when BEGIN, COMMIT or ROLLBACK themselves throw. Verified
 * by the three control tests in transactionExclusive.test.ts ("control: BEGIN
 * throws...", "control: COMMIT throws...", "control: ROLLBACK throws...").
 *
 * The runner also reports whether a transaction is open on its connection
 * (isTransactionOpen), from the moment BEGIN is issued until COMMIT or
 * ROLLBACK has settled. The write guard reads it (REGISTRE V-109, see
 * writeGuard.ts). Verified by writeGuard.test.ts - "V-109 d1" and "control:
 * after the boot migrations, a write inside runInTransaction commits".
 */

import type { SqlQueryResult } from './SqlDatabase';

type Execute = (sql: string, params?: unknown[]) => Promise<SqlQueryResult>;

/** runInTransaction, plus whether a transaction is open on the connection. */
export interface TransactionRunner {
    <T>(work: () => Promise<T>): Promise<T>;
    /** True from the moment BEGIN is issued until COMMIT or ROLLBACK has settled. */
    isTransactionOpen(): boolean;
}

/**
 * runInTransaction was called from inside a running transaction callback.
 * Nested transactions are not supported (REGISTRE V-106).
 */
export class NestedTransactionError extends Error {
    constructor() {
        super(
            'runInTransaction was called from inside a running transaction callback. ' +
                'Nested transactions are not supported (REGISTRE V-106).',
        );
        this.name = 'NestedTransactionError';
    }
}

const ignore = () => undefined;

export function createTransactionRunner(execute: Execute): TransactionRunner {
    // Lock tail: settles once the last queued transaction has fully ended -
    // COMMIT or ROLLBACK settled, or BEGIN failed. Never rejects.
    let tail: Promise<void> = Promise.resolve();
    // True only while a callback is executing synchronously, up to its first
    // await. See the guard in runInTransaction.
    let inCallbackPrefix = false;
    // True from the moment BEGIN is issued until COMMIT or ROLLBACK has
    // settled, or BEGIN has failed. Only one transaction runs at a time, so
    // one flag is enough.
    let open = false;

    async function runExclusive<T>(work: () => Promise<T>): Promise<T> {
        open = true;
        try {
            await execute('BEGIN');
            try {
                let pending: Promise<T>;
                inCallbackPrefix = true;
                try {
                    pending = work();
                } finally {
                    inCallbackPrefix = false;
                }
                const result = await pending;
                await execute('COMMIT');
                return result;
            } catch (error) {
                // A ROLLBACK that throws propagates its own error, as before.
                await execute('ROLLBACK');
                throw error;
            }
        } finally {
            open = false;
        }
    }

    function runInTransaction<T>(work: () => Promise<T>): Promise<T> {
        // Nested calls are not supported (REGISTRE V-106). A call made while a
        // callback is still executing synchronously - before its first await -
        // can only come from inside that callback, since nothing else runs
        // until it yields, so it throws NestedTransactionError. Verified by
        // transactionConcurrency.test.ts - "V-106 e1: a runInTransaction call
        // in the callback synchronous prefix throws NestedTransactionError".
        //
        // Limit, accepted in V-106: a call made after the callback's first
        // await cannot be told apart from a call from another chain, and is
        // NOT detected. It queues behind the transaction it was made from,
        // which is waiting for it, so neither ever settles. No timeout or
        // watchdog stands in for this.
        if (inCallbackPrefix) {
            throw new NestedTransactionError();
        }
        const run = tail.then(() => runExclusive(work));
        tail = run.then(ignore, ignore);
        return run;
    }

    return Object.assign(runInTransaction, { isTransactionOpen: () => open });
}
