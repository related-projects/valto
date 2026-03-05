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
 * Get the device's language, falling back to English if unsupported.
 */
export function getDeviceLanguage(): string {
    try {
        let locale: string | undefined;

        if (Platform.OS === 'ios') {
            locale = NativeModules.SettingsManager?.settings?.AppleLocale
                ?? NativeModules.SettingsManager?.settings?.AppleLanguages?.[0];
        } else {
            locale = NativeModules.I18nManager?.localeIdentifier;
        }

        if (locale) {
            // Extract language code from "en_US", "zh-Hans_CN", etc.
            const code = locale.split(/[_-]/)[0].toLowerCase();
            if (SUPPORTED_CODES.has(code)) {
                return code;
            }
        }
    } catch {
        // Silently fall back
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
