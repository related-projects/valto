/**
 * Language Definitions
 *
 * Top 10 most spoken languages globally.
 * Each entry includes ISO 639-1 code, English name, and native name.
 */

import { NativeModules, Platform } from 'react-native';

export interface LanguageDefinition {
    /** ISO 639-1 language code */
    code: string;
    /** English name */
    name: string;
    /** Name in the language itself */
    nativeName: string;
}

export const SUPPORTED_LANGUAGES: LanguageDefinition[] = [
    { code: 'en', name: 'English', nativeName: 'English' },
    { code: 'zh', name: 'Mandarin Chinese', nativeName: '中文' },
    { code: 'hi', name: 'Hindi', nativeName: 'हिन्दी' },
    { code: 'es', name: 'Spanish', nativeName: 'Español' },
    { code: 'fr', name: 'French', nativeName: 'Français' },
    { code: 'ar', name: 'Arabic', nativeName: 'العربية' },
    { code: 'bn', name: 'Bengali', nativeName: 'বাংলা' },
    { code: 'pt', name: 'Portuguese', nativeName: 'Português' },
    { code: 'ru', name: 'Russian', nativeName: 'Русский' },
    { code: 'ur', name: 'Urdu', nativeName: 'اردو' },
];

export const DEFAULT_LANGUAGE_CODE = 'en';

const SUPPORTED_CODES = new Set(SUPPORTED_LANGUAGES.map(l => l.code));

/**
 * Get the device's full locale tag ("en_US", "fr-CI", "zh-Hans_CN"), or null if
 * the platform will not give one up.
 *
 * The region subtag is preserved here deliberately. getDeviceLanguage below drops
 * it because it only wants an ISO 639-1 code, but the number-format profile is
 * region-sensitive, so it needs the whole tag.
 */
export function getDeviceLocale(): string | null {
    try {
        if (Platform.OS === 'ios') {
            return NativeModules.SettingsManager?.settings?.AppleLocale
                ?? NativeModules.SettingsManager?.settings?.AppleLanguages?.[0]
                ?? null;
        }
        return NativeModules.I18nManager?.localeIdentifier ?? null;
    } catch {
        // Silently fall back
        return null;
    }
}

/**
 * Get the device's language, falling back to English if unsupported.
 */
export function getDeviceLanguage(): string {
    const locale = getDeviceLocale();
    if (locale) {
        // Extract language code from "en_US", "zh-Hans_CN", etc.
        const code = locale.split(/[_-]/)[0].toLowerCase();
        if (SUPPORTED_CODES.has(code)) {
            return code;
        }
    }
    return DEFAULT_LANGUAGE_CODE;
}

/**
 * Get a language definition by code.
 * Returns English if code is not found.
 */
export function getLanguageByCode(code: string): LanguageDefinition {
    return SUPPORTED_LANGUAGES.find(l => l.code === code)
        ?? SUPPORTED_LANGUAGES[0];
}

/**
 * Check if a language code is supported.
 */
export function isSupportedLanguage(code: string): boolean {
    return SUPPORTED_CODES.has(code);
}
