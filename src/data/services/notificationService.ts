/**
 * Notification Service
 *
 * Abstraction for notification preferences.
 * Currently only persists the enabled/disabled preference.
 * Designed so adding expo-notifications scheduling later requires no refactor.
 */

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
 * Toggle notification preference and emit event.
 * Idempotent: setting the same value twice is a no-op at the event level.
 */
export async function setNotificationsEnabled(enabled: boolean): Promise<boolean> {
    const current = await loadSettings();

    // Idempotent — skip write if value unchanged
    if (current.notificationsEnabled === enabled) {
        return enabled;
    }

    await updateSetting('notificationsEnabled', enabled);
    dataEvents.emit('settings');
    return enabled;
}

// ─── Future Integration Stubs ─────────────────────────────────────────
// These stubs exist so the interface is ready for expo-notifications.
// They are intentionally no-ops for now.

/**
 * Schedule a local notification.
 * Stub — will integrate with expo-notifications in a future phase.
 */
export async function scheduleLocalNotification(
    _title: string,
    _body: string,
    _triggerMs: number,
): Promise<void> {
    // No-op until expo-notifications is integrated
}

/**
 * Cancel all scheduled notifications.
 * Stub — will integrate with expo-notifications in a future phase.
 */
export async function cancelAllNotifications(): Promise<void> {
    // No-op until expo-notifications is integrated
}
