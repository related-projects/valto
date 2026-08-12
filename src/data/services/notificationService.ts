/**
 * Notification Service
 *
 * Manages notification permissions and scheduling via expo-notifications.
 * Persists enabled/disabled state via settings service.
 *
 * The app is local-first with no server: everything here is a LOCAL notification.
 * No push token is ever obtained, and plugins/withoutApsEnvironment.js deliberately
 * strips the iOS APNs entitlement. Local scheduling needs neither.
 */

import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { dataEvents } from '../../core/events/dataEvents';
import i18n from '../../localization/i18n';
import { loadSettings, updateSetting } from './settingsService';

// ─── Daily Reminder Constants ─────────────────────────────────────────

/**
 * Stable identifier for the one and only scheduled notification.
 * Reusing it is what makes rescheduling idempotent - see scheduleDailyReminder.
 */
const DAILY_REMINDER_ID = 'valto-daily-spending-reminder';

/** Device local time. Fixed for v1, not user-configurable. */
const DAILY_REMINDER_HOUR = 18;
const DAILY_REMINDER_MINUTE = 0;

/** Android notification channel. Ignored on iOS. */
const ANDROID_REMINDER_CHANNEL_ID = 'daily-reminder';

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

    // Idempotent - skip write if value unchanged
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

        // Order matters: scheduleDailyReminder re-reads the preference and bails
        // when it is false, so the write above has to land first.
        await scheduleDailyReminder();

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

// ─── Foreground Presentation ──────────────────────────────────────────

/**
 * Register the handler that decides how a notification arriving while the app is
 * FOREGROUNDED is presented. Without it expo-notifications defaults to not showing
 * the notification at all, so a user with the app open would silently miss it.
 *
 * Call once at app startup, before any notification can fire.
 */
export function configureNotificationHandler(): void {
    Notifications.setNotificationHandler({
        handleNotification: async () => ({
            // shouldShowAlert is deprecated in expo-notifications 0.32; banner + list
            // are its replacements.
            shouldShowBanner: true,
            shouldShowList: true,
            shouldPlaySound: true,
            shouldSetBadge: false,
        }),
    });
}

// ─── Scheduling ───────────────────────────────────────────────────────

/**
 * Create (or update) the Android channel the reminder is delivered on.
 * Android requires a channel with a high importance for a heads-up notification;
 * without one the reminder lands silently in the drawer.
 *
 * No-op on iOS. Idempotent: re-calling with the same id updates the channel's
 * user-visible name, which is the one field Android allows changing after creation,
 * so the name follows a language change.
 */
async function ensureAndroidReminderChannel(): Promise<void> {
    if (Platform.OS !== 'android') return;

    await Notifications.setNotificationChannelAsync(ANDROID_REMINDER_CHANNEL_ID, {
        name: i18n.t('notifications.channelName'),
        importance: Notifications.AndroidImportance.HIGH,
    });
}

/**
 * Schedule the daily spending reminder at DAILY_REMINDER_HOUR, device local time.
 * Only works if notifications are enabled.
 *
 * UNCONDITIONAL BY DESIGN: this fires every day whether or not the user already
 * recorded a transaction. A normal day holds three to six expenses, so "already
 * recorded something today" does not mean "done for today" - suppressing the
 * reminder would silence it for exactly the user who started and did not finish.
 * The app cannot know whether the day is complete, so it does not guess. A fixed
 * daily prompt also builds a habit, which an intermittent one cannot.
 *
 * IDEMPOTENT: repeated calls never stack duplicates. Two independent guarantees -
 * the request carries a stable identifier (both platforms key pending requests by
 * it, so a re-schedule replaces), and the slot is explicitly cancelled first.
 */
export async function scheduleDailyReminder(): Promise<void> {
    const settings = await loadSettings();
    if (!settings.notificationsEnabled) return;

    await ensureAndroidReminderChannel();

    await Notifications.cancelScheduledNotificationAsync(DAILY_REMINDER_ID);

    await Notifications.scheduleNotificationAsync({
        identifier: DAILY_REMINDER_ID,
        content: {
            title: i18n.t('notifications.dailyReminder.title'),
            body: i18n.t('notifications.dailyReminder.body'),
        },
        // The OS resolves hour/minute in device local time and recomputes it across
        // DST, so there is no timestamp arithmetic to drift.
        trigger: {
            type: Notifications.SchedulableTriggerInputTypes.DAILY,
            channelId: ANDROID_REMINDER_CHANNEL_ID,
            hour: DAILY_REMINDER_HOUR,
            minute: DAILY_REMINDER_MINUTE,
        },
    });
}

/**
 * Cancel all scheduled notifications.
 */
export async function cancelAllNotifications(): Promise<void> {
    await Notifications.cancelAllScheduledNotificationsAsync();
}

// ─── Startup ──────────────────────────────────────────────────────────

/**
 * Bring scheduled notifications in line with the stored preference at app startup.
 *
 * Re-verifies permission, because a user can revoke it in OS settings while
 * notificationsEnabled stays true in storage. When that happens the preference is
 * reverted rather than left on: a switch that reads "on" while nothing can fire is
 * the exact silent failure this reminder exists to avoid. Reverting also routes the
 * user back through the normal toggle, which surfaces the existing "blocked by your
 * device settings" alert.
 *
 * Only ever reads permission - never requests it - so launching the app cannot
 * raise an OS prompt.
 */
export async function initializeNotifications(): Promise<void> {
    const settings = await loadSettings();
    if (!settings.notificationsEnabled) return;

    const { status } = await Notifications.getPermissionsAsync();

    if (status !== 'granted') {
        // Reuses the tested disable path: cancels, persists false, emits 'settings'.
        await setNotificationsEnabled(false);
        return;
    }

    await scheduleDailyReminder();
}
