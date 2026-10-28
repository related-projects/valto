/**
 * The data resets remove the backup copies in the cache (pass 84, item 1 c)
 *
 * A backup file left in the cache, or a restore's picker copy, holds the ledger
 * unencrypted. A reset that tells the user their financial data is gone has to
 * take those copies with it: "Delete financial data" (resetAppData), the
 * currency reset that wipes the same data (resetFinancialDataForCurrencyReset,
 * through the shared wipe) and the store recovery Reset (resetCorruptedStore).
 * Since pass 84b (item 2) the CSV and PDF exports in the cache go with them.
 *
 * Mocked: the database handle (a fake that runs the wipe's statements), the
 * keystore key, the boot repair and the currency write. Real: resetService,
 * storeRecoveryService, the key-value store (InMemoryStorage) and the cleanup,
 * over tests/helpers/memoryFileSystem.
 */

import { MemoryFile, memoryContents, memoryFiles } from '../../../tests/helpers/memoryFileSystem';
import { resetAppData, resetFinancialDataForCurrencyReset } from '../services/resetService';
import { resetCorruptedStore } from '../services/storeRecoveryService';

const mockExecute = jest.fn();
const mockCloseDatabase = jest.fn();

jest.mock('expo-file-system', () =>
    jest.requireActual('../../../tests/helpers/memoryFileSystem').memoryFileSystemModule());

jest.mock('../storage/sql/database', () => ({
    getDb: () => ({
        execute: (...args: unknown[]) => mockExecute(...args),
        runInTransaction: <T>(work: () => Promise<T>) => work(),
        getDbPath: () => '/data/user/0/com.renkakpo.valto.app/databases/valto.db',
    }),
    closeDatabase: () => mockCloseDatabase(),
}));

jest.mock('../storage', () => {
    const mem = new (jest.requireActual('../../../tests/helpers/InMemoryStorage').InMemoryStorage)();
    const actualKeys = jest.requireActual('../storage/StorageKeys');
    return {
        asyncStorageAdapter: mem,
        StorageKeys: actualKeys.StorageKeys,
        LEGACY_KV_FINANCIAL_KEYS: actualKeys.LEGACY_KV_FINANCIAL_KEYS,
    };
});

jest.mock('../storage/sql/encryptionKey', () => ({
    deleteEncryptionKey: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../services/usableStateService', () => ({
    ensureUsableState: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../services/settingsService', () => ({
    unlockAndResetCurrency: jest.fn().mockResolvedValue({ currency: 'XOF' }),
}));

jest.mock('../../core/events', () => ({
    dataEvents: { emit: jest.fn(), emitMultiple: jest.fn() },
}));

const LEFTOVER_BACKUP = 'file:///cache/valto-backup-2026-10-27T09-15-00-000Z.json';
// Not a Valto file: the CSV and PDF exports are swept too since pass 84b.
const OTHER_IN_CACHE = 'file:///cache/report.pdf';
const PICKER_COPY = 'file:///cache/DocumentPicker/3f2b8c1e-9a4d-4c6b-8e21-5d7f0a9b1c3e.json';
const OTHER_IN_PICKER = 'file:///cache/DocumentPicker/notes.txt';
const LEFTOVER_CSV = 'file:///cache/valto_transactions_2026-10-27.csv';
const LEFTOVER_PDF = 'file:///cache/valto_report_2026-09.pdf';

beforeEach(() => {
    jest.clearAllMocks();
    memoryFiles.clear();
    memoryContents.clear();
    for (const uri of [LEFTOVER_BACKUP, OTHER_IN_CACHE, PICKER_COPY, OTHER_IN_PICKER, LEFTOVER_CSV, LEFTOVER_PDF]) {
        new MemoryFile(uri).write('{}');
    }
});

const RESETS: [string, () => Promise<unknown>][] = [
    ['delete financial data (resetAppData)', () => resetAppData()],
    ['currency reset (resetFinancialDataForCurrencyReset)', () => resetFinancialDataForCurrencyReset('XOF')],
    ['store recovery reset (resetCorruptedStore)', () => resetCorruptedStore()],
];

describe('pass 84 item 1 c. at a data reset', () => {
    it.each(RESETS)('pass 84 item 1 c. %s removes the leftover backup and restore copy, keeps the other files', async (_name, reset) => {
        expect(memoryFiles.has(LEFTOVER_BACKUP)).toBe(true);
        expect(memoryFiles.has(PICKER_COPY)).toBe(true);

        await reset();

        expect(memoryFiles.has(LEFTOVER_BACKUP)).toBe(false);
        expect(memoryFiles.has(PICKER_COPY)).toBe(false);
        expect(memoryFiles.has(OTHER_IN_CACHE)).toBe(true);
        expect(memoryFiles.has(OTHER_IN_PICKER)).toBe(true);
    });

    it.each(RESETS)('pass 84b item 2. %s removes the leftover CSV and PDF exports, keeps the other files', async (_name, reset) => {
        expect(memoryFiles.has(LEFTOVER_CSV)).toBe(true);
        expect(memoryFiles.has(LEFTOVER_PDF)).toBe(true);

        await reset();

        expect(memoryFiles.has(LEFTOVER_CSV)).toBe(false);
        expect(memoryFiles.has(LEFTOVER_PDF)).toBe(false);
        expect(memoryFiles.has(OTHER_IN_CACHE)).toBe(true);
        expect(memoryFiles.has(OTHER_IN_PICKER)).toBe(true);
    });
});
