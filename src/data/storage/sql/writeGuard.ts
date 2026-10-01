/**
 * Write guard (REGISTRE V-109, Owner decision 2)
 *
 * Every production SQL write runs inside runInTransaction, so the V-106 lock
 * serializes it against every other transaction: a write from one chain waits
 * for another chain's open transaction to end instead of landing inside it and
 * sharing its rollback. This guard makes a write that skips the runner fail
 * loudly in development and tests.
 *
 * Once armed, a write statement (INSERT, UPDATE, DELETE, REPLACE, CREATE,
 * ALTER, DROP) issued while no transaction is open on the connection throws
 * WriteOutsideTransactionError before it reaches the driver. Reads and
 * transaction control are never refused. It is armed after the boot
 * migrations have completed (runMigrations): they run before the UI renders
 * and write outside the runner by design. Verified by writeGuard.test.ts -
 * "V-109 d1", "V-109 d2", "control: the boot migrations write outside the
 * runner and complete", "control: before the boot migrations have
 * completed..." and "control: after the boot migrations, a read with no
 * transaction open is allowed".
 *
 * Limit: the guard detects a write made when no transaction is open. It
 * cannot tell a write made from inside the open transaction from one made by
 * another chain while that transaction is open - the case V-109 is about.
 * That case is prevented by routing every write through the runner, not
 * detected here. Verified by writeGuard.test.ts - "control (limit): a write
 * from another chain while a transaction is open is not refused...".
 *
 * Development and tests only: OpSQLiteDatabase consults it under `if
 * (__DEV__)`, which a release build compiles to `if (false)`. Verified by
 * writeGuard.test.ts - "V-109 e (control): with __DEV__ false, the same write
 * with no transaction open is not refused".
 */

const WRITE_STATEMENT = /^\s*(INSERT|UPDATE|DELETE|REPLACE|CREATE|ALTER|DROP)\b/i;

/** A SQL write was issued while no transaction was open on the connection. */
export class WriteOutsideTransactionError extends Error {
    constructor(readonly sql: string) {
        super(
            'SQL write issued with no transaction open (REGISTRE V-109). Every write must run ' +
                `inside runInTransaction: ${sql.trim().split('\n')[0]}`,
        );
        this.name = 'WriteOutsideTransactionError';
    }
}

/** True for a statement that changes the database. */
export function isWriteStatement(sql: string): boolean {
    return WRITE_STATEMENT.test(sql);
}

export interface WriteGuard {
    /** Start refusing writes made with no transaction open. */
    arm(): void;
    /** Throw WriteOutsideTransactionError if `sql` is such a write. */
    check(sql: string): void;
}

export function createWriteGuard(isTransactionOpen: () => boolean): WriteGuard {
    let armed = false;
    return {
        arm() {
            armed = true;
        },
        check(sql: string) {
            if (armed && !isTransactionOpen() && isWriteStatement(sql)) {
                throw new WriteOutsideTransactionError(sql);
            }
        },
    };
}
