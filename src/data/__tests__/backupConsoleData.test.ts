/**
 * The restore and backup paths print no file uri and no file content (pass 84b,
 * item 1)
 *
 * pickAndRestoreBackup logged the picked file's uri and name, then the first
 * 200 characters of the backup, and on a parse failure the parser's error -
 * whose message quotes the input - with the same 200 characters. A row refused
 * while writing was logged as the ValidationError itself, which carries the
 * refused value from the file. Console output reaches the device log, and it
 * is the raw material of a breadcrumb.
 *
 * The fixture is a real backup, written by createAndShareBackup from a ledger
 * whose wallet, category, note and amount carry markers, then restored through
 * the picker copy as the app does it. Every argument of every console call is
 * rendered with util.inspect - which also shows an error's own properties - and
 * none may contain the uri, the picked name, a marker or a key of the file.
 *
 * The hook that reports a failed backup or restore is covered in
 * src/hooks/__tests__/useSettingsConsoleData.test.ts.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import * as DocumentPicker from 'expo-document-picker';
import * as Sharing from 'expo-sharing';
import { inspect } from 'util';
import { BetterSqliteDatabase } from '../../../tests/helpers/BetterSqliteDatabase';
import { MemoryFile, memoryContents, memoryFiles } from '../../../tests/helpers/memoryFileSystem';
import { container } from '../../core/di/container';
import { CategoryType } from '../../domain/entities/Category';
import { TransactionType } from '../../domain/entities/Transaction';
import { WalletType } from '../../domain/entities/Wallet';
import { runMigrations } from '../migrations';
import { CategoryRepository } from '../repositories/CategoryRepository';
import { TransactionRepository } from '../repositories/TransactionRepository';
import { WalletRepository } from '../repositories/WalletRepository';
import { createAndShareBackup, pickAndRestoreBackup } from '../services/backupService';
import { asyncStorageAdapter, StorageKeys } from '../storage';
import { __setDatabaseForTests } from '../storage/sql/database';
import { SCHEMA_STATEMENTS } from '../storage/sql/schema';

jest.mock('expo-application', () => ({
    nativeApplicationVersion: '1.1.4',
    nativeBuildVersion: '1',
}));

jest.mock('expo-notifications', () => ({
    getPermissionsAsync: jest.fn().mockResolvedValue({ status: 'denied' }),
    requestPermissionsAsync: jest.fn(),
    scheduleNotificationAsync: jest.fn().mockResolvedValue('mock-id'),
    cancelAllScheduledNotificationsAsync: jest.fn().mockResolvedValue(undefined),
    cancelScheduledNotificationAsync: jest.fn().mockResolvedValue(undefined),
    setNotificationChannelAsync: jest.fn().mockResolvedValue(undefined),
    setNotificationHandler: jest.fn(),
    SchedulableTriggerInputTypes: { TIME_INTERVAL: 'timeInterval', DAILY: 'daily' },
    AndroidImportance: { HIGH: 6 },
}));

jest.mock('expo-document-picker', () => ({ getDocumentAsync: jest.fn() }));

jest.mock('expo-file-system', () =>
    jest.requireActual('../../../tests/helpers/memoryFileSystem').memoryFileSystemModule());

jest.mock('expo-sharing', () => ({
    shareAsync: jest.fn().mockResolvedValue(undefined),
    isAvailableAsync: jest.fn().mockResolvedValue(true),
}));

jest.mock('../../core/events', () => ({
    dataEvents: { emit: jest.fn(), emitMultiple: jest.fn(), subscribe: () => () => undefined },
}));

const MARKER_WALLET = 'Marker Wallet Zq7';
const MARKER_CATEGORY = 'Marker Category Zq7';
const MARKER_NOTE = 'Marker note Zq7 landlord';
const MARKER_AMOUNT = 98765432;
const MARKER_BALANCE = 123456789;

const PICKED_NAME = 'valto-backup-2026-10-27T09-15-00-000Z.json';
const PICKER_PATH = '/data/user/0/com.renkakpo.valto.app/cache/DocumentPicker/3f2b8c1e-9a4d-4c6b-8e21-5d7f0a9b1c3e.json';
const PICKER_COPY = `file://${PICKER_PATH}`;

/** What no console argument may contain, whatever the outcome. */
const FORBIDDEN = [
    PICKER_COPY,
    PICKER_PATH,
    PICKED_NAME,
    MARKER_WALLET,
    MARKER_CATEGORY,
    MARKER_NOTE,
    String(MARKER_AMOUNT),
    String(MARKER_BALANCE),
    // Keys of the backup file: present only in a slice of it.
    '"createdAt"',
    '"appVersion"',
    '"wallets"',
];

const shareAsync = Sharing.shareAsync as jest.Mock;
const getDocumentAsync = DocumentPicker.getDocumentAsync as jest.Mock;

let db: BetterSqliteDatabase;
let consoleSpies: jest.SpyInstance[];

/** Every console argument, as the device log or a breadcrumb would hold it. */
function printed(): string {
    return consoleSpies
        .flatMap((spy) => spy.mock.calls as unknown[][])
        .map((args) => args.map((arg) => (typeof arg === 'string' ? arg : inspect(arg, { depth: 8 }))).join(' '))
        .join('\n');
}

const leaks = (forbidden: string[]): string[] => forbidden.filter((text) => printed().includes(text));

/** A ledger with markers in every field a backup carries as user data. */
async function seedLedger(): Promise<void> {
    await db.runInTransaction(async () => {
        await new CategoryRepository(db).save({ id: 'cat-marker', name: MARKER_CATEGORY, type: CategoryType.EXPENSE });
        await new WalletRepository(db).save({
            id: 'w-marker',
            name: MARKER_WALLET,
            balance: MARKER_BALANCE,
            type: WalletType.CASH,
            createdAt: new Date('2026-01-02T00:00:00.000Z'),
        });
        await new TransactionRepository(db).save({
            id: 'tx-marker',
            type: TransactionType.EXPENSE,
            amount: MARKER_AMOUNT,
            categoryId: 'cat-marker',
            walletId: 'w-marker',
            date: new Date('2026-10-01T09:00:00.000Z'),
            note: MARKER_NOTE,
            createdAt: new Date('2026-10-01T09:00:00.000Z'),
        });
    });
}

/** The backup createAndShareBackup writes for the seeded ledger. */
async function realBackup(): Promise<string> {
    await createAndShareBackup();
    const uri = shareAsync.mock.calls[shareAsync.mock.calls.length - 1][0] as string;
    const content = memoryContents.get(uri);
    if (content === undefined) {
        throw new Error('the backup wrote no file');
    }
    return content;
}

/** The picker hands back a copy of `content`, as copyToCacheDirectory does. */
function pickerReturns(content: string): void {
    new MemoryFile(PICKER_COPY).write(content);
    getDocumentAsync.mockResolvedValue({
        canceled: false,
        assets: [{ uri: PICKER_COPY, name: PICKED_NAME, size: content.length, mimeType: 'application/json' }],
    });
}

beforeEach(async () => {
    jest.clearAllMocks();
    memoryFiles.clear();
    memoryContents.clear();
    await AsyncStorage.clear();
    db = new BetterSqliteDatabase();
    __setDatabaseForTests(db);
    container.reset();
    for (const statement of SCHEMA_STATEMENTS) {
        await db.execute(statement);
    }
    await asyncStorageAdapter.set(StorageKeys.SCHEMA_VERSION, 6);
    await runMigrations();
    await seedLedger();
    consoleSpies = (['log', 'info', 'warn', 'error', 'debug'] as const).map((method) =>
        jest.spyOn(console, method).mockImplementation(() => undefined),
    );
});

afterEach(() => {
    jest.restoreAllMocks();
    __setDatabaseForTests(null);
});

describe('pass 84b item 1. what the backup and restore paths print', () => {
    it('precondition: the backup carries every marker', async () => {
        const content = await realBackup();

        for (const marker of [MARKER_WALLET, MARKER_CATEGORY, MARKER_NOTE, String(MARKER_AMOUNT)]) {
            expect(content).toContain(marker);
        }
    });

    it('control: writing a backup prints nothing from the file', async () => {
        await realBackup();

        expect(leaks(FORBIDDEN)).toEqual([]);
    });

    it('pass 84b item 1. a restore that succeeds prints no uri and no file content', async () => {
        pickerReturns(await realBackup());

        await expect(pickAndRestoreBackup()).resolves.not.toBeNull();

        expect(leaks(FORBIDDEN)).toEqual([]);
    });

    it('pass 84b item 1. a truncated backup refused by the parser prints no file content', async () => {
        const content = await realBackup();
        pickerReturns(content.slice(0, Math.floor(content.length / 2)));

        await expect(pickAndRestoreBackup()).rejects.toThrow('invalid JSON');

        expect(leaks(FORBIDDEN)).toEqual([]);
    });

    it('pass 84b item 1. a file that is not JSON prints none of its text', async () => {
        // A CSV export picked by mistake: the parser quotes the start of it.
        const csv = `Date,Type,Amount,Currency,Wallet,Category,Description\n2026-10-01,expense,${MARKER_AMOUNT},XOF,${MARKER_WALLET},${MARKER_CATEGORY},${MARKER_NOTE}`;
        pickerReturns(csv);

        await expect(pickAndRestoreBackup()).rejects.toThrow('invalid JSON');

        expect(leaks([...FORBIDDEN, 'Date,Type'])).toEqual([]);
    });

    it('pass 84b item 1. a read failure prints no path', async () => {
        pickerReturns(await realBackup());
        jest.spyOn(MemoryFile.prototype, 'text').mockRejectedValue(new Error(
            `Call to function 'FileSystemFile.text' has been rejected.\n` +
            `Caused by: java.io.FileNotFoundException: ${PICKER_PATH}: open failed: EACCES (Permission denied)`,
        ));

        await expect(pickAndRestoreBackup()).rejects.toThrow('Could not read the selected file');

        expect(leaks(FORBIDDEN)).toEqual([]);
    });

    it('pass 84b item 1. a row refused while writing prints neither the row nor its value', async () => {
        const content = await realBackup();
        // validateSnapshot accepts any number; the transaction validator refuses a
        // negative amount inside the restore's transaction.
        const refused = content.replace(`"amount": ${MARKER_AMOUNT}`, `"amount": -${MARKER_AMOUNT}`);
        expect(refused).not.toBe(content);
        pickerReturns(refused);

        await expect(pickAndRestoreBackup()).rejects.toThrow('Restore refused');

        expect(leaks(FORBIDDEN)).toEqual([]);
    });
});
