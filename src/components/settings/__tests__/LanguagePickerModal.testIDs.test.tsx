/**
 * LanguagePickerModal - each language row has a stable testID
 * (pass 94, item 2)
 *
 * The rows had no testID, so a flow could only pick a language by its native
 * name. Each row now carries language_picker_item_<code>. Each test presses the
 * id and checks the matching language is the one selected.
 *
 * Harness as in LanguagePickerModal.title.test.tsx.
 */

import { fireEvent, render, within } from '@testing-library/react-native';
import React from 'react';

import { getOfferedLanguages } from '../../../domain/constants/languages';
import i18n from '../../../localization/i18n';
import { LanguagePickerModal } from '../LanguagePickerModal';

jest.mock('react-native-safe-area-context', () => ({
    useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

const ACTIVE = 'en';
const OFFERED = getOfferedLanguages(ACTIVE);

beforeAll(async () => {
    await i18n.changeLanguage('en');
});

describe('pass 94 item 2. LanguagePickerModal testIDs', () => {
    it('control: more than one language is offered', () => {
        expect(OFFERED.length).toBeGreaterThan(1);
    });

    it.each(OFFERED.map(l => [l.code, l]))('pass 94 item 2. language_picker_item_%s selects that language', (code, lang) => {
        const onSelect = jest.fn();
        const { getByTestId } = render(
            <LanguagePickerModal visible onClose={jest.fn()} onSelect={onSelect} selectedCode={ACTIVE} />,
        );

        const row = getByTestId(`language_picker_item_${code}`);
        expect(within(row).getAllByText(lang.nativeName).length).toBeGreaterThan(0);

        fireEvent.press(row);
        expect(onSelect).toHaveBeenCalledWith(lang);
    });
});
