/**
 * Backup Restore / Notification Reconcile Tests
 *
 * restoreFromSnapshot writes the settings object out of the backup file verbatim,
 * so a backup taken on a device where notifications were granted can turn the
 * preference on here without anyone asking the OS. These tests pin the reconcile:
 * the restored preference must never outlive the permission that justifies it.
 */

jest.mock('@react-native-async-storage/async-storage', () =>
    require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

const mockGetPermissions = jest.fn();
const mockRequestPermissions = jest.fn();
const mockScheduleNotification = jest.fn();
const mockCancelAllNotifications = jest.fn();
const mockCancelScheduledNotification = jest.fn();

jest.mock('expo-notifications', () => ({
    getPermissionsAsync: () => mockGetPermissions(),
    requestPermissionsAsync: () => mockRequestPermissions(),
    scheduleNotificationAsync: (...args: any[]) => mockScheduleNotification(...args),
    cancelAllScheduledNotificationsAsync: () => mockCancelAllNotifications(),
    cancelScheduledNotificationAsync: (...args: any[]) => mockCancelScheduledNotification(...args),
    setNotificationChannelAsync: jest.fn().mockResolvedValue(undefined),
    setNotificationHandler: jest.fn(),
    SchedulableTriggerInputTypes: { TIME_INTERVAL: 'timeInterval', DAILY: 'daily' },
    AndroidImportance: { HIGH: 6 },
}));

jest.mock('expo-document-picker', () => ({
    getDocumentAsync: jest.fn(),
}));

jest.mock('expo-sharing', () => ({
    shareAsync: jest.fn().mockResolvedValue(undefined),
    isAvailableAsync: jest.fn().mockResolvedValue(true),
}));

import AsyncStorage from '@react-native-async-storage/async-storage';
import { createTestDb } from '../../../../tests/helpers/createTestDb';
import { CURRENT_SCHEMA_VERSION, restoreFromSnapshot, type BackupSnapshot } from '../backupService';
import { __setDatabaseForTests } from '../../storage/sql/database';
import { getDefaultSettings, loadSettings } from '../settingsService';

const REMINDER_ID = 'valto-daily-spending-reminder';

/** Minimal snapshot that passes validateSnapshot, carrying a settings block. */
const snapshotWithNotifications = (notificationsEnabled: boolean): BackupSnapshot => ({
    version: CURRENT_SCHEMA_VERSION,
    createdAt: new Date().toISOString(),
    appVersion: '1.0.0',
    data: {
        wallets: [],
        transactions: [],
        categories: [],
        budgets: [],
        recurringRules: [],
        settings: { ...getDefaultSettings(), notificationsEnabled },
    },
});

describe('restoreFromSnapshot notification reconcile', () => {
    beforeEach(async () => {
        await AsyncStorage.clear();
        jest.clearAllMocks();
        mockScheduleNotification.mockResolvedValue(undefined);
        mockCancelAllNotifications.mockResolvedValue(undefined);
        mockCancelScheduledNotification.mockResolvedValue(undefined);
        // The restore writes the ledger to SQLite, so it needs a live connection
        // even for the empty snapshots below.
        __setDatabaseForTests(await createTestDb());
    });

    afterEach(() => {
        __setDatabaseForTests(null);
    });

    it('persists false and schedules nothing when the backup asks for notifications the OS has not granted', async () => {
        mockGetPermissions.mockResolvedValue({ status: 'denied' });

        await restoreFromSnapshot(snapshotWithNotifications(true));

        const settings = await loadSettings();
        expect(settings.notificationsEnabled).toBe(false);
        expect(mockScheduleNotification).not.toHaveBeenCalled();
        // A restore must never raise a system dialog.
        expect(mockRequestPermissions).not.toHaveBeenCalled();
    });

    it('persists false when the backup asks for notifications and the OS was never asked', async () => {
        mockGetPermissions.mockResolvedValue({ status: 'undetermined' });

        await restoreFromSnapshot(snapshotWithNotifications(true));

        const settings = await loadSettings();
        expect(settings.notificationsEnabled).toBe(false);
        expect(mockScheduleNotification).not.toHaveBeenCalled();
        expect(mockRequestPermissions).not.toHaveBeenCalled();
    });

    it('schedules the reminder when the backup asks for notifications and the OS has granted them', async () => {
        mockGetPermissions.mockResolvedValue({ status: 'granted' });

        await restoreFromSnapshot(snapshotWithNotifications(true));

        const settings = await loadSettings();
        expect(settings.notificationsEnabled).toBe(true);
        expect(mockScheduleNotification).toHaveBeenCalledWith(
            expect.objectContaining({
                identifier: REMINDER_ID,
                trigger: expect.objectContaining({ type: 'daily', hour: 18, minute: 0 }),
            })
        );
        expect(mockRequestPermissions).not.toHaveBeenCalled();
    });

    it('leaves a backup with notifications off alone and reads no permission', async () => {
        await restoreFromSnapshot(snapshotWithNotifications(false));

        const settings = await loadSettings();
        expect(settings.notificationsEnabled).toBe(false);
        expect(mockGetPermissions).not.toHaveBeenCalled();
        expect(mockScheduleNotification).not.toHaveBeenCalled();
    });
});
