/**
 * The cache cleanup knows both PDF names (REGISTRE C20 step 2, pass 98 item 8)
 *
 * shareMonthlyPDF names the report valto_report_<YYYY-MM>.pdf with start day
 * 1, and valto_report_<YYYY-MM-DD>_<YYYY-MM-DD>.pdf (the period's first and
 * last day) with any other. discardExportCopies removes both forms from the
 * cache root, and still nothing else: not a near miss of either form, not the
 * same name in another directory.
 */

import { MemoryFile, memoryContents, memoryFiles } from '../../../../tests/helpers/memoryFileSystem';
import { discardExportCopies } from '../backupCopies';

jest.mock('expo-file-system', () =>
    jest.requireActual('../../../../tests/helpers/memoryFileSystem').memoryFileSystemModule());

const CACHE = 'file:///cache';

const BOTH_FORMS = [
    `${CACHE}/valto_report_2026-11.pdf`,
    `${CACHE}/valto_report_2026-11-20_2026-12-19.pdf`,
    `${CACHE}/valto_report_2026-12-20_2027-01-19.pdf`,
];

const NEAR_MISSES = [
    `${CACHE}/valto_report_2026-11-20.pdf`,
    `${CACHE}/valto_report_2026-11-20_2026-12.pdf`,
    `${CACHE}/valto_report_2026-11-20-2026-12-19.pdf`,
    `${CACHE}/valto_report_2026-11-20_2026-12-19.pdf.tmp`,
    `${CACHE}/exports/valto_report_2026-11-20_2026-12-19.pdf`,
    // A directory named like a dated report: only files are removed.
    `${CACHE}/valto_report_2026-10-20_2026-11-19.pdf/inside.txt`,
];

function seed(uris: string[]): void {
    for (const uri of uris) {
        new MemoryFile(uri).write('{}');
    }
}

beforeEach(() => {
    memoryFiles.clear();
    memoryContents.clear();
});

describe('pass 98 item 8. discardExportCopies and the dated report name', () => {
    it('pass 98 item 8. removes the month-named and the date-named reports, and nothing else', () => {
        seed([...BOTH_FORMS, ...NEAR_MISSES]);

        discardExportCopies();

        expect([...memoryFiles].sort()).toEqual([...NEAR_MISSES].sort());
    });
});
