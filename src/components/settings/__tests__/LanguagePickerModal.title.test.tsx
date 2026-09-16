/**
 * LanguagePickerModal - heading is translated
 *
 * The heading is the one string on this screen that is not a language name.
 * Language names are deliberately shown in their own language and must NOT be
 * translated; the heading is the opposite, and it was the one string rendered as
 * an English literal - so a French user opening the picker was told "Select
 * Language" by a screen that was otherwise entirely French.
 *
 * The real locale bundle is used rather than a key -> key mock: the point is
 * that the rendered heading changes with the language, which a mock cannot show.
 */

import { render } from '@testing-library/react-native';
import React from 'react';

import { SUPPORTED_LANGUAGES } from '../../../domain/constants/languages';
import i18n from '../../../localization/i18n';
import { LanguagePickerModal } from '../LanguagePickerModal';

jest.mock('react-native-safe-area-context', () => ({
    useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

/**
 * Read expected copy out of the locale rather than restating it - the idiom used
 * by FinancialSummary.test.tsx:16 and YtdSummaryCard.test.tsx:25. The fr values
 * carry accents; test sources in this repo stay ASCII. Asserting through t()
 * also fails loudly if the key is renamed, which a hardcoded string would not.
 */
const headingText = () => i18n.t('languagePicker.title');
const headingTextIn = (lng: string) => i18n.getFixedT(lng)('languagePicker.title');

/**
 * Language names come from SUPPORTED_LANGUAGES, not from a locale bundle - they
 * are the same in every language by design. Reading them from that constant
 * keeps this source ASCII and ties the test to the array the component maps.
 */
const nativeNameOf = (code: string): string =>
    SUPPORTED_LANGUAGES.find(l => l.code === code)!.nativeName;

function renderPicker() {
    return render(
        <LanguagePickerModal
            visible
            onClose={jest.fn()}
            onSelect={jest.fn()}
            selectedCode="fr"
        />,
    );
}

afterAll(async () => {
    await i18n.changeLanguage('en');
});

describe('LanguagePickerModal - heading', () => {
    it('renders the heading in the active language', async () => {
        await i18n.changeLanguage('fr');
        const { getByText } = renderPicker();

        expect(getByText(headingText())).toBeTruthy();

        // The fr heading must be a real translation, not the English one
        // falling through - which is what a missing key would render.
        expect(headingText()).not.toBe(headingTextIn('en'));
    });

    it('does not render an English heading to a French user', async () => {
        await i18n.changeLanguage('fr');
        const { queryByText } = renderPicker();

        expect(queryByText(headingTextIn('en'))).toBeNull();
    });

    it('still renders the English heading in English', async () => {
        await i18n.changeLanguage('en');
        const { getByText } = renderPicker();

        expect(getByText(headingTextIn('en'))).toBeTruthy();
    });

    it('leaves the language names themselves untranslated', async () => {
        // Each language is listed in its own language, in every locale - that is
        // the point of a language picker, and the heading fix must not touch it.
        await i18n.changeLanguage('fr');
        const { getByText, getAllByText } = renderPicker();

        expect(getByText(nativeNameOf('es'))).toBeTruthy();
        expect(getByText(nativeNameOf('fr'))).toBeTruthy();
        // English is its own native name, so it is rendered twice - as the
        // native name and as the English name on the same row.
        expect(getAllByText(nativeNameOf('en'))).toHaveLength(2);
    });
});
