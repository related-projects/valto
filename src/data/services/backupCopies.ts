/**
 * Backup Copies In The Cache
 *
 * Two paths leave a cleartext copy of the whole ledger in the app's cache
 * directory, outside the encrypted store:
 *  - createAndShareBackup (backupService.ts) writes
 *    `valto-backup-<ISO time, ':' and '.' as '-'>.json` in the cache root and
 *    hands it to the share sheet;
 *  - pickAndRestoreBackup asks expo-document-picker to copy the picked file
 *    (copyToCacheDirectory), which it writes as
 *    `<random UUID>.<extension of the picked name>` in `<cache>/DocumentPicker`
 *    (DocumentPickerModule.kt copyDocumentToCacheDirectory, expo-modules-core
 *    FileUtilities.generateOutputPath). The restore is the only caller of the
 *    picker in this app, so every such file there is a restore copy.
 *
 * discardBackupCopies deletes the files with exactly those names in exactly
 * those two directories, and nothing else: the cache root also holds the CSV
 * and PDF exports and other libraries' files, and neither directory is deleted
 * as a whole. It runs at app start (app/_layout.tsx), before a backup is
 * written, after a restore has read its file, and at the data resets
 * (resetService.ts, storeRecoveryService.ts).
 *
 * The CSV and PDF exports are the same ledger in the same cache root
 * (TransactionExportService.ts): shareCSV writes
 * `valto_transactions_<YYYY-MM-DD>.csv` and shareMonthlyPDF moves expo-print's
 * output to `valto_report_<YYYY-MM>.pdf`. discardExportCopies deletes those
 * names in the cache root, and nothing else. It runs at app start, before an
 * export is written, and at the data resets (pass 84b).
 *
 * NOT when the share sheet returns: on Android it returns once a target is
 * chosen, and the receiving app may still be reading the file through the
 * FileProvider URI it was handed.
 *
 * Best-effort and silent. A failure to list or delete leaves the file for the
 * next run and never reaches the caller: boot, backup, restore, export and
 * reset go on as before. Nothing is logged, because console output is
 * breadcrumb material and the Sentry emission surface is pinned
 * (sentryEmissionSurface.test.ts).
 */

import { Directory, File, Paths } from 'expo-file-system';

/** The name createAndShareBackup gives the file it shares. */
const BACKUP_FILE = /^valto-backup-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z\.json$/;

/** Where expo-document-picker copies a picked file, under the cache directory. */
const PICKER_DIRECTORY = 'DocumentPicker';

/**
 * The name the picker gives its copy: java.util.UUID.toString() (lowercase hex)
 * plus a dot and the picked name's extension, which may be empty.
 */
const PICKER_COPY = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.[^/]*$/;

/** The names shareCSV and shareMonthlyPDF give the files they share. */
const EXPORT_FILE = /^(valto_transactions_\d{4}-\d{2}-\d{2}\.csv|valto_report_\d{4}-\d{2}\.pdf)$/;

/** Delete the files directly in `directory` whose name matches `name`. */
function discardMatching(directory: Directory, name: RegExp): void {
    if (!directory.exists) {
        return;
    }
    for (const entry of directory.list()) {
        if (!(entry instanceof File) || !name.test(entry.name)) {
            continue;
        }
        try {
            entry.delete();
        } catch {
            // Left for the next run; the other files are still tried.
        }
    }
}

/**
 * Delete every backup file and restore copy Valto left in the cache.
 * Never throws.
 */
export function discardBackupCopies(): void {
    try {
        discardMatching(new Directory(Paths.cache), BACKUP_FILE);
    } catch {
        // Cache root unreadable: nothing to do until the next run.
    }
    try {
        discardMatching(new Directory(Paths.cache, PICKER_DIRECTORY), PICKER_COPY);
    } catch {
        // Picker directory unreadable: nothing to do until the next run.
    }
}

/**
 * Delete every CSV and PDF export Valto left in the cache.
 * Never throws.
 */
export function discardExportCopies(): void {
    try {
        discardMatching(new Directory(Paths.cache), EXPORT_FILE);
    } catch {
        // Cache root unreadable: nothing to do until the next run.
    }
}
