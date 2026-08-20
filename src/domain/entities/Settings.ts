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

/**
 * Number-format profile: the whole typographic convention a monetary string
 * follows, not just its decimal character. Each value selects a grouping
 * character, a decimal character, a currency-symbol side and a symbol gap - see
 * NUMBER_FORMATS in src/domain/constants/numberFormats.
 *
 *   dot   -> 1,234.56   $1,234.56
 *   comma -> 1.234,56   1.234,56 EUR
 *   space -> 1 234,56   2 000 FCFA
 */
export type NumberFormatProfile = 'dot' | 'comma' | 'space';

/**
 * Historical name for NumberFormatProfile, kept because the persisted settings
 * key is still `decimalSeparator` and several modules import this type.
 */
export type DecimalSeparator = NumberFormatProfile;

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
    /**
     * Number-format profile for monetary display. The key keeps its original
     * name so stored settings from every existing install still resolve; the
     * value now selects grouping, decimal, symbol side and symbol gap together.
     */
    decimalSeparator: NumberFormatProfile;
    /** Whether the user has completed the onboarding flow */
    onboardingCompleted: boolean;
}
