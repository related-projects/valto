/**
 * Notification Service Edge Case Tests
 *
 * Tests permission handling, idempotent toggling, daily reminder scheduling,
 * startup re-verification, and cancellation.
 */

const mockGetPermissions = jest.fn();
const mockRequestPermissions = jest.fn();
const mockScheduleNotification = jest.fn();
const mockCancelAllNotifications = jest.fn();
const mockCancelScheduledNotification = jest.fn();
const mockSetNotificationChannel = jest.fn();
const mockSetNotificationHandler = jest.fn();

jest.mock('expo-notifications', () => ({
    getPermissionsAsync: () => mockGetPermissions(),
    requestPermissionsAsync: () => mockRequestPermissions(),
    scheduleNotificationAsync: (...args: any[]) => mockScheduleNotification(...args),
    cancelAllScheduledNotificationsAsync: () => mockCancelAllNotifications(),
    cancelScheduledNotificationAsync: (...args: any[]) => mockCancelScheduledNotification(...args),
    setNotificationChannelAsync: (...args: any[]) => mockSetNotificationChannel(...args),
    setNotificationHandler: (...args: any[]) => mockSetNotificationHandler(...args),
    SchedulableTriggerInputTypes: { TIME_INTERVAL: 'timeInterval', DAILY: 'daily' },
    AndroidImportance: { HIGH: 6 },
}));

// Platform is the service's only react-native dependency. The mock object is a
// stable reference, so a test can flip Platform.OS to exercise the Android branch.
jest.mock('react-native', () => ({
    Platform: { OS: 'ios' },
}));

// Keys, not prose - keeps the assertions independent of the locale copy.
jest.mock('../../../localization/i18n', () => ({
    __esModule: true,
    default: { t: (key: string) => key },
}));

const mockLoadSettings = jest.fn();
const mockUpdateSetting = jest.fn();
const mockEmit = jest.fn();

jest.mock('../../../core/events/dataEvents', () => ({
    dataEvents: {
        emit: (...args: any[]) => mockEmit(...args),
    },
}));

jest.mock('../settingsService', () => ({
    loadSettings: () => mockLoadSettings(),
    updateSetting: (...args: any[]) => mockUpdateSetting(...args),
}));

import { Platform } from 'react-native';
import {
    initializeNotifications,
    requestPermissions,
    scheduleDailyReminder,
    setNotificationsEnabled,
} from '../notificationService';

const REMINDER_ID = 'valto-daily-spending-reminder';
const CHANNEL_ID = 'daily-reminder';

const EXPECTED_REQUEST = {
    identifier: REMINDER_ID,
    content: {
        title: 'notifications.dailyReminder.title',
        body: 'notifications.dailyReminder.body',
    },
    trigger: {
        type: 'daily',
        channelId: CHANNEL_ID,
        hour: 18,
        minute: 0,
    },
};

describe('notificationService', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        (Platform as { OS: string }).OS = 'ios';
        // Scheduling now reads the permission, so every test needs a status.
        // Granted is the default; tests that care set their own.
        mockGetPermissions.mockResolvedValue({ status: 'granted' });
        mockUpdateSetting.mockResolvedValue(undefined);
        mockCancelAllNotifications.mockResolvedValue(undefined);
        mockCancelScheduledNotification.mockResolvedValue(undefined);
        mockScheduleNotification.mockResolvedValue(undefined);
        mockSetNotificationChannel.mockResolvedValue(undefined);
    });

    describe('requestPermissions', () => {
        it('returns true when already granted', async () => {
            mockGetPermissions.mockResolvedValue({ status: 'granted' });

            const result = await requestPermissions();
            expect(result).toBe(true);
            expect(mockRequestPermissions).not.toHaveBeenCalled();
        });

        it('requests permissions when not granted', async () => {
            mockGetPermissions.mockResolvedValue({ status: 'undetermined' });
            mockRequestPermissions.mockResolvedValue({ status: 'granted' });

            const result = await requestPermissions();
            expect(result).toBe(true);
            expect(mockRequestPermissions).toHaveBeenCalled();
        });

        it('returns false when permission denied', async () => {
            mockGetPermissions.mockResolvedValue({ status: 'undetermined' });
            mockRequestPermissions.mockResolvedValue({ status: 'denied' });

            const result = await requestPermissions();
            expect(result).toBe(false);
        });
    });

    describe('setNotificationsEnabled', () => {
        it('is idempotent when value unchanged', async () => {
            mockLoadSettings.mockResolvedValue({ notificationsEnabled: true });

            const result = await setNotificationsEnabled(true);
            expect(result).toEqual({ enabled: true, permissionDenied: false });
            expect(mockUpdateSetting).not.toHaveBeenCalled();
        });

        it('returns permissionDenied when enabling without permission', async () => {
            mockLoadSettings.mockResolvedValue({ notificationsEnabled: false });
            mockGetPermissions.mockResolvedValue({ status: 'undetermined' });
            mockRequestPermissions.mockResolvedValue({ status: 'denied' });

            const result = await setNotificationsEnabled(true);
            expect(result).toEqual({ enabled: false, permissionDenied: true });
            expect(mockUpdateSetting).not.toHaveBeenCalled();
            expect(mockScheduleNotification).not.toHaveBeenCalled();
        });

        it('enables when permission granted', async () => {
            mockLoadSettings.mockResolvedValue({ notificationsEnabled: false });
            mockGetPermissions.mockResolvedValue({ status: 'granted' });

            const result = await setNotificationsEnabled(true);
            expect(result).toEqual({ enabled: true, permissionDenied: false });
            expect(mockUpdateSetting).toHaveBeenCalledWith('notificationsEnabled', true);
            expect(mockEmit).toHaveBeenCalledWith('settings');
        });

        it('turning the switch ON schedules exactly one daily reminder at 18:00', async () => {
            // loadSettings is read twice: once by the toggle (false, so it proceeds)
            // and once by the scheduler after the write (true, so it schedules).
            mockLoadSettings
                .mockResolvedValueOnce({ notificationsEnabled: false })
                .mockResolvedValue({ notificationsEnabled: true });
            mockGetPermissions.mockResolvedValue({ status: 'granted' });

            await setNotificationsEnabled(true);

            expect(mockScheduleNotification).toHaveBeenCalledTimes(1);
            expect(mockScheduleNotification).toHaveBeenCalledWith(EXPECTED_REQUEST);
        });

        it('cancels all notifications when disabling and schedules nothing', async () => {
            mockLoadSettings.mockResolvedValue({ notificationsEnabled: true });

            const result = await setNotificationsEnabled(false);
            expect(result).toEqual({ enabled: false, permissionDenied: false });
            expect(mockCancelAllNotifications).toHaveBeenCalled();
            expect(mockUpdateSetting).toHaveBeenCalledWith('notificationsEnabled', false);
            expect(mockEmit).toHaveBeenCalledWith('settings');
            expect(mockScheduleNotification).not.toHaveBeenCalled();
        });
    });

    describe('scheduleDailyReminder', () => {
        it('schedules a DAILY trigger at hour 18 minute 0 when enabled', async () => {
            mockLoadSettings.mockResolvedValue({ notificationsEnabled: true });

            await scheduleDailyReminder();

            expect(mockScheduleNotification).toHaveBeenCalledWith(EXPECTED_REQUEST);
        });

        it('does not schedule when notifications disabled', async () => {
            mockLoadSettings.mockResolvedValue({ notificationsEnabled: false });

            await scheduleDailyReminder();

            expect(mockScheduleNotification).not.toHaveBeenCalled();
        });

        it('cancels the stable identifier when the preference is false', async () => {
            // The other half of the invariant. "Preference off" has to mean
            // "nothing pending on the OS", not merely "nothing newly scheduled":
            // a full data reset used to drop the preference while leaving the
            // reminder registered, and no path afterwards took it back down.
            mockLoadSettings.mockResolvedValue({ notificationsEnabled: false });

            await scheduleDailyReminder();

            expect(mockCancelScheduledNotification).toHaveBeenCalledWith(REMINDER_ID);
            expect(mockScheduleNotification).not.toHaveBeenCalled();
        });

        it('reads the permission but never requests it when the preference is false', async () => {
            // The cancel must not drag a permission dialog onto a cold start.
            mockLoadSettings.mockResolvedValue({ notificationsEnabled: false });

            await scheduleDailyReminder();

            expect(mockRequestPermissions).not.toHaveBeenCalled();
        });

        it('cancels the existing reminder by identifier before scheduling', async () => {
            mockLoadSettings.mockResolvedValue({ notificationsEnabled: true });

            await scheduleDailyReminder();

            expect(mockCancelScheduledNotification).toHaveBeenCalledWith(REMINDER_ID);
            expect(mockCancelScheduledNotification.mock.invocationCallOrder[0])
                .toBeLessThan(mockScheduleNotification.mock.invocationCallOrder[0]);
        });

        it('creates a high-importance Android channel on Android', async () => {
            (Platform as { OS: string }).OS = 'android';
            mockLoadSettings.mockResolvedValue({ notificationsEnabled: true });

            await scheduleDailyReminder();

            expect(mockSetNotificationChannel).toHaveBeenCalledWith(CHANNEL_ID, {
                name: 'notifications.channelName',
                importance: 6,
            });
        });

        it('does not create a notification channel on iOS', async () => {
            mockLoadSettings.mockResolvedValue({ notificationsEnabled: true });

            await scheduleDailyReminder();

            expect(mockSetNotificationChannel).not.toHaveBeenCalled();
        });

        it('schedules nothing and reverts the preference when permission is denied', async () => {
            mockLoadSettings.mockResolvedValue({ notificationsEnabled: true });
            mockGetPermissions.mockResolvedValue({ status: 'denied' });

            await scheduleDailyReminder();

            expect(mockScheduleNotification).not.toHaveBeenCalled();
            expect(mockUpdateSetting).toHaveBeenCalledWith('notificationsEnabled', false);
            expect(mockCancelAllNotifications).toHaveBeenCalled();
            expect(mockEmit).toHaveBeenCalledWith('settings');
        });

        it('schedules nothing and reverts the preference when permission is undetermined', async () => {
            // Never asked is not a grant. Scheduling here would register a reminder
            // the OS drops at fire time while the toggle keeps reading "on".
            mockLoadSettings.mockResolvedValue({ notificationsEnabled: true });
            mockGetPermissions.mockResolvedValue({ status: 'undetermined' });

            await scheduleDailyReminder();

            expect(mockScheduleNotification).not.toHaveBeenCalled();
            expect(mockUpdateSetting).toHaveBeenCalledWith('notificationsEnabled', false);
        });

        it('reads the permission and never requests it when granted', async () => {
            mockLoadSettings.mockResolvedValue({ notificationsEnabled: true });
            mockGetPermissions.mockResolvedValue({ status: 'granted' });

            await scheduleDailyReminder();

            expect(mockGetPermissions).toHaveBeenCalled();
            expect(mockRequestPermissions).not.toHaveBeenCalled();
        });

        it('reads the permission and never requests it when not granted', async () => {
            // Scheduling runs at startup, after a language change and after a
            // restore. A request here would raise a system dialog in all three.
            mockLoadSettings.mockResolvedValue({ notificationsEnabled: true });
            mockGetPermissions.mockResolvedValue({ status: 'denied' });

            await scheduleDailyReminder();

            expect(mockGetPermissions).toHaveBeenCalled();
            expect(mockRequestPermissions).not.toHaveBeenCalled();
            expect(mockScheduleNotification).not.toHaveBeenCalled();
        });
    });

    describe('initializeNotifications', () => {
        it('schedules the reminder when the preference is already true', async () => {
            mockLoadSettings.mockResolvedValue({ notificationsEnabled: true });
            mockGetPermissions.mockResolvedValue({ status: 'granted' });

            await initializeNotifications();

            expect(mockScheduleNotification).toHaveBeenCalledTimes(1);
            expect(mockScheduleNotification).toHaveBeenCalledWith(EXPECTED_REQUEST);
        });

        it('does not stack duplicates across repeated startups', async () => {
            mockLoadSettings.mockResolvedValue({ notificationsEnabled: true });
            mockGetPermissions.mockResolvedValue({ status: 'granted' });

            // Fake pending-request store keyed by identifier, the way both platforms
            // key them. Asserts the real no-duplicates property rather than a proxy.
            const pending = new Map<string, unknown>();
            mockScheduleNotification.mockImplementation(async (request: any) => {
                pending.set(request.identifier, request);
                return request.identifier;
            });
            mockCancelScheduledNotification.mockImplementation(async (id: string) => {
                pending.delete(id);
            });

            await initializeNotifications();
            await initializeNotifications();
            await initializeNotifications();

            expect(mockScheduleNotification).toHaveBeenCalledTimes(3);
            expect(pending.size).toBe(1);
            expect(Array.from(pending.keys())).toEqual([REMINDER_ID]);
        });

        it('schedules nothing and never checks permission when the preference is false', async () => {
            mockLoadSettings.mockResolvedValue({ notificationsEnabled: false });

            await initializeNotifications();

            expect(mockScheduleNotification).not.toHaveBeenCalled();
            expect(mockGetPermissions).not.toHaveBeenCalled();
        });

        it('reverts the preference when permission was revoked in OS settings', async () => {
            mockLoadSettings.mockResolvedValue({ notificationsEnabled: true });
            mockGetPermissions.mockResolvedValue({ status: 'denied' });

            await initializeNotifications();

            expect(mockUpdateSetting).toHaveBeenCalledWith('notificationsEnabled', false);
            expect(mockCancelAllNotifications).toHaveBeenCalled();
            expect(mockEmit).toHaveBeenCalledWith('settings');
            expect(mockScheduleNotification).not.toHaveBeenCalled();
        });

        it('never requests permission at startup', async () => {
            mockLoadSettings.mockResolvedValue({ notificationsEnabled: true });
            mockGetPermissions.mockResolvedValue({ status: 'denied' });

            await initializeNotifications();

            expect(mockRequestPermissions).not.toHaveBeenCalled();
        });
    });
});
