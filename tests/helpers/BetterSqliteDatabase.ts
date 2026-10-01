/**
 * BetterSqliteDatabase (test-only)
 *
 * SqlDatabase adapter backed by better-sqlite3 (synchronous, Node-native,
 * runs under Jest). Mirrors the op-sqlite production adapter's contract so
 * repositories run on real in-memory SQLite deterministically.
 *
 * Why not op-sqlite here: op-sqlite is a native JSI module with no Node
 * bindings, so it cannot load in the jest-expo (Node) environment. SQL dialect
 * is identical (both are SQLite), so the port is honoured.
 *
 * Carries the same write guard as the production adapter (REGISTRE V-109,
 * src/data/storage/sql/writeGuard.ts), consulted unconditionally: this adapter
 * only ever runs under test. Unarmed until armWriteGuard() is called.
 */

import Database from 'better-sqlite3';
import { SqlDatabase, SqlQueryResult } from '../../src/data/storage/sql/SqlDatabase';
import { createTransactionRunner, type TransactionRunner } from '../../src/data/storage/sql/transaction';
import { createWriteGuard } from '../../src/data/storage/sql/writeGuard';

export class BetterSqliteDatabase implements SqlDatabase {
    private db: Database.Database;
    runInTransaction: TransactionRunner;
    private writeGuard = createWriteGuard(() => this.runInTransaction.isTransactionOpen());

    constructor(filename = ':memory:') {
        this.db = new Database(filename);
        this.db.pragma('foreign_keys = ON');
        this.runInTransaction = createTransactionRunner(this.execute.bind(this));
    }

    execute = async (sql: string, params: unknown[] = []): Promise<SqlQueryResult> => {
        this.writeGuard.check(sql);

        const trimmed = sql.trimStart();
        const returnsRows = /^(SELECT|PRAGMA|WITH)/i.test(trimmed);

        // Transaction-control + DDL + param-less writes go through exec()
        // (better-sqlite3 forbids preparing BEGIN/COMMIT/SAVEPOINT).
        if (params.length === 0 && !returnsRows) {
            this.db.exec(sql);
            return { rows: [], rowsAffected: 0 };
        }

        const stmt = this.db.prepare(sql);
        if (stmt.reader) {
            return { rows: stmt.all(...(params as never[])) as Record<string, unknown>[], rowsAffected: 0 };
        }
        const info = stmt.run(...(params as never[]));
        return { rows: [], rowsAffected: info.changes };
    };

    /** Start refusing writes made with no transaction open (see writeGuard.ts). */
    armWriteGuard(): void {
        this.writeGuard.arm();
    }

    /** Close the underlying connection (call in afterEach to free memory). */
    close(): void {
        this.db.close();
    }
}
