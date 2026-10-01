import * as Sharing from 'expo-sharing';

import { createTestDb } from '../../../tests/helpers/createTestDb';
import { container } from '../../core/di/container';
import i18n from '../../localization/i18n';
import { createAndShareBackup } from '../services/backupService';
import { shareCSV } from '../services/export/TransactionExportService';
import { __setDatabaseForTests } from '../storage/sql/database';

/**
 * Share-sheet titles follow the app language
 *
 * Registry F-06, findings 9 and 16. Two of the three share sheets carried an
 * English literal: 'Save Backup' in backupService and 'Export Transactions' in
 * shareCSV. The third - the PDF sheet, in the same file as the CSV one - had
 * already been done properly with t('export.pdfTitle'), so the CSV sheet sat
 * twelve lines from a live `t` it never used.
 *
 * D8 and D9: both titles come from the bundle, fixed to the PERSISTED language
 * with i18n.getFixedT(settings.language), the way the PDF sibling does it. The
 * device locale must not decide what a share sheet says, so the test drives the
 * settings language and leaves i18n's own current language on English: a title
 * that came from the running i18n instance rather than from settings would show
 * up as English here.
 *
 * Registry V-95. The expected titles are written out, not re-derived with t().
 * i18next returns the key itself for a key it cannot find, so comparing the
 * sheet's title with t(key) passed even with the key deleted from every bundle:
 * both sides resolved to "settings.backupShareTitle". The values below are
 * ru.json settings.backupShareTitle and export.csvTitle, escaped to keep this
 * file ASCII.
 */

const TEST_LANGUAGE = 'ru';

const RU_BACKUP_TITLE =
    '\u{421}\u{43e}\u{445}\u{440}\u{430}\u{43d}\u{438}\u{442}\u{44c} ' +
    '\u{440}\u{435}\u{437}\u{435}\u{440}\u{432}\u{43d}\u{443}\u{44e} ' +
    '\u{43a}\u{43e}\u{43f}\u{438}\u{44e}';
const RU_CSV_TITLE = '\u{42d}\u{43a}\u{441}\u{43f}\u{43e}\u{440}\u{442} CSV';

jest.mock('expo-sharing', () => ({
    shareAsync: jest.fn().mockResolvedValue(undefined),
    isAvailableAsync: jest.fn().mockResolvedValue(true),
}));

jest.mock('expo-file-system', () => {
    class MockFile {
        uri: string;
        constructor(_directory: unknown, name: string) {
            this.uri = `file:///cache/${name}`;
        }
        write() { /* the bytes are not what this suite is about */ }
    }
    return {
        File: MockFile,
        Paths: { cache: 'file:///cache/' },
        cacheDirectory: 'file:///cache/',
        writeAsStringAsync: jest.fn().mockResolvedValue(undefined),
        EncodingType: { UTF8: 'utf8' },
    };
});

jest.mock('expo-document-picker', () => ({ getDocumentAsync: jest.fn() }));

jest.mock('../services/settingsService', () => {
    const actual = jest.requireActual('../services/settingsService');
    return { ...actual, loadSettings: jest.fn() };
});

jest.mock('../../core/events', () => ({
    dataEvents: { emit: jest.fn(), emitMultiple: jest.fn(), subscribe: jest.fn(() => jest.fn()) },
}));

const mockedShareAsync = Sharing.shareAsync as jest.Mock;
const mockedLoadSettings = jest.requireMock('../services/settingsService').loadSettings as jest.Mock;

const dialogTitleOfLastShare = (): string =>
    String(mockedShareAsync.mock.calls[0][1].dialogTitle);

beforeAll(async () => {
    await i18n.changeLanguage('en');
});

beforeEach(async () => {
    jest.clearAllMocks();
    container.reset();
    __setDatabaseForTests(await createTestDb({ writeGuard: true }));
    const actual = jest.requireActual('../services/settingsService');
    mockedLoadSettings.mockResolvedValue({
        ...actual.getDefaultSettings(),
        language: TEST_LANGUAGE,
    });
});

afterEach(() => {
    __setDatabaseForTests(null);
});

describe('share-sheet titles', () => {
    it('titles the backup sheet in the persisted language', async () => {
        await createAndShareBackup();

        expect(mockedShareAsync).toHaveBeenCalledTimes(1);
        expect(dialogTitleOfLastShare()).toBe(RU_BACKUP_TITLE);
    });

    it('titles the CSV sheet in the persisted language, reusing the export key', async () => {
        await shareCSV([], [], []);

        expect(mockedShareAsync).toHaveBeenCalledTimes(1);
        expect(dialogTitleOfLastShare()).toBe(RU_CSV_TITLE);
    });

    it('leaves neither title in English', async () => {
        await createAndShareBackup();
        const backupTitle = dialogTitleOfLastShare();
        jest.clearAllMocks();

        await shareCSV([], [], []);
        const csvTitle = dialogTitleOfLastShare();

        expect(backupTitle).not.toBe('Save Backup');
        expect(csvTitle).not.toBe('Export Transactions');
    });
});
