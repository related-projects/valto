/**
 * Transaction Concurrency & Re-entrance (Point 2 proof)
 *
 * op-sqlite is async, so two independent `runInTransaction` calls on the single
 * shared connection could otherwise overlap their BEGIN/work/COMMIT. These tests
 * use a test-driver that injects an async yield in the MIDDLE of the work to
 * force that overlap, and assert:
 *   (a) Concurrency: two independent transactions serialize — no "transaction
 *       within a transaction" error, both effects applied, the 2nd observes the
 *       1st's COMMITTED state (not an interleaved read).
 *   (b) Re-entrance: a runInTransaction nested inside an active one succeeds via
 *       SAVEPOINT, with no deadlock on the serialization mutex.
 *
 * Note: better-sqlite3 is synchronous, but the serialization mutex lives in the
 * shared transaction runner (createTransactionRunner) — the same code op-sqlite
 * uses — so this exercises the real ordering guarantee, not a sync artefact.
 */

import { BetterSqliteDatabase } from '../../../tests/helpers/BetterSqliteDatabase';

const microYield = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

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

        // Each unit: read counter → async yield → write counter+1. If the two
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

    it('(b) a re-entrant runInTransaction nests via SAVEPOINT without deadlock', async () => {
        let innerRan = false;

        await db.runInTransaction(async () => {
            await db.execute(`UPDATE ctr SET n = 10 WHERE id = 1`);
            // Nested call inside the active transaction's work — must NOT block on
            // the mutex (that would deadlock); it nests via SAVEPOINT.
            await db.runInTransaction(async () => {
                innerRan = true;
                await db.execute(`UPDATE ctr SET n = 20 WHERE id = 1`);
            });
        });

        expect(innerRan).toBe(true);
        const { rows } = await db.execute(`SELECT n FROM ctr WHERE id = 1`);
        expect(Number(rows[0].n)).toBe(20); // both writes committed together
    });

    it('(b) a failing nested transaction rolls back only to its SAVEPOINT', async () => {
        await db.runInTransaction(async () => {
            await db.execute(`UPDATE ctr SET n = 5 WHERE id = 1`);
            // Inner fails → ROLLBACK TO savepoint; outer keeps its own write.
            await db
                .runInTransaction(async () => {
                    await db.execute(`UPDATE ctr SET n = 99 WHERE id = 1`);
                    throw new Error('inner boom');
                })
                .catch(() => undefined);
        });

        const { rows } = await db.execute(`SELECT n FROM ctr WHERE id = 1`);
        expect(Number(rows[0].n)).toBe(5); // inner write rolled back, outer kept
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
        expect(Number(rows[0].n)).toBe(N); // no lost updates → fully serialized
    });
});
