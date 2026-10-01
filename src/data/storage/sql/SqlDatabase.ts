/**
 * SqlDatabase Port
 *
 * Data-layer abstraction over a SQLite connection. Decouples repositories
 * from the concrete driver so the same code runs on:
 *  - op-sqlite + SQLCipher in the app (encrypted at rest, native build), and
 *  - better-sqlite3 in-memory under Jest (deterministic, no native bindings).
 *
 * The transaction boundary lives HERE: `runInTransaction` is the single
 * primitive that guarantees atomicity (BEGIN -> work -> COMMIT, ROLLBACK on
 * any throw). Because the DI container injects ONE shared SqlDatabase into
 * every repository, a use case can wrap several repo calls in a single
 * `runInTransaction` and have them commit all-or-nothing.
 */

/** Normalised result of a single SQL statement. */
export interface SqlQueryResult {
    /** Rows returned by a SELECT (empty for writes). */
    rows: Record<string, unknown>[];
    /** Number of rows inserted/updated/deleted (0 for SELECT). */
    rowsAffected: number;
}

export interface SqlDatabase {
    /**
     * Execute a single SQL statement with positional `?` parameters.
     */
    execute(sql: string, params?: unknown[]): Promise<SqlQueryResult>;

    /**
     * Run `work` inside a single atomic transaction.
     * COMMIT if it resolves, ROLLBACK (and rethrow) if it throws.
     *
     * One transaction at a time per connection (REGISTRE V-106): a call made
     * while another transaction is open waits until that transaction's COMMIT
     * or ROLLBACK has settled, then runs as its own top-level transaction.
     * Nested calls are not supported: one made in the callback's synchronous
     * prefix throws NestedTransactionError; one made after an await is not
     * detected and never settles. See transaction.ts, verified by
     * transactionExclusive.test.ts - "V-106 b1", "V-106 b2" - and
     * transactionConcurrency.test.ts - "V-106 e1".
     */
    runInTransaction<T>(work: () => Promise<T>): Promise<T>;

    /**
     * Start refusing SQL writes made with no transaction open, in development
     * and tests (REGISTRE V-109, see writeGuard.ts). Called once the boot
     * migrations have completed. Verified by writeGuard.test.ts - "V-109 d1".
     */
    armWriteGuard?(): void;

    /**
     * Absolute on-disk path of the backing database file, when the driver can
     * report it (op-sqlite). Returns null for drivers with no file (in-memory
     * test DB). Used by the corrupted-store recovery path to delete the file.
     */
    getDbPath?(): string | null;

    /**
     * Release the underlying native handle / file locks, if the driver has one.
     * No-op for drivers that don't need it. Used before deleting the DB file
     * during corrupted-store recovery.
     */
    close?(): void;
}
