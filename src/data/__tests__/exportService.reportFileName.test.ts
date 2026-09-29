import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';

import { memoryFiles } from '../../../tests/helpers/memoryFileSystem';
import { shareMonthlyPDF } from '../services/export/TransactionExportService';

/**
 * The shared PDF carries the reported month in its name (REGISTRE V-95, D5)
 *
 * expo-print names its output with a UUID and expo-sharing takes no file name,
 * so the name a user saw was that UUID. The PDF is now moved to
 * valto_report_<YYYY-MM>.pdf before sharing: the month being reported, not the
 * export date, in fixed ASCII like the CSV and backup names. The File API
 * refuses to move onto an existing file, and the in-memory stand-in refuses it
 * too, so a second export of the same month passes only if the first file is
 * replaced.
 *
 * The clock is fake and fixed in September 2026, a month none of the cases
 * reports, so a name taken from the export date cannot pass.
 */

jest.mock('expo-print', () => ({ printToFileAsync: jest.fn() }));

jest.mock('expo-sharing', () => ({
    isAvailableAsync: jest.fn(),
    shareAsync: jest.fn(),
}));

jest.mock('expo-file-system', () =>
    jest.requireActual('../../../tests/helpers/memoryFileSystem').memoryFileSystemModule());

jest.mock('../services/settingsService', () => {
    const actual = jest.requireActual('../services/settingsService');
    return { ...actual, loadSettings: async () => actual.getDefaultSettings() };
});

const mockPrint = Print.printToFileAsync as jest.Mock;
const mockShare = Sharing.shareAsync as jest.Mock;

/** A render that writes `uri` and finishes at once, as expo-print does on success. */
function printsTo(uri: string) {
    return async () => {
        memoryFiles.add(uri);
        return { uri, numberOfPages: 1 };
    };
}

const sharedUris = (): string[] => mockShare.mock.calls.map(call => String(call[0]));

const endsWithName = (name: string): RegExp => new RegExp(`/${name.replace(/\./g, '\\.')}$`);

beforeEach(() => {
    jest.useFakeTimers({ now: new Date('2026-09-29T12:00:00Z') });
    memoryFiles.clear();
    mockPrint.mockReset();
    (Sharing.isAvailableAsync as jest.Mock).mockReset().mockResolvedValue(true);
    mockShare.mockReset().mockResolvedValue(undefined);
});

afterEach(() => {
    jest.useRealTimers();
});

describe('the shared PDF name', () => {
    it.each([
        [2026, 3, 'valto_report_2026-03.pdf'],
        [2025, 12, 'valto_report_2025-12.pdf'],
        [2027, 1, 'valto_report_2027-01.pdf'],
    ])('T4: the report for %i-%i is shared as %s', async (year, month, name) => {
        mockPrint.mockImplementation(printsTo('file:///cache/Print/5f0c9a3e-printed.pdf'));

        await shareMonthlyPDF(year, month, [], [], []);

        expect(sharedUris()).toHaveLength(1);
        expect(sharedUris()[0]).toMatch(endsWithName(name));
    });

    it('T5: exporting the same month twice succeeds both times and shares the same name each time', async () => {
        mockPrint
            .mockImplementationOnce(printsTo('file:///cache/Print/11111111-first.pdf'))
            .mockImplementationOnce(printsTo('file:///cache/Print/22222222-second.pdf'));

        await shareMonthlyPDF(2026, 3, [], [], []);
        await shareMonthlyPDF(2026, 3, [], [], []);

        const uris = sharedUris();
        expect(uris).toHaveLength(2);
        for (const uri of uris) {
            expect(uri).toMatch(endsWithName('valto_report_2026-03.pdf'));
        }
        // Replaced, not duplicated, and neither UUID file left behind.
        expect([...memoryFiles]).toEqual([uris[1]]);
    });
});
