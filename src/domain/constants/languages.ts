/**
 * Language Definitions
 *
 * Top 10 most spoken languages globally.
 * Each entry includes ISO 639-1 code, English name, and native name.
 */

import { I18nManager, Platform, Settings } from 'react-native';

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
 * The locales whose bundle is at full key parity with en.json.
 *
 * Two different questions are asked of this module and they have two different
 * answers. SUPPORTED_LANGUAGES is the LOADABLE set: every code storage may
 * legitimately hold, every code isSupportedLanguage accepts, every bundle i18n
 * registers. This list is narrower - the locales a user can be handed without
 * also being handed English.
 *
 * The five that are absent (zh, ar, hi, bn, ur) are partial: ar, hi, bn and ur
 * carry 71 of en.json's 558 keys and zh carries 89. The rest falls back to
 * English key by key, so a screen in one of them is part translated and part
 * English - including the onboarding flow, which those bundles do not cover at
 * all.
 *
 * So neither path that chooses a language offers all ten:
 *  - the automatic path, getDeviceLanguage below, resolves against this list
 *    only, because nobody is there to correct the choice;
 *  - the explicit path, the language picker, takes its rows from
 *    getOfferedLanguages, which adds back only the code the install already
 *    holds - an install on ar keeps seeing ar, and can leave it.
 *
 * SUPPORTED_LANGUAGES stays at ten regardless. Narrowing it would narrow
 * isSupportedLanguage with it, and the load-time sanitizer in loadSettings, the
 * isSupportedLanguage guard in src/data/services/settingsService.ts, would then
 * rewrite a stored `ar` to `en` at the next launch - silently discarding a
 * choice the user made.
 *
 * This list is NOT maintained by hand against the bundles. It is proved against
 * them: src/localization/__tests__/i18n.test.ts derives the set of locales whose
 * key set equals en.json's in both directions and asserts it equals this
 * constant. Completing a bundle without adding its code here fails that test,
 * and the failure says which side is stale. The loadable-versus-offered
 * distinction is held by
 * src/components/settings/__tests__/getOfferedLanguages.test.ts and
 * src/components/settings/__tests__/LanguagePickerModal.offeredLanguages.test.tsx.
 */
export const COMPLETE_LANGUAGE_CODES = ['en', 'es', 'fr', 'pt', 'ru'] as const;

const COMPLETE_CODES = new Set<string>(COMPLETE_LANGUAGE_CODES);

/**
 * Get the device's full locale tag ("en_US", "fr-CI", "zh-Hans_CN"), or null if
 * the platform will not give one up.
 *
 * The region subtag is preserved here deliberately. getDeviceLanguage below drops
 * it because it only wants an ISO 639-1 code, but the number-format profile is
 * region-sensitive, so it needs the whole tag.
 *
 * Both branches go through a public react-native wrapper rather than reading a
 * property off NativeModules directly. The direct read this replaced -
 * `NativeModules.I18nManager?.localeIdentifier` - worked only because the legacy
 * bridge flattens a module's constants onto the module object itself, at
 * node_modules/react-native/Libraries/BatchedBridge/NativeModules.js:65
 * (`Object.assign(module, constants);`). That flattening belongs to the legacy
 * genModule path; the TurboModule spec places the value behind getConstants()
 * (node_modules/react-native/src/private/specs_DEPRECATED/modules/NativeI18nManager.js:18),
 * and under the New Architecture - which app.json enables - NativeModules
 * resolves to global.nativeModuleProxy instead (same file, lines 183-184).
 *
 * The wrappers do not depend on that flattening. I18nManager calls getConstants()
 * itself (node_modules/react-native/Libraries/ReactNative/I18nManager.js:19-21)
 * and Settings reads the same constants object on iOS
 * (node_modules/react-native/Libraries/Settings/Settings.ios.js:22-23,27), and
 * both resolve through TurboModuleRegistry, which prefers __turboModuleProxy and
 * falls back to the legacy proxy
 * (node_modules/react-native/Libraries/TurboModule/TurboModuleRegistry.js:20-36).
 * So the read is the same under either architecture.
 *
 * This is a source-level argument, not a measurement: whether the interop layer
 * flattens constants at runtime is native-side and not readable from here. What
 * covers this function is
 * src/data/__tests__/numberFormatDerivation.test.ts ('getDeviceLocale'), which
 * exercises both branches against the wrapper shapes quoted above.
 */
export function getDeviceLocale(): string | null {
    try {
        if (Platform.OS === 'ios') {
            const locale = Settings.get('AppleLocale');
            if (typeof locale === 'string' && locale.length > 0) {
                return locale;
            }
            const languages = Settings.get('AppleLanguages');
            if (Array.isArray(languages) && typeof languages[0] === 'string' && languages[0].length > 0) {
                return languages[0];
            }
            return null;
        }
        return I18nManager.getConstants().localeIdentifier ?? null;
    } catch {
        // Silently fall back
        return null;
    }
}

/**
 * Get the device's language, falling back to English if the device locale is
 * unsupported OR only partially translated.
 *
 * Resolves against COMPLETE_LANGUAGE_CODES, not SUPPORTED_CODES: this is the
 * automatic path, where nobody chose the language and nobody is there to correct
 * it. isSupportedLanguage keeps using the wider set, so a stored preference and
 * the picker are unaffected.
 */
export function getDeviceLanguage(): string {
    const locale = getDeviceLocale();
    if (locale) {
        // Extract language code from "en_US", "zh-Hans_CN", etc.
        const code = locale.split(/[_-]/)[0].toLowerCase();
        if (COMPLETE_CODES.has(code)) {
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

/**
 * The languages the picker offers: the complete locales, plus whatever the
 * install currently holds.
 *
 * The active code is added back unconditionally, incomplete locale or not,
 * because an install already on `ar` has to be able to find its own language in
 * the list, see it marked as current, and choose something else from there.
 * Withholding it would show that user a picker with nothing selected and no
 * explanation. A code that is in no entry - a value that predates a rename, say
 * - matches nothing and simply yields the complete set.
 *
 * This filters SUPPORTED_LANGUAGES rather than building a list of its own, so
 * declaration order is preserved and there is still exactly one place where the
 * languages themselves are written down.
 */
export function getOfferedLanguages(activeCode: string): LanguageDefinition[] {
    return SUPPORTED_LANGUAGES.filter(
        l => COMPLETE_CODES.has(l.code) || l.code === activeCode,
    );
}
