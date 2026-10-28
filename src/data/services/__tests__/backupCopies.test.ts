/**
 * Backup copies left in the app cache (pass 84, item 1)
 *
 * Two paths leave a cleartext copy of the whole ledger in the cache:
 * createAndShareBackup writes valto-backup-<time>.json in the cache root, and
 * the restore's document picker copies the picked file to
 * DocumentPicker/<uuid>.<extension>. discardBackupCopies removes those files and
 * nothing else: not the CSV and PDF exports beside them, not a name that only
 * looks close, not a directory, not a file in another directory.
 *
 * Best-effort: a delete that throws is skipped, the remaining files are still
 * removed, and nothing is logged - console output becomes a Sentry breadcrumb
 * candidate, and the emission surface is pinned (sentryEmissionSurface.test.ts).
 *
 * The callers (boot, backup, resets, restore) are covered in
 * app/__tests__/backupCopiesBoot.test.tsx,
 * src/data/__tests__/backupCopiesBackupRestore.test.ts and
 * src/data/__tests__/backupCopiesReset.test.ts.
 */

import {
    MemoryDirectory,
    MemoryFile,
    memoryContents,
    memoryFiles,
} from '../../../../tests/helpers/memoryFileSystem';
import { discardBackupCopies, discardExportCopies } from '../backupCopies';

jest.mock('expo-file-system', () =>
    jest.requireActual('../../../../tests/helpers/memoryFileSystem').memoryFileSystemModule());

const CACHE = 'file:///cache';
const PICKER = `${CACHE}/DocumentPicker`;
const UUID = '3f2b8c1e-9a4d-4c6b-8e21-5d7f0a9b1c3e';

/** What a backup and the picker leave behind, in the shapes their writers use. */
const VALTO_COPIES = [
    `${CACHE}/valto-backup-2026-10-27T09-15-00-000Z.json`,
    `${CACHE}/valto-backup-2026-10-28T23-59-59-999Z.json`,
    `${PICKER}/${UUID}.json`,
    // The picker keeps the picked name's extension, whatever it is, and always
    // writes the dot (FileUtilities.generateOutputPath).
    `${PICKER}/0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d.txt`,
    `${PICKER}/9e8d7c6b-5a4f-4e3d-8c2b-1a0f9e8d7c6b.`,
];

/** Files in the same directories, and near misses, that are not Valto backup copies. */
const OTHER_FILES = [
    `${CACHE}/valto_transactions_2026-10-27.csv`,
    `${CACHE}/valto_report_2026-10.pdf`,
    `${CACHE}/valto-backup-notes.json`,
    `${CACHE}/valto-backup-2026-10-27T09-15-00-000Z.json.bak`,
    `${CACHE}/${UUID}.json`,
    `${CACHE}/Print/${UUID}.pdf`,
    `${PICKER}/notes.txt`,
    `${PICKER}/${UUID.toUpperCase()}.json`,
    `${PICKER}/nested/${UUID}.json`,
    // A directory named like a backup: only files are removed.
    `${CACHE}/valto-backup-2026-10-26T08-00-00-000Z.json/inside.txt`,
];

function seed(uris: string[]): void {
    for (const uri of uris) {
        new MemoryFile(uri).write('{}');
    }
}

let consoleSpies: jest.SpyInstance[];

beforeEach(() => {
    memoryFiles.clear();
    memoryContents.clear();
    consoleSpies = (['log', 'warn', 'error', 'info', 'debug'] as const).map((method) =>
        jest.spyOn(console, method).mockImplementation(() => undefined),
    );
});

afterEach(() => {
    jest.restoreAllMocks();
});

const remaining = (): string[] => [...memoryFiles].sort();

describe('pass 84 item 1. discardBackupCopies', () => {
    it('pass 84 item 1. removes the backup files and the restore copies, and nothing else', () => {
        seed([...VALTO_COPIES, ...OTHER_FILES]);

        discardBackupCopies();

        expect(remaining()).toEqual([...OTHER_FILES].sort());
    });

    it('pass 84 item 1. a delete that throws is skipped and the other copies are still removed', () => {
        seed([...VALTO_COPIES, ...OTHER_FILES]);
        const realDelete = MemoryFile.prototype.delete;
        const deleteSpy = jest.spyOn(MemoryFile.prototype, 'delete').mockImplementation(function (this: MemoryFile) {
            if (this.uri === VALTO_COPIES[0]) {
                throw new Error('ERR_FILE_NOT_WRITABLE');
            }
            realDelete.call(this);
        });

        expect(() => discardBackupCopies()).not.toThrow();

        expect(deleteSpy).toHaveBeenCalledTimes(VALTO_COPIES.length);
        expect(remaining()).toEqual([VALTO_COPIES[0], ...OTHER_FILES].sort());
        for (const spy of consoleSpies) {
            expect(spy).not.toHaveBeenCalled();
        }
    });

    it('pass 84 item 1. a directory that cannot be listed does not stop the other one', () => {
        seed([...VALTO_COPIES, ...OTHER_FILES]);
        const realList = MemoryDirectory.prototype.list;
        const listSpy = jest.spyOn(MemoryDirectory.prototype, 'list').mockImplementation(function (this: MemoryDirectory) {
            if (this.uri === CACHE) {
                throw new Error('ERR_DIRECTORY_NOT_READABLE');
            }
            return realList.call(this);
        });

        expect(() => discardBackupCopies()).not.toThrow();

        expect(listSpy).toHaveBeenCalledTimes(2);
        const pickerCopies = VALTO_COPIES.filter((uri) => uri.startsWith(`${PICKER}/`));
        for (const uri of pickerCopies) {
            expect(memoryFiles.has(uri)).toBe(false);
        }
        for (const spy of consoleSpies) {
            expect(spy).not.toHaveBeenCalled();
        }
    });

    it('pass 84 item 1. an empty cache, with no picker directory, is not an error', () => {
        expect(() => discardBackupCopies()).not.toThrow();
        expect(remaining()).toEqual([]);
    });
});

/**
 * Pass 84b item 2: the CSV and PDF exports are the same ledger in the cache
 * root, written by TransactionExportService as valto_transactions_<YYYY-MM-DD>.csv
 * and valto_report_<YYYY-MM>.pdf. discardExportCopies removes those names in
 * the cache root and nothing else - not a backup copy, not expo-print's own
 * output under Print/, not a near miss.
 */
const EXPORT_COPIES = [
    `${CACHE}/valto_transactions_2026-10-27.csv`,
    `${CACHE}/valto_transactions_2025-01-31.csv`,
    `${CACHE}/valto_report_2026-10.pdf`,
    `${CACHE}/valto_report_2025-12.pdf`,
];

const NOT_EXPORTS = [
    `${CACHE}/report.pdf`,
    `${CACHE}/valto_transactions_notes.csv`,
    `${CACHE}/valto_transactions_2026-10-27.csv.tmp`,
    `${CACHE}/valto_report_2026-1.pdf`,
    `${CACHE}/valto-backup-2026-10-27T09-15-00-000Z.json`,
    `${CACHE}/Print/${UUID}.pdf`,
    `${CACHE}/exports/valto_report_2026-10.pdf`,
    `${PICKER}/${UUID}.json`,
    // A directory named like an export: only files are removed.
    `${CACHE}/valto_report_2026-09.pdf/inside.txt`,
];

describe('pass 84b item 2. discardExportCopies', () => {
    it('pass 84b item 2. removes the CSV and PDF exports, and nothing else', () => {
        seed([...EXPORT_COPIES, ...NOT_EXPORTS]);

        discardExportCopies();

        expect(remaining()).toEqual([...NOT_EXPORTS].sort());
    });

    it('pass 84b item 2. a delete that throws is skipped and the other exports are still removed', () => {
        seed([...EXPORT_COPIES, ...NOT_EXPORTS]);
        const realDelete = MemoryFile.prototype.delete;
        const deleteSpy = jest.spyOn(MemoryFile.prototype, 'delete').mockImplementation(function (this: MemoryFile) {
            if (this.uri === EXPORT_COPIES[0]) {
                throw new Error('ERR_FILE_NOT_WRITABLE');
            }
            realDelete.call(this);
        });

        expect(() => discardExportCopies()).not.toThrow();

        expect(deleteSpy).toHaveBeenCalledTimes(EXPORT_COPIES.length);
        expect(remaining()).toEqual([EXPORT_COPIES[0], ...NOT_EXPORTS].sort());
        for (const spy of consoleSpies) {
            expect(spy).not.toHaveBeenCalled();
        }
    });
});
