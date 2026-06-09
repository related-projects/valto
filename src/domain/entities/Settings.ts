/**
 * App Settings Entity
 *
 * Pure domain model for app-level user settings. UI- and storage-agnostic.
 * Persistence lives in src/data/services/settingsService; validation in
 * src/domain/validators/SettingsValidator.
 */

export type ThemePreference = 'light' | 'dark' | 'system';
export type DateFormatPreference = 'DD/MM/YYYY' | 'MM/DD/YYYY' | 'YYYY-MM-DD';
export type FirstDayOfWeek = 'monday' | 'sunday';
export type DecimalSeparator = 'dot' | 'comma';

export interface AppSettings {
    /** User's theme preference */
    theme: ThemePreference;
    /** ISO 4217 currency code */
    currency: string;
    /** Whether the currency selection is locked (cannot be changed) */
    currencyLocked: boolean;
    /** Whether notifications are enabled */
    notificationsEnabled: boolean;
    /** ISO 639-1 language code */
    language: string;
    /** Date display format */
    dateFormat: DateFormatPreference;
    /** First day of the week for calendars and reports */
    firstDayOfWeek: FirstDayOfWeek;
    /** Decimal separator for monetary display */
    decimalSeparator: DecimalSeparator;
    /** Whether the user has completed the onboarding flow */
    onboardingCompleted: boolean;
}
