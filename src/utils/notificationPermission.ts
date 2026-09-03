/**
 * Notification Permission Presentation Rules
 *
 * Pure decisions derived from the OS notification permission status. No side
 * effects and no imports, so the rules are unit-testable directly without
 * standing up expo-notifications, React or a renderer.
 */

/** The three states expo-notifications reports for the notification permission. */
export type NotificationPermissionStatus = 'granted' | 'denied' | 'undetermined';

/**
 * Should the "notifications are blocked" notice be shown under the toggle?
 *
 * Only when the preference is off AND the OS holds an explicit denial.
 *
 * 'undetermined' means the user has never been asked - the normal state of a
 * fresh install - and must not be dressed up as a problem. When the preference
 * is on, the invariant guarantees the permission reads as granted and the
 * reminder is scheduled, so there is nothing to warn about.
 */
export function shouldShowBlockedNotice(
    notificationsEnabled: boolean,
    permissionStatus: NotificationPermissionStatus,
): boolean {
    return !notificationsEnabled && permissionStatus === 'denied';
}
