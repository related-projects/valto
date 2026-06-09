/**
 * Settings Service
 *
 * Pure persistence layer for app-level settings.
 * Uses the existing storage abstraction — no direct AsyncStorage access.
 */

import { DEFAULT_CURRENCY_CODE } from '../../domain/constants/currencies';
import { DEFAULT_LANGUAGE_CODE, getDeviceLanguage, isSupportedLanguage } from '../../domain/constants/languages';
import { asyncStorageAdapter, StorageKeys } from '../storage';

// ─── Types ────────────────────────────────────────────────────────────

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

// ─── Defaults ─────────────────────────────────────────────────────────

export function getDefaultSettings(): AppSettings {
    return {
        theme: 'system',
        currency: DEFAULT_CURRENCY_CODE,
        currencyLocked: false,
        notificationsEnabled: false,
        language: getDeviceLanguage(),
        dateFormat: 'MM/DD/YYYY',
        firstDayOfWeek: 'monday',
        decimalSeparator: 'dot',
        onboardingCompleted: false,
    };
}

// ─── Validation Helpers ───────────────────────────────────────────────

const VALID_DATE_FORMATS: DateFormatPreference[] = ['DD/MM/YYYY', 'MM/DD/YYYY', 'YYYY-MM-DD'];
const VALID_FIRST_DAYS: FirstDayOfWeek[] = ['monday', 'sunday'];
const VALID_DECIMAL_SEPS: DecimalSeparator[] = ['dot', 'comma'];

// ─── Load ─────────────────────────────────────────────────────────────

/**
 * Load settings from storage.
 * Returns defaults for any missing fields (forward-compatible).
 * Validates stored values and sanitizes corrupted data.
 */
export async function loadSettings(): Promise<AppSettings> {
    try {
        const stored = await asyncStorageAdapter.get<Partial<AppSettings>>(StorageKeys.SETTINGS);
        if (!stored) {
            return getDefaultSettings();
        }
        const defaults = getDefaultSettings();
        const merged = { ...defaults, ...stored };

        // Validate language — fall back if corrupted
        if (typeof merged.language !== 'string' || !isSupportedLanguage(merged.language)) {
            merged.language = DEFAULT_LANGUAGE_CODE;
        }

        // Validate theme
        if (!['light', 'dark', 'system'].includes(merged.theme)) {
            merged.theme = 'system';
        }

        // Validate booleans
        if (typeof merged.currencyLocked !== 'boolean') {
            merged.currencyLocked = false;
        }
        if (typeof merged.notificationsEnabled !== 'boolean') {
            merged.notificationsEnabled = false;
        }

        // Validate regional settings
        if (!VALID_DATE_FORMATS.includes(merged.dateFormat)) {
            merged.dateFormat = 'MM/DD/YYYY';
        }
        if (!VALID_FIRST_DAYS.includes(merged.firstDayOfWeek)) {
            merged.firstDayOfWeek = 'monday';
        }
        if (!VALID_DECIMAL_SEPS.includes(merged.decimalSeparator)) {
            merged.decimalSeparator = 'dot';
        }

        // Validate onboardingCompleted
        if (typeof merged.onboardingCompleted !== 'boolean') {
            merged.onboardingCompleted = false;
        }

        return merged;
    } catch {
        return getDefaultSettings();
    }
}

// ─── Save ─────────────────────────────────────────────────────────────

/**
 * Save full settings object to storage.
 */
export async function saveSettings(settings: AppSettings): Promise<void> {
    await asyncStorageAdapter.set(StorageKeys.SETTINGS, settings);
}

// ─── Partial Update ───────────────────────────────────────────────────

/**
 * Update a single setting and persist.
 * Enforces currency lock: if currencyLocked is true, currency cannot be changed.
 */
export async function updateSetting<K extends keyof AppSettings>(
    key: K,
    value: AppSettings[K],
): Promise<AppSettings> {
    const current = await loadSettings();

    // Enforce currency immutability
    if (key === 'currency' && current.currencyLocked) {
        throw new Error('Currency cannot be changed once selected.');
    }

    const updated = { ...current, [key]: value };
    await saveSettings(updated);
    return updated;
}

/**
 * Select currency and lock it permanently.
 * This is the only way to set the currency for the first time.
 */
export async function selectAndLockCurrency(code: string): Promise<AppSettings> {
    const current = await loadSettings();

    if (current.currencyLocked) {
        throw new Error('Currency cannot be changed once selected.');
    }

    const updated: AppSettings = {
        ...current,
        currency: code,
        currencyLocked: true,
    };
    await saveSettings(updated);
    return updated;
}

/**
 * Unlock the currency and set a new one, then re-lock.
 * Used for the "Reset Base Currency" dangerous operation.
 */
export async function unlockAndResetCurrency(newCode: string): Promise<AppSettings> {
    const current = await loadSettings();

    const updated: AppSettings = {
        ...current,
        currency: newCode,
        currencyLocked: true,
    };
    await saveSettings(updated);
    return updated;
}
