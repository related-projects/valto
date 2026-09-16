/**
 * Settings Service
 *
 * Pure persistence layer for app-level settings.
 * Uses the existing storage abstraction - no direct AsyncStorage access.
 */

import { DEFAULT_CURRENCY_CODE } from '../../domain/constants/currencies';
import { DEFAULT_LANGUAGE_CODE, getDeviceLanguage, getDeviceLocale, isSupportedLanguage } from '../../domain/constants/languages';
import { DEFAULT_NUMBER_FORMAT, NUMBER_FORMAT_PROFILES, numberFormatForLocale } from '../../domain/constants/numberFormats';
import { asyncStorageAdapter, StorageKeys } from '../storage';

// ─── Types ────────────────────────────────────────────────────────────
// Settings types live in the domain layer. Re-exported here for backward
// compatibility with existing importers of this service.

export type {
    AppSettings,
    DateFormatPreference,
    DecimalSeparator,
    FirstDayOfWeek,
    ThemePreference,
} from '../../domain/entities/Settings';

import type { AppSettings, DateFormatPreference, DecimalSeparator, FirstDayOfWeek } from '../../domain/entities/Settings';

// ─── Defaults ─────────────────────────────────────────────────────────

export function getDefaultSettings(): AppSettings {
    return {
        theme: 'system',
        currency: DEFAULT_CURRENCY_CODE,
        currencyLocked: false,
        notificationsEnabled: false,
        language: DEFAULT_LANGUAGE_CODE,
        dateFormat: 'MM/DD/YYYY',
        firstDayOfWeek: 'monday',
        decimalSeparator: DEFAULT_NUMBER_FORMAT,
        onboardingCompleted: false,
    };
}

/**
 * Settings for an install that has never stored any.
 *
 * This is the ONLY place the device reaches ANY setting, and it runs on exactly
 * one condition: the settings storage key is absent, which by definition is
 * first launch. Every later load takes the merge path in loadSettings, where a
 * stored value overrides the default, so a user's explicit choice can never be
 * overwritten by their device - not on a language change, not on a device
 * migration, not on an app update.
 *
 * `language` derives here rather than in getDefaultSettings for exactly that
 * reason. getDefaultSettings is the merge base at every subsequent load AND the
 * catch-path return, so a device read placed there runs on paths that are not a
 * first launch; it was only ever harmless because a stored `language` shadows it.
 * Placing it here makes the paragraph above true of the whole blob rather than of
 * one field.
 *
 * Deliberately NOT used by the catch path in loadSettings: a transient storage
 * read failure is not a first launch, and re-deriving there could flip a chosen
 * format or language on a bad read.
 */
export function getInitialSettings(): AppSettings {
    return {
        ...getDefaultSettings(),
        language: getDeviceLanguage(),
        decimalSeparator: numberFormatForLocale(getDeviceLocale()),
    };
}

// ─── Validation Helpers ───────────────────────────────────────────────

const VALID_DATE_FORMATS: DateFormatPreference[] = ['DD/MM/YYYY', 'MM/DD/YYYY', 'YYYY-MM-DD'];
const VALID_FIRST_DAYS: FirstDayOfWeek[] = ['monday', 'sunday'];
const VALID_DECIMAL_SEPS: DecimalSeparator[] = NUMBER_FORMAT_PROFILES;

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
            // Nothing has ever been persisted: first launch, and the only moment
            // the device locale is allowed to choose the number-format profile.
            return getInitialSettings();
        }
        const defaults = getDefaultSettings();
        const merged = { ...defaults, ...stored };

        // Validate language - fall back if corrupted
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
            merged.decimalSeparator = DEFAULT_NUMBER_FORMAT;
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
 * Set the base currency during onboarding.
 *
 * The lock is deliberately NOT applied here. It exists to stop the base currency
 * changing once financial data is denominated in it, and until onboarding
 * completes no wallet and no transaction exist - so the user is free to step
 * back and choose again. `lockCurrency` applies the lock at the end of the flow.
 *
 * Writing `currencyLocked: false` also self-heals installs that an earlier build
 * left locked mid-flow: those had no usable path forward at all.
 */
export async function setOnboardingCurrency(code: string): Promise<AppSettings> {
    const current = await loadSettings();

    if (current.onboardingCompleted) {
        throw new Error('Currency cannot be changed once selected.');
    }

    const updated: AppSettings = {
        ...current,
        currency: code,
        currencyLocked: false,
    };
    await saveSettings(updated);
    return updated;
}

/**
 * Lock the base currency. Called once onboarding completes, which is the point
 * at which the first wallet exists and the currency becomes load-bearing.
 * Idempotent.
 */
export async function lockCurrency(): Promise<AppSettings> {
    const current = await loadSettings();

    if (current.currencyLocked) {
        return current;
    }

    const updated: AppSettings = {
        ...current,
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
