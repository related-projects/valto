/**
 * OpSQLiteDatabase (production)
 *
 * SqlDatabase adapter backed by op-sqlite with SQLCipher encryption at rest.
 * op-sqlite is a native JSI module: it is `require`d lazily (inside create())
 * so merely importing this file never touches native code - keeping the module
 * loadable in the Jest/Node environment where it would otherwise crash.
 *
 * Requires an Expo development build (not Expo Go). See DEV_BUILD.md.
 */

import { getOrCreateEncryptionKey } from './encryptionKey';
import { SqlDatabase, SqlQueryResult } from './SqlDatabase';
import { createTransactionRunner, type TransactionRunner } from './transaction';
import { createWriteGuard } from './writeGuard';

export const DB_NAME = 'valto.db';

export class OpSQLiteDatabase implements SqlDatabase {
    private db: any;
    runInTransaction: TransactionRunner;
    private writeGuard = createWriteGuard(() => this.runInTransaction.isTransactionOpen());

    private constructor(db: any) {
        this.db = db;
        this.runInTransaction = createTransactionRunner(this.execute);
    }

    /** Open the encrypted database, resolving the key from the secure keystore. */
    static async create(): Promise<OpSQLiteDatabase> {
        // Lazy native require - never evaluated under Jest.
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { open } = require('@op-engineering/op-sqlite');
        const encryptionKey = await getOrCreateEncryptionKey();
        // The keystore key is passed to open() here - this is what actually
        // encrypts the file. The `sqlcipher: true` flag in package.json only
        // builds the SQLCipher-enabled binary; without this key the DB is plain.
        const db = open({ name: DB_NAME, encryptionKey });
        const instance = new OpSQLiteDatabase(db);
        await instance.assertEncrypted();
        return instance;
    }

    /**
     * Fail-fast boot guard: prove SQLCipher is actually active on this handle.
     * In a SQLCipher build `PRAGMA cipher_version` returns the cipher version;
     * on a plain SQLite binary it returns NOTHING. An empty result therefore
     * means the file is being written UNENCRYPTED - we refuse to continue
     * rather than silently persist financial data in clear text.
     */
    private async assertEncrypted(): Promise<void> {
        const { rows } = await this.execute('PRAGMA cipher_version;');
        const version = rows[0]?.cipher_version;
        if (!version) {
            throw new Error(
                'SQLCipher is NOT active (PRAGMA cipher_version is empty): the ' +
                    'database would be stored UNENCRYPTED. Aborting boot.',
            );
        }
    }

    execute = async (sql: string, params: unknown[] = []): Promise<SqlQueryResult> => {
        // Development and tests only (REGISTRE V-109, Owner decision 2). A
        // release build bundles with __DEV__ = false and Metro inlines it, so
        // this block compiles to `if (false)` and users never reach the guard.
        // Verified by writeGuard.test.ts - "V-109 d1" and "V-109 e (control):
        // with __DEV__ false, the same write with no transaction open is not
        // refused".
        if (__DEV__) {
            this.writeGuard.check(sql);
        }
        const res = await this.db.execute(sql, params);
        // op-sqlite has returned rows as either `rows._array` or `rows` across
        // versions - normalise both shapes.
        const rows = (res?.rows?._array ?? res?.rows ?? []) as Record<string, unknown>[];
        return { rows, rowsAffected: res?.rowsAffected ?? 0 };
    };

    /** Arm the write guard (see writeGuard.ts). Called once the boot migrations have completed. */
    armWriteGuard(): void {
        this.writeGuard.arm();
    }

    /** Absolute on-disk path of `valto.db`, as reported by the native driver. */
    getDbPath(): string | null {
        try {
            return this.db.getDbPath?.() ?? null;
        } catch {
            return null;
        }
    }

    /** Close the native handle to release file locks before file-level deletion. */
    close(): void {
        try {
            this.db.close?.();
        } catch {
            // Best-effort: a corrupted/half-open handle may throw on close.
        }
    }
}
