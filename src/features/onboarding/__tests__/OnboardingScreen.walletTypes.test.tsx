/**
 * OnboardingScreen - wallet type labels are translated
 *
 * The four wallet-type chips on the create-wallet step were hardcoded English
 * in a module-level WALLET_TYPES const, so a Spanish user picking their first
 * wallet - the first screen the app ever shows - chose between "Cash", "Bank",
 * "Mobile" and "Savings" while the label above them read "Tipo de cartera".
 * The same string is also the chip's accessibility label, so a screen reader
 * announced it in English too.
 *
 * Spanish is used rather than French because all four values differ from
 * English there; French translates "Mobile" to "Mobile", which would not
 * discriminate between a translated label and a hardcoded one.
 *
 * This is a separate file from OnboardingScreen.test.tsx on purpose: that file
 * mocks react-i18next with t: key => key, which cannot show a real translation.
 */

import { fireEvent, render, waitFor } from '@testing-library/react-native';
import React from 'react';

import i18n from '../../../localization/i18n';
import { OnboardingScreen } from '../screens/OnboardingScreen';

// --- Mocks -------------------------------------------------------------
// Every factory below is self-contained, so jest hoists them above the imports
// on its own and they can be written in their natural place.

jest.mock('../../../data/services/settingsService', () => ({
    setOnboardingCurrency: jest.fn().mockResolvedValue(undefined),
    selectAndLockCurrency: jest.fn().mockResolvedValue(undefined),
    lockCurrency: jest.fn().mockResolvedValue(undefined),
    updateSetting: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../../../core/events/dataEvents', () => ({
    dataEvents: {
        subscribe: jest.fn(() => jest.fn()),
        emit: jest.fn(),
        emitMultiple: jest.fn(),
    },
}));

jest.mock('../../../core/di/container', () => ({
    container: {
        get walletRepository() {
            return { create: jest.fn().mockResolvedValue({ id: 'w1' }) };
        },
    },
}));

jest.mock('react-native-safe-area-context', () => ({
    useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.mock('../../../hooks/useFormatting', () => ({
    useFormatting: () => ({
        parseAmount: (v: string) => (v ? Number(v) : null),
        normalizeAmount: (v: number) => Math.round(v * 100),
        decimals: 2,
    }),
}));

// react-i18next is deliberately NOT mocked - the real bundle is the thing under
// test.

/** The four chips, by key. Expected copy is read from the bundle, never restated. */
const WALLET_TYPE_KEYS = [
    'wallets.type.cash',
    'wallets.type.bank',
    'wallets.type.mobile',
    'wallets.type.savings',
];

/**
 * Read expected copy out of the locale rather than restating it - the idiom used
 * by FinancialSummary.test.tsx:16 and YtdSummaryCard.test.tsx:25. The es values
 * carry accents; test sources in this repo stay ASCII. Asserting through t()
 * also fails loudly if a key is renamed, which a hardcoded string would not.
 */
const labelText = (key: string) => i18n.t(key);
const englishOf = (key: string) => i18n.getFixedT('en')(key);

/** Walk from the welcome step through the currency step to the wallet step. */
async function renderAtWalletStep() {
    const utils = render(<OnboardingScreen onComplete={jest.fn()} />);
    fireEvent.press(utils.getByTestId('onboarding_get_started'));
    fireEvent.changeText(utils.getByTestId('currency_search_input'), 'EUR');
    fireEvent.press(utils.getByTestId('currency_item_EUR'));
    await waitFor(() => expect(utils.getByTestId('onboarding_wallet_name')).toBeTruthy());
    return utils;
}

beforeEach(async () => {
    jest.clearAllMocks();
    await i18n.changeLanguage('es');
});

afterAll(async () => {
    await i18n.changeLanguage('en');
});

describe('OnboardingScreen - wallet type labels', () => {
    it('renders every wallet type in the active language', async () => {
        const { getByText } = await renderAtWalletStep();

        for (const key of WALLET_TYPE_KEYS) {
            expect(getByText(labelText(key))).toBeTruthy();
        }
    });

    it('renders no English wallet type to a Spanish user', async () => {
        const { queryByText } = await renderAtWalletStep();

        for (const key of WALLET_TYPE_KEYS) {
            // Guards the assertion below from being vacuous: if the es value
            // equalled the en one, "no English on screen" could not fail. This
            // is why the suite runs in Spanish - fr translates
            // wallets.type.mobile to "Mobile", identical to English.
            expect(labelText(key)).not.toBe(englishOf(key));
            expect(queryByText(englishOf(key))).toBeNull();
        }
    });

    it('announces the translated label to a screen reader too', async () => {
        // The chip's accessibility label is the same string as its visible text,
        // so a hardcoded label breaks both at once.
        const { getByLabelText } = await renderAtWalletStep();

        for (const key of WALLET_TYPE_KEYS) {
            expect(getByLabelText(labelText(key))).toBeTruthy();
        }
    });
});
