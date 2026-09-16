/**
 * Device-locale mock for the `react-native` module.
 *
 * getDeviceLocale (src/domain/constants/languages.ts) reads the device locale
 * through two public react-native wrappers rather than off NativeModules:
 * I18nManager.getConstants().localeIdentifier on Android, and
 * Settings.get('AppleLocale') / Settings.get('AppleLanguages') on iOS. Four test
 * suites hand-roll a jest.mock('react-native', ...) factory and each supplied
 * only NativeModules, so each would otherwise need the same two wrapper shapes
 * pasted in and kept in step.
 *
 * This builds just those wrappers, plus the Platform.OS the branch reads. Every
 * suite spreads the result and adds whatever else it needs (Alert, AppState,
 * Linking); nothing here is opinionated about the rest of react-native.
 *
 * The ref is supplied as a function and called on every read, never captured.
 * Two reasons, and the second is not optional: a test can move the device between
 * platforms or locales between launches without re-mocking the module, AND the
 * jest.mock factory is free to close over a `const` declared below it. jest
 * hoists the factory above that declaration, so a factory that dereferences the
 * ref eagerly reads it inside its temporal dead zone.
 */

export interface DeviceLocaleRef {
    /** Platform the branch in getDeviceLocale should take. */
    os: 'ios' | 'android';
    /** Locale tag the device reports, or null when it will not give one up. */
    value: string | null;
}

/** Shape of the react-native surface getDeviceLocale touches. */
export interface DeviceLocaleMock {
    Platform: { OS: string };
    I18nManager: {
        getConstants: () => {
            isRTL: boolean;
            doLeftAndRightSwapInRTL: boolean;
            localeIdentifier: string | null;
        };
    };
    Settings: { get: (key: string) => unknown };
}

/**
 * Build the react-native locale surface backed by whatever `readRef` returns.
 *
 * Mirrors the real wrappers: Settings.get returns undefined for a key the native
 * settings object does not carry (Settings.ios.js reads `this._settings[key]`),
 * and localeIdentifier is nullable on the I18nManager constants type.
 */
export function createDeviceLocaleMock(readRef: () => DeviceLocaleRef): DeviceLocaleMock {
    return {
        Platform: {
            get OS() {
                return readRef().os;
            },
        },
        I18nManager: {
            getConstants: () => ({
                isRTL: false,
                doLeftAndRightSwapInRTL: true,
                localeIdentifier: readRef().value,
            }),
        },
        Settings: {
            get: (key: string) => {
                const { value } = readRef();
                if (key === 'AppleLocale') {
                    return value ?? undefined;
                }
                if (key === 'AppleLanguages') {
                    return value === null ? [] : [value];
                }
                return undefined;
            },
        },
    };
}
