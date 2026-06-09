/**
 * getGreeting — Pure, deterministic greeting based on time of day.
 *
 * Returns an i18n key (not a raw string) so the UI remains localization-ready.
 *
 * Time ranges:
 *   05:00–11:59  → 'dashboard.greetings.morning'
 *   12:00–16:59  → 'dashboard.greetings.afternoon'
 *   17:00–21:59  → 'dashboard.greetings.evening'
 *   22:00–04:59  → 'dashboard.greetings.night'
 */

export type GreetingKey =
    | 'dashboard.greetings.morning'
    | 'dashboard.greetings.afternoon'
    | 'dashboard.greetings.evening'
    | 'dashboard.greetings.night';

export function getGreeting(date: Date): GreetingKey {
    const hour = date.getHours();

    if (hour >= 5 && hour < 12) {
        return 'dashboard.greetings.morning';
    }
    if (hour >= 12 && hour < 17) {
        return 'dashboard.greetings.afternoon';
    }
    if (hour >= 17 && hour < 22) {
        return 'dashboard.greetings.evening';
    }
    return 'dashboard.greetings.night';
}
