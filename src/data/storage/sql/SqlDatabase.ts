/**
 * SqlDatabase Port
 *
 * Data-layer abstraction over a SQLite connection. Decouples repositories
 * from the concrete driver so the same code runs on:
 *  - op-sqlite + SQLCipher in the app (encrypted at rest, native build), and
 *  - better-sqlite3 in-memory under Jest (deterministic, no native bindings).
 *
 * The transaction boundary lives HERE: `runInTransaction` is the single
 * primitive that guarantees atomicity (BEGIN → work → COMMIT, ROLLBACK on
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
     * Re-entrant: nested calls use SAVEPOINTs so a transactional use case
     * invoked inside another transaction stays safe.
     */
    runInTransaction<T>(work: () => Promise<T>): Promise<T>;

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
