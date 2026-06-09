/**
 * Notification Service Edge Case Tests
 *
 * Tests permission handling, idempotent toggling,
 * scheduling behavior, and cancellation.
 */

const mockGetPermissions = jest.fn();
const mockRequestPermissions = jest.fn();
const mockScheduleNotification = jest.fn();
const mockCancelAllNotifications = jest.fn();

jest.mock('expo-notifications', () => ({
    getPermissionsAsync: () => mockGetPermissions(),
    requestPermissionsAsync: () => mockRequestPermissions(),
    scheduleNotificationAsync: (...args: any[]) => mockScheduleNotification(...args),
    cancelAllScheduledNotificationsAsync: () => mockCancelAllNotifications(),
    SchedulableTriggerInputTypes: { TIME_INTERVAL: 'timeInterval' },
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

import {
    setNotificationsEnabled,
    requestPermissions,
    scheduleLocalNotification,
} from '../notificationService';

describe('notificationService', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockUpdateSetting.mockResolvedValue(undefined);
        mockCancelAllNotifications.mockResolvedValue(undefined);
        mockScheduleNotification.mockResolvedValue(undefined);
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
        });

        it('enables when permission granted', async () => {
            mockLoadSettings.mockResolvedValue({ notificationsEnabled: false });
            mockGetPermissions.mockResolvedValue({ status: 'granted' });

            const result = await setNotificationsEnabled(true);
            expect(result).toEqual({ enabled: true, permissionDenied: false });
            expect(mockUpdateSetting).toHaveBeenCalledWith('notificationsEnabled', true);
            expect(mockEmit).toHaveBeenCalledWith('settings');
        });

        it('cancels all notifications when disabling', async () => {
            mockLoadSettings.mockResolvedValue({ notificationsEnabled: true });

            const result = await setNotificationsEnabled(false);
            expect(result).toEqual({ enabled: false, permissionDenied: false });
            expect(mockCancelAllNotifications).toHaveBeenCalled();
            expect(mockUpdateSetting).toHaveBeenCalledWith('notificationsEnabled', false);
            expect(mockEmit).toHaveBeenCalledWith('settings');
        });
    });

    describe('scheduleLocalNotification', () => {
        it('schedules when notifications enabled', async () => {
            mockLoadSettings.mockResolvedValue({ notificationsEnabled: true });

            await scheduleLocalNotification('Test', 'Body', 60000);

            expect(mockScheduleNotification).toHaveBeenCalledWith({
                content: { title: 'Test', body: 'Body' },
                trigger: { type: 'timeInterval', seconds: 60 },
            });
        });

        it('does not schedule when notifications disabled', async () => {
            mockLoadSettings.mockResolvedValue({ notificationsEnabled: false });

            await scheduleLocalNotification('Test', 'Body', 60000);

            expect(mockScheduleNotification).not.toHaveBeenCalled();
        });

        it('enforces minimum 1 second trigger', async () => {
            mockLoadSettings.mockResolvedValue({ notificationsEnabled: true });

            await scheduleLocalNotification('Test', 'Body', 100); // 100ms

            expect(mockScheduleNotification).toHaveBeenCalledWith(
                expect.objectContaining({
                    trigger: expect.objectContaining({ seconds: 1 }),
                })
            );
        });
    });
});
