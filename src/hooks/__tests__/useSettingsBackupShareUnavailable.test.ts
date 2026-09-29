import { act, renderHook } from '@testing-library/react-native';
import * as Sharing from 'expo-sharing';
import { Alert } from 'react-native';

import { createTestDb } from '../../../tests/helpers/createTestDb';
import { memoryFiles } from '../../../tests/helpers/memoryFileSystem';
import { container } from '../../core/di/container';
import { createAndShareBackup } from '../../data/services/backupService';
import { __setDatabaseForTests } from '../../data/storage/sql/database';
import { useSettings } from '../useSettings';

/**
 * A backup that cannot be shared fails out loud (V-94 audit, D7)
 *
 * The PDF and the CSV throw when the device cannot share. The backup returned
 * without a word, so a tap on "Backup data" produced nothing: no sheet and no
 * alert. It now throws the same way, and the settings hook's existing catch
 * shows its translated failure alert.
 *
 * The real backupService runs against a real test database, so these tests
 * fail on the silent return itself, not on a stubbed rejection. `t` is the
 * identity here, so an assertion reads the KEY.
 */

jest.mock('expo-sharing', () => ({
    isAvailableAsync: jest.fn(),
    shareAsync: jest.fn(),
}));

jest.mock('expo-file-system', () =>
    jest.requireActual('../../../tests/helpers/memoryFileSystem').memoryFileSystemModule());

jest.mock('expo-document-picker', () => ({ getDocumentAsync: jest.fn() }));

// The hook reads the permission on mount; nothing else here reaches the module.
jest.mock('expo-notifications', () => ({
    getPermissionsAsync: async () => ({ status: 'undetermined' }),
}));

jest.mock('react-i18next', () => ({
    ...jest.requireActual('react-i18next'),
    useTranslation: () => ({ t: (key: string) => key }),
}));

jest.mock('../../data/services/settingsService', () => {
    const actual = jest.requireActual('../../data/services/settingsService');
    return { ...actual, loadSettings: async () => actual.getDefaultSettings() };
});

const mockIsAvailable = Sharing.isAvailableAsync as jest.Mock;
const mockShare = Sharing.shareAsync as jest.Mock;

beforeEach(async () => {
    container.reset();
    __setDatabaseForTests(await createTestDb());
    jest.useFakeTimers({ now: new Date('2026-03-15T12:00:00Z') });
    memoryFiles.clear();
    mockIsAvailable.mockReset().mockResolvedValue(false);
    mockShare.mockReset().mockResolvedValue(undefined);
    jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    // The hook's catch logs the failure it alerts on.
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
    jest.restoreAllMocks();
    jest.useRealTimers();
    __setDatabaseForTests(null);
});

describe('backup with sharing unavailable', () => {
    it('T6: the backup rejects instead of returning silently', async () => {
        await expect(createAndShareBackup()).rejects.toThrow('Sharing is not available on this device');
        expect(mockShare).not.toHaveBeenCalled();
    });

    it('T6: the settings hook shows its backup failure alert', async () => {
        const { result } = renderHook(() => useSettings());

        await act(async () => {
            await result.current.createBackup();
        });

        expect(Alert.alert).toHaveBeenCalledTimes(1);
        expect(Alert.alert).toHaveBeenCalledWith('alerts.backupFailed', 'alerts.backupFailedMessage');
        expect(mockShare).not.toHaveBeenCalled();
        expect(result.current.loading).toBe(false);
    });
});
