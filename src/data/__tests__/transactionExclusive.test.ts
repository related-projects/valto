/**
 * V-106: one transaction at a time per connection.
 *
 * The runner used to let a call that arrived while another chain's transaction
 * was open run as a SAVEPOINT inside it: reported as a success, and gone if
 * that transaction then rolled back. These tests drive the interleavings with
 * explicit gates on real SQLite (better-sqlite3), so each order is
 * deterministic:
 *   b1/b2  a call made while a transaction is open settles only after that
 *          transaction's COMMIT or ROLLBACK has settled, and runs as its own
 *          top-level transaction;
 *   d1     two chains never produce "no such savepoint";
 *   d2     one chain's rollback never undoes another chain's work.
 *
 * The three control tests (not regression tests) pin that the lock is released
 * when BEGIN, COMMIT or ROLLBACK themselves throw. They pass on the unfixed
 * runner as well.
 */

import { BetterSqliteDatabase } from '../../../tests/helpers/BetterSqliteDatabase';
import type { SqlQueryResult } from '../storage/sql/SqlDatabase';
import { createTransactionRunner } from '../storage/sql/transaction';

const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

function deferred(): { promise: Promise<void>; resolve: () => void } {
    let resolve!: () => void;
    const promise = new Promise<void>((r) => {
        resolve = r;
    });
    return { promise, resolve };
}

/** Collapse whitespace so log entries compare as plain strings. */
const normalise = (sql: string) => sql.replace(/\s+/g, ' ').trim();

interface Harness {
    db: BetterSqliteDatabase;
    /** Every statement that settled successfully, in order, plus test markers. */
    log: string[];
    execute: (sql: string, params?: unknown[]) => Promise<SqlQueryResult>;
    run: <T>(work: () => Promise<T>) => Promise<T>;
    /** Make the next statement equal to `sql` throw (once). */
    failNext: (sql: string, mode: 'before' | 'after') => void;
    rows: () => Promise<string[]>;
}

async function harness(): Promise<Harness> {
    const db = new BetterSqliteDatabase();
    await db.execute('CREATE TABLE t (who TEXT PRIMARY KEY NOT NULL)');

    const log: string[] = [];
    let fault: { sql: string; mode: 'before' | 'after' } | null = null;

    const execute = async (sql: string, params: unknown[] = []): Promise<SqlQueryResult> => {
        const statement = normalise(sql);
        if (fault && fault.sql === statement && fault.mode === 'before') {
            fault = null;
            throw new Error(`Injected ${statement} failure`);
        }
        const result = await db.execute(sql, params);
        if (fault && fault.sql === statement && fault.mode === 'after') {
            fault = null;
            throw new Error(`Injected ${statement} failure`);
        }
        log.push(statement);
        return result;
    };

    return {
        db,
        log,
        execute,
        run: createTransactionRunner(execute),
        failNext: (sql, mode) => {
            fault = { sql, mode };
        },
        rows: async () => {
            const { rows } = await db.execute('SELECT who FROM t ORDER BY who');
            return rows.map((r) => String(r.who));
        },
    };
}

const insert = (who: string) => `INSERT INTO t (who) VALUES ('${who}')`;

describe('V-106 b. ordering: a call made while a transaction is open waits for it to end', () => {
    it('V-106 b1: B settles only after A COMMIT has settled, and runs as its own transaction', async () => {
        const h = await harness();
        const holdA = deferred();

        const a = h.run(async () => {
            await h.execute(insert('a'));
            await holdA.promise;
        });
        await flush();

        const b = h.run(async () => {
            await h.execute(insert('b'));
        });
        const bSettled = b.then(
            () => h.log.push('B settled'),
            () => h.log.push('B settled'),
        );
        await flush();

        holdA.resolve();
        await Promise.allSettled([a, b]);
        await bSettled;

        expect(h.log.indexOf('B settled')).toBeGreaterThan(h.log.indexOf('COMMIT'));
        // B began after A's COMMIT had settled - its own top-level transaction,
        // never a SAVEPOINT inside A.
        expect(h.log.filter((s) => s === 'BEGIN')).toHaveLength(2);
        expect(h.log.lastIndexOf('BEGIN')).toBeGreaterThan(h.log.indexOf('COMMIT'));
        expect(h.log.some((s) => s.startsWith('SAVEPOINT'))).toBe(false);
        expect(await h.rows()).toEqual(['a', 'b']);
        h.db.close();
    });

    it('V-106 b2: B settles only after A ROLLBACK has settled, and runs as its own transaction', async () => {
        const h = await harness();
        const holdA = deferred();

        const a = h.run(async () => {
            await h.execute(insert('a'));
            await holdA.promise;
            throw new Error('A fails');
        });
        await flush();

        const b = h.run(async () => {
            await h.execute(insert('b'));
        });
        const bSettled = b.then(
            () => h.log.push('B settled'),
            () => h.log.push('B settled'),
        );
        await flush();

        holdA.resolve();
        await Promise.allSettled([a, b]);
        await bSettled;

        expect(h.log.indexOf('B settled')).toBeGreaterThan(h.log.indexOf('ROLLBACK'));
        expect(h.log.filter((s) => s === 'BEGIN')).toHaveLength(2);
        expect(h.log.lastIndexOf('BEGIN')).toBeGreaterThan(h.log.indexOf('ROLLBACK'));
        expect(h.log.some((s) => s.startsWith('SAVEPOINT'))).toBe(false);
        expect(await h.rows()).toEqual(['b']);
        h.db.close();
    });
});

describe('V-106 d. two concurrent chains never interfere', () => {
    it('V-106 d1: a chain still running when another commits never gets "no such savepoint"', async () => {
        const h = await harness();
        const holdA = deferred();
        const holdB = deferred();

        const a = h.run(async () => {
            await h.execute(insert('a'));
            await holdA.promise;
        });
        await flush();

        const b = h.run(async () => {
            await h.execute(insert('b1'));
            await holdB.promise;
            await h.execute(insert('b2'));
        });
        await flush();

        holdA.resolve();
        await Promise.allSettled([a]);
        holdB.resolve();
        const [bOutcome] = await Promise.allSettled([b]);

        expect(bOutcome).toEqual({ status: 'fulfilled', value: undefined });
        expect(await h.rows()).toEqual(['a', 'b1', 'b2']);
        h.db.close();
    });

    it('V-106 d2: one chain rolling back never undoes the work of another chain', async () => {
        const h = await harness();
        const holdA = deferred();
        const holdX = deferred();

        const a = h.run(async () => {
            await h.execute(insert('a'));
            await holdA.promise;
        });
        await flush();

        // X and Y arrive in the same tick while A is open.
        const x = h.run(async () => {
            await h.execute(insert('x'));
            await holdX.promise;
            throw new Error('X fails');
        });
        const y = h.run(async () => {
            await h.execute(insert('y'));
        });
        // Observed from the start, so X's rejection is handled whenever it lands.
        const outcomes = Promise.allSettled([a, x, y]);
        await flush();

        holdX.resolve();
        await flush();
        holdA.resolve();
        const [aOutcome, xOutcome, yOutcome] = await outcomes;

        expect(aOutcome.status).toBe('fulfilled');
        expect(xOutcome.status).toBe('rejected');
        expect(yOutcome.status).toBe('fulfilled');
        // X rolled back only itself: A and Y are both in the ledger.
        expect(await h.rows()).toEqual(['a', 'y']);
        h.db.close();
    });
});

describe('V-106 control: the lock is released when the runner own statements throw', () => {
    it('control: BEGIN throws - the call rejects and the next call runs as its own transaction', async () => {
        const h = await harness();
        h.failNext('BEGIN', 'before');

        const first = h.run(async () => {
            await h.execute(insert('never'));
        });
        const second = h.run(async () => {
            await h.execute(insert('second'));
        });
        const [firstOutcome, secondOutcome] = await Promise.allSettled([first, second]);

        expect(firstOutcome.status).toBe('rejected');
        expect(secondOutcome.status).toBe('fulfilled');
        expect(await h.rows()).toEqual(['second']);
        h.db.close();
    });

    it('control: COMMIT throws - the runner rolls back and the next call runs as its own transaction', async () => {
        const h = await harness();
        h.failNext('COMMIT', 'before');

        const first = h.run(async () => {
            await h.execute(insert('first'));
        });
        const second = h.run(async () => {
            await h.execute(insert('second'));
        });
        const [firstOutcome, secondOutcome] = await Promise.allSettled([first, second]);

        expect(firstOutcome.status).toBe('rejected');
        expect(secondOutcome.status).toBe('fulfilled');
        expect(await h.rows()).toEqual(['second']);
        h.db.close();
    });

    it('control: ROLLBACK throws after rolling back - the next call runs as its own transaction', async () => {
        const h = await harness();
        h.failNext('ROLLBACK', 'after');

        const first = h.run(async () => {
            await h.execute(insert('first'));
            throw new Error('work fails');
        });
        const second = h.run(async () => {
            await h.execute(insert('second'));
        });
        const [firstOutcome, secondOutcome] = await Promise.allSettled([first, second]);

        expect(firstOutcome.status).toBe('rejected');
        expect(secondOutcome.status).toBe('fulfilled');
        expect(await h.rows()).toEqual(['second']);
        h.db.close();
    });
});
