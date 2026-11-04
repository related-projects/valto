/**
 * Date-format derivation tests (REGISTRE V-101).
 *
 * Two behaviours, held apart for the same reason numberFormatDerivation.test.ts
 * holds them apart:
 *
 *  1. First launch: the date format comes from the device locale, at the one
 *     place the device is allowed to speak (getInitialSettings).
 *  2. Existing installs: 1.1.3 and earlier wrote the static 'MM/DD/YYYY' into
 *     every blob, so on an install whose app language is fr, es, pt or ru that
 *     value was almost never a choice. Such an install is switched to
 *     'DD/MM/YYYY' ONCE (V-101, Owner decision 1, pass 78), and a later choice
 *     made in Settings is never overridden.
 *
 * Every test goes through the public settings API so that, on a build without
 * the fix, each one fails or passes on its own assertion. Tests that pass on
 * such a build are labelled CONTROL: they guard what the fix must not break.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import {
    getDefaultSettings,
    getInitialSettings,
    loadSettings,
    updateSetting,
} from '../../data/services/settingsService';

// --- Mocks ---------------------------------------------------------------

jest.mock('@react-native-async-storage/async-storage', () =>
    jest.requireActual('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

// Mutable so a test can change the device locale between launches. Android is
// the only platform the app ships to, so it is the branch exercised here.
const mockDeviceLocale: { os: 'ios' | 'android'; value: string | null } = {
    os: 'android',
    value: 'en_US',
};

jest.mock('react-native', () =>
    jest.requireActual('@/tests/helpers/deviceLocaleMock').createDeviceLocaleMock(() => mockDeviceLocale)
);

const SETTINGS_KEY = '@valto:settings';

/** A settings blob as 1.1.3 persisted it: every field, no marker. */
function blob113(language: string, dateFormat: string): Record<string, unknown> {
    return {
        theme: 'system',
        currency: 'XOF',
        currencyLocked: true,
        notificationsEnabled: false,
        language,
        dateFormat,
        firstDayOfWeek: 'monday',
        decimalSeparator: 'space',
        onboardingCompleted: true,
    };
}

async function storeRaw(value: Record<string, unknown>): Promise<void> {
    await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(value));
}

async function readRaw(): Promise<Record<string, unknown> | null> {
    const raw = await AsyncStorage.getItem(SETTINGS_KEY);
    return raw === null ? null : (JSON.parse(raw) as Record<string, unknown>);
}

/** Writes to the settings key made since the last clearAllMocks. */
function settingsWrites(): number {
    return (AsyncStorage.setItem as jest.Mock).mock.calls
        .filter(([key]) => key === SETTINGS_KEY).length;
}

beforeEach(async () => {
    await AsyncStorage.clear();
    mockDeviceLocale.os = 'android';
    mockDeviceLocale.value = 'en_US';
    jest.clearAllMocks();
});

// --- A1: first launch derives the format from the locale -------------------

describe('A1 first launch derives the date format from the device locale', () => {
    it.each(['fr-FR', 'fr_FR', 'fr-CI', 'fr_CI', 'es-ES', 'pt-BR', 'ru-RU', 'en-GB', 'en_GB'])(
        '%s -> DD/MM/YYYY',
        async (locale) => {
            mockDeviceLocale.value = locale;
            expect((await loadSettings()).dateFormat).toBe('DD/MM/YYYY');
            expect(getInitialSettings().dateFormat).toBe('DD/MM/YYYY');
        },
    );

    it.each(['en-US', 'en_US'])('CONTROL: %s -> MM/DD/YYYY', async (locale) => {
        mockDeviceLocale.value = locale;
        expect((await loadSettings()).dateFormat).toBe('MM/DD/YYYY');
    });

    it('CONTROL: a bare "en" with no region -> MM/DD/YYYY', async () => {
        mockDeviceLocale.value = 'en';
        expect((await loadSettings()).dateFormat).toBe('MM/DD/YYYY');
    });

    it('CONTROL: a device that gives no locale up -> MM/DD/YYYY', async () => {
        mockDeviceLocale.value = null;
        expect((await loadSettings()).dateFormat).toBe('MM/DD/YYYY');
    });

    it('CONTROL: the static default stays MM/DD/YYYY on a French device', () => {
        mockDeviceLocale.value = 'fr_FR';
        expect(getDefaultSettings().dateFormat).toBe('MM/DD/YYYY');
    });

    it('CONTROL: a fresh French install that picks MM/DD/YYYY keeps it', async () => {
        // The first-launch blob is persisted at onboarding; a later choice made
        // on it must not be taken for an unswitched 1.1.3 value.
        mockDeviceLocale.value = 'fr_FR';
        await updateSetting('onboardingCompleted', true);
        await updateSetting('dateFormat', 'MM/DD/YYYY');

        expect((await loadSettings()).dateFormat).toBe('MM/DD/YYYY');
        expect((await loadSettings()).dateFormat).toBe('MM/DD/YYYY');
    });
});

// --- A2: the one-time switch on an existing install ------------------------

describe('A2 an existing fr/es/pt/ru install on MM/DD/YYYY is switched once', () => {
    it.each(['fr', 'es', 'pt', 'ru'])('language %s: loads as DD/MM/YYYY, persists it, and does not re-run', async (language) => {
        // The device locale is English on purpose: the switch keys on the APP
        // language stored in the blob, not on the device.
        await storeRaw(blob113(language, 'MM/DD/YYYY'));
        jest.clearAllMocks();

        const first = await loadSettings();
        expect(first.dateFormat).toBe('DD/MM/YYYY');
        expect((await readRaw())?.dateFormat).toBe('DD/MM/YYYY');
        expect(settingsWrites()).toBe(1);

        // Every other field is carried through untouched.
        expect(first.language).toBe(language);
        expect(first.currency).toBe('XOF');
        expect(first.decimalSeparator).toBe('space');
        expect(first.onboardingCompleted).toBe(true);

        jest.clearAllMocks();
        const second = await loadSettings();
        expect(second.dateFormat).toBe('DD/MM/YYYY');
        expect(settingsWrites()).toBe(0);
    });

    it('concurrent loads share one switch write, and a concurrent writer is not lost', async () => {
        await storeRaw(blob113('fr', 'MM/DD/YYYY'));
        jest.clearAllMocks();

        const results = await Promise.all([
            loadSettings(),
            loadSettings(),
            loadSettings(),
            updateSetting('theme', 'dark'),
            loadSettings(),
        ]);

        results.forEach(r => expect(r.dateFormat).toBe('DD/MM/YYYY'));
        const stored = await readRaw();
        expect(stored?.dateFormat).toBe('DD/MM/YYYY');
        expect(stored?.theme).toBe('dark');
        // One switch write plus the theme write.
        expect(settingsWrites()).toBe(2);
    });
});

// --- A3: nothing else is switched -------------------------------------------

describe('A3 the switch touches nothing but fr/es/pt/ru on MM/DD/YYYY', () => {
    it('CONTROL: fr on YYYY-MM-DD is left unchanged', async () => {
        await storeRaw(blob113('fr', 'YYYY-MM-DD'));
        expect((await loadSettings()).dateFormat).toBe('YYYY-MM-DD');
        expect((await readRaw())?.dateFormat).toBe('YYYY-MM-DD');
    });

    it('CONTROL: fr on DD/MM/YYYY is left unchanged', async () => {
        await storeRaw(blob113('fr', 'DD/MM/YYYY'));
        expect((await loadSettings()).dateFormat).toBe('DD/MM/YYYY');
        expect((await readRaw())?.dateFormat).toBe('DD/MM/YYYY');
    });

    it('CONTROL: en on MM/DD/YYYY is left unchanged, even on a French device', async () => {
        mockDeviceLocale.value = 'fr_FR';
        await storeRaw(blob113('en', 'MM/DD/YYYY'));
        expect((await loadSettings()).dateFormat).toBe('MM/DD/YYYY');
        expect((await readRaw())?.dateFormat).toBe('MM/DD/YYYY');
    });

    it('CONTROL: an en install that later switches its language to fr keeps MM/DD/YYYY', async () => {
        // The switch belongs to the update, not to a language change: once an
        // install has loaded on this build, it never runs for it again.
        await storeRaw(blob113('en', 'MM/DD/YYYY'));
        await loadSettings();
        await updateSetting('language', 'fr');

        expect((await loadSettings()).dateFormat).toBe('MM/DD/YYYY');
    });
});

// --- A4: a later choice is never overridden ---------------------------------

describe('A4 a choice made after the switch stands', () => {
    // CONTROL by construction: on a build without the switch nothing can
    // override the choice, so this cannot fail there. It guards the fix against
    // running a second time. Its precondition is the forcing (a 1.1.3 blob and
    // a first load), not the switched value, which only the fix produces.
    it('CONTROL: MM/DD/YYYY set again in Settings stays MM/DD/YYYY across reloads', async () => {
        await storeRaw(blob113('fr', 'MM/DD/YYYY'));
        await loadSettings();

        await updateSetting('dateFormat', 'MM/DD/YYYY');

        expect((await loadSettings()).dateFormat).toBe('MM/DD/YYYY');
        expect((await loadSettings()).dateFormat).toBe('MM/DD/YYYY');
        expect((await loadSettings()).dateFormat).toBe('MM/DD/YYYY');
        expect((await readRaw())?.dateFormat).toBe('MM/DD/YYYY');
    });

    it('CONTROL: a blob that already carries the marker is never switched and not rewritten', async () => {
        // The shape a 1.1.4 backup restores: the marker travels in the blob.
        await storeRaw({ ...blob113('fr', 'MM/DD/YYYY'), dateFormatLocaleApplied: true });
        jest.clearAllMocks();

        expect((await loadSettings()).dateFormat).toBe('MM/DD/YYYY');
        expect(settingsWrites()).toBe(0);
    });

    it('CONTROL: a failed switch write does not drop the load to the catch-path defaults', async () => {
        await storeRaw(blob113('fr', 'MM/DD/YYYY'));
        const setItem = AsyncStorage.setItem as jest.Mock;
        const original = setItem.getMockImplementation();
        setItem.mockRejectedValueOnce(new Error('disk full'));

        try {
            const settings = await loadSettings();
            expect(settings.language).toBe('fr');
            expect(settings.currency).toBe('XOF');
        } finally {
            // A build that never writes on load leaves the rejection queued;
            // drop it so it cannot leak into a later test.
            setItem.mockReset();
            setItem.mockImplementation(original);
        }
    });
});
