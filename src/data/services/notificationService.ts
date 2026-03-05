/**
 * Notification Service
 *
 * Manages notification permissions and scheduling via expo-notifications.
 * Persists enabled/disabled state via settings service.
 */

import * as Notifications from 'expo-notifications';
import { dataEvents } from '../../core/events/dataEvents';
import { loadSettings, updateSetting } from './settingsService';

/**
 * Get the current notification enabled state.
 */
export async function isNotificationsEnabled(): Promise<boolean> {
    const settings = await loadSettings();
    return settings.notificationsEnabled;
}

/**
 * Request notification permissions from the OS.
 * Returns true if granted, false otherwise.
 */
export async function requestPermissions(): Promise<boolean> {
    const { status: existingStatus } = await Notifications.getPermissionsAsync();

    if (existingStatus === 'granted') {
        return true;
    }

    const { status } = await Notifications.requestPermissionsAsync();
    return status === 'granted';
}

/**
 * Toggle notification preference.
 * When enabling: requests permission first, only enables if granted.
 * When disabling: cancels all scheduled notifications and updates setting.
 *
 * Returns { enabled, permissionDenied } to let the caller handle UI feedback.
 */
export async function setNotificationsEnabled(
    enabled: boolean
): Promise<{ enabled: boolean; permissionDenied: boolean }> {
    const current = await loadSettings();

    // Idempotent — skip write if value unchanged
    if (current.notificationsEnabled === enabled) {
        return { enabled, permissionDenied: false };
    }

    if (enabled) {
        // Request permission before enabling
        const granted = await requestPermissions();

        if (!granted) {
            return { enabled: false, permissionDenied: true };
        }

        await updateSetting('notificationsEnabled', true);
        dataEvents.emit('settings');
        return { enabled: true, permissionDenied: false };
    } else {
        // Cancel all scheduled notifications when disabling
        await cancelAllNotifications();
        await updateSetting('notificationsEnabled', false);
        dataEvents.emit('settings');
        return { enabled: false, permissionDenied: false };
    }
}

// ─── Scheduling ───────────────────────────────────────────────────────

/**
 * Schedule a local notification.
 * Only works if notifications are enabled.
 */
export async function scheduleLocalNotification(
    title: string,
    body: string,
    triggerMs: number,
): Promise<void> {
    const settings = await loadSettings();
    if (!settings.notificationsEnabled) return;

    await Notifications.scheduleNotificationAsync({
        content: { title, body },
        trigger: { type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds: Math.max(1, Math.floor(triggerMs / 1000)) },
    });
}

/**
 * Cancel all scheduled notifications.
 */
export async function cancelAllNotifications(): Promise<void> {
    await Notifications.cancelAllScheduledNotificationsAsync();
}
