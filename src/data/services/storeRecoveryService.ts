/**
 * Store Recovery Service
 *
 * Filesystem-level recovery for an unreadable encrypted database.
 *
 * Unlike `resetService.resetAppData()` — which clears tables via a WORKING
 * `getDb()` connection — this path assumes the store is corrupted/undecryptable
 * and the connection cannot be trusted. It therefore deletes the database file
 * (and its WAL/SHM siblings) directly on disk, then clears the AsyncStorage
 * pointers (schema version + seed flag) so the subsequent boot rebuilds a fresh
 * encrypted DB from scratch. The keystore encryption key is intentionally kept —
 * the file is the problem, not the key.
 *
 * Re-initialisation (migrations + seed) is NOT done here: the caller re-runs the
 * normal boot sequence, keeping a single init path.
 */

import { Platform } from 'react-native';
// Modern file API: the `File` constructor takes a `file://` URI (native
// `validatePath()` requires `url.isFileURL`; the legacy `deleteAsync` re-normalised
// the URI and injected a spurious `/..`, triggering ERR_FILE_NOT_WRITABLE).
import { File } from 'expo-file-system';

import { asyncStorageAdapter, StorageKeys } from '../storage';
import { closeDatabase, getDb } from '../storage/sql/database';
import { DB_NAME } from '../storage/sql/OpSQLiteDatabase';

/** Drop a single trailing `/` (so joins never produce a double separator). */
function stripTrailingSlash(p: string): string {
    return p.endsWith('/') ? p.slice(0, -1) : p;
}

/**
 * Resolve the DIRECTORY that contains `valto.db`.
 *
 * op-sqlite's `getDbPath()` (no arg) returns the FULL FILE PATH `<base>/valto.db`
 * (verified against the native source), but older/other backends may hand back a
 * bare directory — so this handles BOTH shapes rather than assuming one. The base
 * dir differs by platform: iOS defaults to the Library directory (NOT Documents),
 * Android to the databases directory. The native module is required lazily so
 * importing this file never touches native code under Jest.
 */
function resolveDbDirectory(): string {
    try {
        const raw = getDb().getDbPath?.();
        if (raw) {
            const normalised = stripTrailingSlash(raw);
            // Full file path (".../valto.db") → strip the "/valto.db" suffix.
            if (normalised.endsWith(`/${DB_NAME}`)) {
                return stripTrailingSlash(normalised.slice(0, -(DB_NAME.length + 1)));
            }
            // Already a directory.
            return normalised;
        }
    } catch {
        // No live handle (init threw / already closed) — fall through.
    }
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { IOS_LIBRARY_PATH, ANDROID_DATABASE_PATH } = require('@op-engineering/op-sqlite');
    return stripTrailingSlash(Platform.OS === 'ios' ? IOS_LIBRARY_PATH : ANDROID_DATABASE_PATH);
}

/** The DB file plus the SQLite WAL/SHM sidecar file names. */
function dbFileNames(): string[] {
    return [DB_NAME, `${DB_NAME}-wal`, `${DB_NAME}-shm`];
}

/**
 * Build the absolute on-disk paths to delete, joining the directory and each file
 * name with a SINGLE separator. Each target is validated to actually point at a
 * `valto.db[-wal|-shm]` file — never a directory and never a `/..` traversal — so
 * a bad path resolution aborts instead of deleting the wrong thing.
 */
function buildTargetPaths(dir: string): string[] {
    const directory = stripTrailingSlash(dir);
    return dbFileNames().map((name) => {
        const target = `${directory}/${name}`;
        const valid =
            target.endsWith(`/${name}`) &&
            !target.includes('/..') &&
            target !== directory;
        if (!valid) {
            throw new Error(
                `[storeRecovery] refusing to delete unexpected path: ${target}`,
            );
        }
        return target;
    });
}

/** Prefix an absolute path with the `file://` scheme the `File` constructor wants. */
function toFileUri(absolutePath: string): string {
    return absolutePath.startsWith('file://') ? absolutePath : `file://${absolutePath}`;
}

/**
 * Delete `valto.db` and its `-wal` / `-shm` siblings from disk.
 * Idempotent — missing files are skipped via the `exists` guard.
 */
export async function deleteDatabaseFiles(dir?: string): Promise<void> {
    const directory = dir ?? resolveDbDirectory();
    const targets = buildTargetPaths(directory);

    // Empirical evidence: surface the REAL resolved base + targets so the
    // on-device paths are visible when debugging a failed reset.
    if (__DEV__) {
        console.log('[storeRecovery] base=', directory, 'targets=', targets);
    }

    for (const target of targets) {
        const file = new File(toFileUri(target));
        // Confirm the constructed File URI carries no spurious `/..` (the
        // legacy-API regression this fix replaces).
        if (__DEV__) {
            console.log('[storeRecovery] deleting file=', file.uri);
        }
        if (file.exists) {
            file.delete();
        }
    }
}

/**
 * Recover from an unreadable store: close the handle, delete the DB files, and
 * clear the AsyncStorage pointers that would otherwise make a re-init skip
 * migrations/seed against the now-empty file. Does NOT re-initialise — the
 * caller re-runs the boot sequence afterwards.
 *
 * Callers MUST require explicit user confirmation before invoking this: it
 * permanently erases all local financial data and there is no backend backup.
 */
export async function resetCorruptedStore(): Promise<void> {
    // Resolve the on-disk path while the (corrupted-but-open) handle is still
    // alive, THEN close it to release native file locks before deletion.
    const directory = resolveDbDirectory();
    closeDatabase();

    await deleteDatabaseFiles(directory);

    // Drop the schema-version + seed pointers so the fresh DB re-runs all
    // migrations and re-seeds, and clear any residual cleartext KV copies.
    // SETTINGS (language/theme/onboarding) and the keystore key are kept.
    await Promise.all([
        asyncStorageAdapter.remove(StorageKeys.SCHEMA_VERSION),
        asyncStorageAdapter.remove(StorageKeys.SEED_INITIALIZED),
        asyncStorageAdapter.remove(StorageKeys.WALLETS),
        asyncStorageAdapter.remove(StorageKeys.TRANSACTIONS),
        asyncStorageAdapter.remove(StorageKeys.CATEGORIES),
        asyncStorageAdapter.remove(StorageKeys.BUDGETS),
    ]);
}
