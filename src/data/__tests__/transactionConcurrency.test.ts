/**
 * Transaction Concurrency & Re-entrance (Point 2 proof)
 *
 * op-sqlite is async, so two independent `runInTransaction` calls on the single
 * shared connection could otherwise overlap their BEGIN/work/COMMIT. These tests
 * use a test-driver that injects an async yield in the MIDDLE of the work to
 * force that overlap, and assert:
 *   (a) Concurrency: two independent transactions serialize - no "transaction
 *       within a transaction" error, both effects applied, the 2nd observes the
 *       1st's COMMITTED state (not an interleaved read).
 *   (b) No nesting (REGISTRE V-106): a runInTransaction call made from inside a
 *       callback's synchronous prefix is refused with NestedTransactionError,
 *       and a call from another chain never joins the open transaction, so its
 *       write survives that transaction's rollback. The two tests that pinned
 *       the old SAVEPOINT nesting were replaced by these.
 *
 * Note: better-sqlite3 is synchronous, but the serialization mutex lives in the
 * shared transaction runner (createTransactionRunner) - the same code op-sqlite
 * uses - so this exercises the real ordering guarantee, not a sync artefact.
 */

import { BetterSqliteDatabase } from '../../../tests/helpers/BetterSqliteDatabase';
import { NestedTransactionError } from '../storage/sql/transaction';

const microYield = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

function deferred(): { promise: Promise<void>; resolve: () => void } {
    let resolve!: () => void;
    const promise = new Promise<void>((r) => {
        resolve = r;
    });
    return { promise, resolve };
}

describe('runInTransaction concurrency & re-entrance', () => {
    let db: BetterSqliteDatabase;

    beforeEach(async () => {
        db = new BetterSqliteDatabase();
        await db.execute(`CREATE TABLE ctr (id INTEGER PRIMARY KEY, n INTEGER NOT NULL)`);
        await db.execute(`INSERT INTO ctr (id, n) VALUES (1, 0)`);
    });

    afterEach(() => db.close());

    it('(a) serializes two independent transactions that yield mid-work', async () => {
        const observed: number[] = [];

        // Each unit: read counter -> async yield -> write counter+1. If the two
        // overlapped, both would read 0 (interleaved) and/or the 2nd BEGIN would
        // throw "cannot start a transaction within a transaction".
        const bump = () =>
            db.runInTransaction(async () => {
                const { rows } = await db.execute(`SELECT n FROM ctr WHERE id = 1`);
                const current = Number(rows[0].n);
                observed.push(current);
                await microYield();
                await db.execute(`UPDATE ctr SET n = ? WHERE id = 1`, [current + 1]);
            });

        await expect(Promise.all([bump(), bump()])).resolves.toBeDefined();

        const { rows } = await db.execute(`SELECT n FROM ctr WHERE id = 1`);
        expect(Number(rows[0].n)).toBe(2); // both effects applied
        expect(observed).toEqual([0, 1]); // 2nd saw the 1st's committed state
    });

    it('V-106 e1: a runInTransaction call in the callback synchronous prefix throws NestedTransactionError', async () => {
        let innerRan = false;

        // The nested call is evaluated before the callback's first await, so it
        // runs while the callback is still executing synchronously.
        const outer = db.runInTransaction(async () => {
            await db.runInTransaction(async () => {
                innerRan = true;
                await db.execute(`UPDATE ctr SET n = 20 WHERE id = 1`);
            });
        });
        const [outcome] = await Promise.allSettled([outer]);

        expect(outcome.status).toBe('rejected');
        const reason = (outcome as PromiseRejectedResult).reason;
        expect(reason).toBeInstanceOf(NestedTransactionError);
        expect(reason.message).toMatch(/inside a running transaction callback/);
        expect(innerRan).toBe(false);

        // Nothing was written, and the connection is free for the next transaction.
        const before = await db.execute(`SELECT n FROM ctr WHERE id = 1`);
        expect(Number(before.rows[0].n)).toBe(0);
        await db.runInTransaction(async () => {
            await db.execute(`UPDATE ctr SET n = 1 WHERE id = 1`);
        });
        const after = await db.execute(`SELECT n FROM ctr WHERE id = 1`);
        expect(Number(after.rows[0].n)).toBe(1);
    });

    it('V-106 a: a write made by another chain survives the rollback of the transaction that was open when it was made', async () => {
        const holdA = deferred();

        // A is open (BEGIN resolved, its UPDATE done) and waits on the gate.
        const a = db.runInTransaction(async () => {
            await db.execute(`UPDATE ctr SET n = 5 WHERE id = 1`);
            await holdA.promise;
            throw new Error('A fails');
        });
        await microYield();

        // B is an unrelated chain that calls the runner while A is open.
        const b = db.runInTransaction(async () => {
            await db.execute(`INSERT INTO ctr (id, n) VALUES (2, 7)`);
        });
        await microYield();

        holdA.resolve();
        const [aOutcome, bOutcome] = await Promise.allSettled([a, b]);

        expect(aOutcome.status).toBe('rejected');
        expect(bOutcome.status).toBe('fulfilled');
        const { rows } = await db.execute(`SELECT id, n FROM ctr ORDER BY id`);
        // A rolled back its own UPDATE; B's row is still there.
        expect(rows).toEqual([
            { id: 1, n: 0 },
            { id: 2, n: 7 },
        ]);
    });

    it('runs many concurrent transactions without collision', async () => {
        const N = 25;
        const bump = () =>
            db.runInTransaction(async () => {
                const { rows } = await db.execute(`SELECT n FROM ctr WHERE id = 1`);
                const current = Number(rows[0].n);
                await microYield();
                await db.execute(`UPDATE ctr SET n = ? WHERE id = 1`, [current + 1]);
            });

        await Promise.all(Array.from({ length: N }, bump));

        const { rows } = await db.execute(`SELECT n FROM ctr WHERE id = 1`);
        expect(Number(rows[0].n)).toBe(N); // no lost updates -> fully serialized
    });
});
