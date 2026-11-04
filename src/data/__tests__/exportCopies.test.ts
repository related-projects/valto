/**
 * A new export removes the exports earlier ones left in the cache (pass 84b,
 * item 2)
 *
 * shareCSV writes valto_transactions_<YYYY-MM-DD>.csv and shareMonthlyPDF
 * valto_report_<YYYY-MM>.pdf in the cache root, unencrypted, and leaves them
 * there: the share sheet returns before the receiving app has necessarily read
 * the file, so it cannot go when the share returns. Earlier exports go when the
 * next one is written; the one just shared stays.
 *
 * The export must not fail because of the cleanup: a delete that throws leaves
 * the export shared as before, and nothing is logged.
 *
 * File system: tests/helpers/memoryFileSystem, with the legacy write the CSV uses
 * writing into it. The clock is fixed on 28 Oct 2026 at noon UTC, the same
 * calendar day in every zone the suite runs in.
 */

import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';

import { MemoryFile, memoryContents, memoryFiles } from '../../../tests/helpers/memoryFileSystem';
import { shareCSV, shareMonthlyPDF } from '../services/export/TransactionExportService';

jest.mock('expo-print', () => ({ printToFileAsync: jest.fn() }));

jest.mock('expo-sharing', () => ({
    isAvailableAsync: jest.fn(),
    shareAsync: jest.fn(),
}));

jest.mock('expo-file-system', () =>
    jest.requireActual('../../../tests/helpers/memoryFileSystem').memoryFileSystemModule());

jest.mock('expo-file-system/legacy', () => {
    const { MemoryFile: File } = jest.requireActual('../../../tests/helpers/memoryFileSystem');
    return {
        cacheDirectory: 'file:///cache/',
        EncodingType: { UTF8: 'utf8' },
        writeAsStringAsync: async (uri: string, content: string) => {
            new File(uri).write(content);
        },
    };
});

jest.mock('../services/settingsService', () => {
    const actual = jest.requireActual('../services/settingsService');
    return { ...actual, loadSettings: async () => actual.getDefaultSettings() };
});

const OLDER_CSV = 'file:///cache/valto_transactions_2026-10-27.csv';
const OLDER_PDF = 'file:///cache/valto_report_2026-08.pdf';
const OTHER_IN_CACHE = 'file:///cache/report.pdf';
const NEW_CSV = 'file:///cache/valto_transactions_2026-10-28.csv';
const NEW_PDF = 'file:///cache/valto_report_2026-09.pdf';

const mockPrint = Print.printToFileAsync as jest.Mock;
const mockShare = Sharing.shareAsync as jest.Mock;

const sharedUri = (): string => String(mockShare.mock.calls[mockShare.mock.calls.length - 1][0]);

let consoleSpies: jest.SpyInstance[];

beforeEach(() => {
    jest.useFakeTimers({ now: new Date('2026-10-28T12:00:00Z') });
    memoryFiles.clear();
    memoryContents.clear();
    for (const uri of [OLDER_CSV, OLDER_PDF, OTHER_IN_CACHE]) {
        new MemoryFile(uri).write('older export');
    }
    mockPrint.mockReset().mockImplementation(async () => {
        const printed = 'file:///cache/Print/5f0c9a3e-1b2c-4d3e-8f4a-5b6c7d8e9f0a.pdf';
        new MemoryFile(printed).write('%PDF');
        return { uri: printed, numberOfPages: 1 };
    });
    (Sharing.isAvailableAsync as jest.Mock).mockReset().mockResolvedValue(true);
    mockShare.mockReset().mockResolvedValue(undefined);
    consoleSpies = (['log', 'info', 'warn', 'error', 'debug'] as const).map((method) =>
        jest.spyOn(console, method).mockImplementation(() => undefined),
    );
});

afterEach(() => {
    jest.restoreAllMocks();
    jest.useRealTimers();
});

describe('pass 84b item 2. before a new export is written', () => {
    it('pass 84b item 2. a CSV export removes the older exports, keeps the other file and the one it shared', async () => {
        expect(memoryFiles.has(OLDER_CSV)).toBe(true);
        expect(memoryFiles.has(OLDER_PDF)).toBe(true);

        await shareCSV([], [], []);

        expect(sharedUri()).toBe(NEW_CSV);
        expect(memoryFiles.has(NEW_CSV)).toBe(true);
        expect(memoryFiles.has(OLDER_CSV)).toBe(false);
        expect(memoryFiles.has(OLDER_PDF)).toBe(false);
        expect(memoryFiles.has(OTHER_IN_CACHE)).toBe(true);
    });

    it('pass 84b item 2. a PDF export removes the older exports, keeps the other file and the one it shared', async () => {
        expect(memoryFiles.has(OLDER_CSV)).toBe(true);
        expect(memoryFiles.has(OLDER_PDF)).toBe(true);

        await shareMonthlyPDF(2026, 9, [], [], []);

        expect(sharedUri()).toBe(NEW_PDF);
        expect(memoryFiles.has(NEW_PDF)).toBe(true);
        expect(memoryFiles.has(OLDER_CSV)).toBe(false);
        expect(memoryFiles.has(OLDER_PDF)).toBe(false);
        expect(memoryFiles.has(OTHER_IN_CACHE)).toBe(true);
    });

    it('pass 84b item 2. a delete that throws does not stop the export and logs nothing', async () => {
        const deleteSpy = jest.spyOn(MemoryFile.prototype, 'delete').mockImplementation(() => {
            throw new Error('ERR_FILE_NOT_WRITABLE');
        });

        await expect(shareCSV([], [], [])).resolves.toBeUndefined();

        expect(deleteSpy).toHaveBeenCalled();
        expect(mockShare).toHaveBeenCalledTimes(1);
        expect(memoryFiles.has(NEW_CSV)).toBe(true);
        for (const spy of consoleSpies) {
            expect(spy).not.toHaveBeenCalled();
        }
    });
});
