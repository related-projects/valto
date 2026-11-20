import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';

import { memoryFiles } from '../../../tests/helpers/memoryFileSystem';
import { getCurrencyByCode } from '../../domain/constants/currencies';
import i18n from '../../localization/i18n';
import { generateReportHTML, shareMonthlyPDF } from '../services/export/TransactionExportService';

/**
 * The monthly PDF with a start day other than 1 (REGISTRE C20 step 2, pass 98
 * items 6 and 8).
 *
 * The report names its period by its dates - "20 Nov - 19 Dec 2026", both
 * years when it crosses 1 January - and the shared file is named
 * valto_report_<first day>_<last day>.pdf (YYYY-MM-DD). With start day 1
 * nothing changes (exportService.reportFileName.test.ts, exportService.test.ts).
 *
 * The start day comes from the stored settings, which shareMonthlyPDF already
 * loads for the currency and the language: here loadSettings returns 20.
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
    return { ...actual, loadSettings: async () => ({ ...actual.getDefaultSettings(), monthStartDay: 20 }) };
});

const mockPrint = Print.printToFileAsync as jest.Mock;
const mockShare = Sharing.shareAsync as jest.Mock;

const en = i18n.getFixedT('en');
const usd = getCurrencyByCode('USD');

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
    memoryFiles.clear();
    mockPrint.mockReset();
    (Sharing.isAvailableAsync as jest.Mock).mockReset().mockResolvedValue(true);
    mockShare.mockReset().mockResolvedValue(undefined);
});

describe('pass 98 item 8. the shared PDF name with start day 20', () => {
    it.each([
        [2026, 12, 'valto_report_2026-11-20_2026-12-19.pdf'],
        [2027, 1, 'valto_report_2026-12-20_2027-01-19.pdf'],
    ])('pass 98 item 8. the report for period %i-%i is shared as %s', async (year, month, name) => {
        mockPrint.mockImplementation(printsTo('file:///cache/Print/5f0c9a3e-printed.pdf'));

        await shareMonthlyPDF(year, month, [], [], []);

        expect(sharedUris()).toHaveLength(1);
        expect(sharedUris()[0]).toMatch(endsWithName(name));
    });

    it('pass 98 item 6. the shared report names the period by its dates', async () => {
        let printedHtml = '';
        mockPrint.mockImplementation(async ({ html }: { html: string }) => {
            printedHtml = html;
            memoryFiles.add('file:///cache/Print/5f0c9a3e-printed.pdf');
            return { uri: 'file:///cache/Print/5f0c9a3e-printed.pdf', numberOfPages: 1 };
        });

        await shareMonthlyPDF(2026, 12, [], [], []);

        expect(printedHtml).toContain('<h1>Monthly Report - 20 Nov - 19 Dec 2026</h1>');
    });
});

describe('pass 98 item 6. generateReportHTML with a start day', () => {
    it('pass 98 item 6. titles the report with the period dates, both years across 1 January', () => {
        const december = generateReportHTML(2026, 12, [], [], [], usd, 'dot', 'YYYY-MM-DD', en, 20);
        const january = generateReportHTML(2027, 1, [], [], [], usd, 'dot', 'YYYY-MM-DD', en, 20);

        expect(december).toContain('<h1>Monthly Report - 20 Nov - 19 Dec 2026</h1>');
        expect(december).toContain('Valto Financial Report - 20 Nov - 19 Dec 2026');
        expect(january).toContain('<h1>Monthly Report - 20 Dec 2026 - 19 Jan 2027</h1>');
    });
});
