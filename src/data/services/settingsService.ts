/**
 * Settings Service
 *
 * Pure persistence layer for app-level settings.
 * Uses the existing storage abstraction - no direct AsyncStorage access.
 */

import { DEFAULT_CURRENCY_CODE } from '../../domain/constants/currencies';
import { dateFormatForLocale } from '../../domain/constants/dateFormats';
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
 * `dateFormat` derives here for the same reason (V-101). The marker
 * `dateFormatLocaleApplied` is set with it: the format is already the locale's,
 * so the one-time switch in loadSettings must never run on this install - a
 * French install that later picks MM/DD/YYYY keeps it.
 *
 * Deliberately NOT used by the catch path in loadSettings: a transient storage
 * read failure is not a first launch, and re-deriving there could flip a chosen
 * format or language on a bad read.
 */
export function getInitialSettings(): AppSettings {
    const locale = getDeviceLocale();
    return {
        ...getDefaultSettings(),
        language: getDeviceLanguage(),
        decimalSeparator: numberFormatForLocale(locale),
        dateFormat: dateFormatForLocale(locale),
        dateFormatLocaleApplied: true,
    };
}

// ─── Validation Helpers ───────────────────────────────────────────────

const VALID_DATE_FORMATS: DateFormatPreference[] = ['DD/MM/YYYY', 'MM/DD/YYYY', 'YYYY-MM-DD'];
const VALID_FIRST_DAYS: FirstDayOfWeek[] = ['monday', 'sunday'];
const VALID_DECIMAL_SEPS: DecimalSeparator[] = NUMBER_FORMAT_PROFILES;

// --- One-time date-format switch (V-101) -----------------------------------

/**
 * App languages whose installs are moved off a stored MM/DD/YYYY, once.
 *
 * 1.1.3 and earlier wrote the static 'MM/DD/YYYY' into every blob at onboarding,
 * so on an install in one of these languages that value was almost never a
 * choice. Switching it is an accepted exception to registry policy no. 10, on
 * the ground of V-105 decision 6 (V-101, Owner decision 1, pass 78). The set is
 * the decision's, not a derivation: other languages are left as stored.
 */
const DATE_FORMAT_SWITCH_LANGUAGES = new Set(['fr', 'es', 'pt', 'ru']);

/** The switch in flight, shared by every load that starts while it runs. */
let dateFormatSwitchInFlight: Promise<Partial<AppSettings> | null> | null = null;

/**
 * Run the one-time switch on the stored blob and return the blob as it now
 * stands (null when nothing is stored).
 *
 * Once only, because the marker is written in the same blob, by the same write,
 * as the switched format. A load that finds the marker never comes here, and
 * every writer in this file starts from loadSettings, so the marker is carried
 * into every later write: a user who sets MM/DD/YYYY again keeps it.
 *
 * The marker is set on EVERY unmarked blob, whatever its language, so the
 * switch belongs to the update and not to a later language change.
 *
 * Single-flight, and re-reading before it writes: settings are loaded from many
 * places at boot, and two loads writing the switch independently could land the
 * second write on top of a writer that had already moved on. A load that starts
 * after the switch has landed finds the marker in its fresh read and writes
 * nothing.
 *
 * A failed write is logged and the switched blob still returned, unpersisted:
 * the load must not fall to the catch path (and the defaults) over it, and the
 * next load simply runs the switch again.
 */
function applyDateFormatSwitchOnce(): Promise<Partial<AppSettings> | null> {
    if (!dateFormatSwitchInFlight) {
        dateFormatSwitchInFlight = (async () => {
            const current = await asyncStorageAdapter.get<Partial<AppSettings>>(StorageKeys.SETTINGS);
            if (!current || current.dateFormatLocaleApplied === true) {
                return current;
            }

            const next: Partial<AppSettings> = { ...current, dateFormatLocaleApplied: true };

            // The format this blob loads as today: an absent or invalid value
            // is sanitised to MM/DD/YYYY by loadSettings.
            const effectiveFormat = current.dateFormat !== undefined && VALID_DATE_FORMATS.includes(current.dateFormat)
                ? current.dateFormat
                : 'MM/DD/YYYY';
            if (
                typeof current.language === 'string'
                && DATE_FORMAT_SWITCH_LANGUAGES.has(current.language)
                && effectiveFormat === 'MM/DD/YYYY'
            ) {
                next.dateFormat = 'DD/MM/YYYY';
            }

            try {
                await asyncStorageAdapter.set(StorageKeys.SETTINGS, next);
            } catch (error) {
                console.warn('[settings] Date-format switch not persisted:', error);
            }
            return next;
        })().finally(() => {
            dateFormatSwitchInFlight = null;
        });
    }
    return dateFormatSwitchInFlight;
}

// ─── Load ─────────────────────────────────────────────────────────────

/**
 * Load settings from storage.
 * Returns defaults for any missing fields (forward-compatible).
 * Validates stored values and sanitizes corrupted data.
 */
export async function loadSettings(): Promise<AppSettings> {
    try {
        let stored = await asyncStorageAdapter.get<Partial<AppSettings>>(StorageKeys.SETTINGS);
        if (!stored) {
            // Nothing has ever been persisted: first launch, and the only moment
            // the device locale is allowed to choose the number-format profile.
            return getInitialSettings();
        }
        if (stored.dateFormatLocaleApplied !== true) {
            // A blob from before the marker existed: the one-time switch (V-101).
            stored = await applyDateFormatSwitchOnce();
            if (!stored) {
                return getInitialSettings();
            }
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
