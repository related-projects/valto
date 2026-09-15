/**
 * LanguagePickerModal - which languages the picker offers
 *
 * SUPPORTED_LANGUAGES is the set of codes storage may legitimately hold, which
 * is not the same question as the set a user may choose. Five of its ten bundles
 * carry 71 or 89 of en.json's 558 keys, so picking one hands the user a screen
 * that is part their language and part English fallback.
 *
 * The offered set is therefore the complete locales plus whatever the install
 * already holds: an install already on an incomplete locale must still be able
 * to see its own language in the list and keep it.
 *
 * Membership is read off SUPPORTED_LANGUAGES and COMPLETE_LANGUAGE_CODES rather
 * than restated here. A literal list in a test is a second declaration, and this
 * repo already carries one list too many when that happens.
 */

import { render } from '@testing-library/react-native';
import React from 'react';
import { Text } from 'react-native';

import { COMPLETE_LANGUAGE_CODES, SUPPORTED_LANGUAGES } from '../../../domain/constants/languages';
import { LanguagePickerModal } from '../LanguagePickerModal';

jest.mock('react-native-safe-area-context', () => ({
    useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

/**
 * Ionicons renders a font glyph, which no text query can reach. Rendering the
 * icon name as text instead makes the checkmark assertable - it is the only
 * thing that marks the selected row.
 *
 * The `mock` prefix is load-bearing: jest hoists the jest.mock call above these
 * imports, and its factory may only reference out-of-scope bindings whose name
 * starts with `mock`. It is read at render time, not at hoist time, so the
 * import has landed by then.
 */
const mockRenderIcon = (name: string) => React.createElement(Text, null, `icon:${name}`);

jest.mock('@expo/vector-icons', () => ({
    Ionicons: ({ name }: { name: string }) => mockRenderIcon(name),
}));

const CHECKMARK = 'icon:checkmark-circle';

const completeCodes: readonly string[] = COMPLETE_LANGUAGE_CODES;

/** The complete locales in SUPPORTED_LANGUAGES declaration order. */
const completeInDeclarationOrder = SUPPORTED_LANGUAGES
    .filter(l => completeCodes.includes(l.code))
    .map(l => l.code);

const incompleteEntries = SUPPORTED_LANGUAGES.filter(l => !completeCodes.includes(l.code));

/**
 * Every row renders `lang.name` - the English name - and those are unique across
 * SUPPORTED_LANGUAGES, so presence of that text is presence of the row. Filtering
 * the constant rather than the query results keeps the answer in declaration
 * order, which is what lets the order assertions below mean something.
 */
const renderedCodes = (queryAllByText: (text: string) => unknown[]): string[] =>
    SUPPORTED_LANGUAGES.filter(l => queryAllByText(l.name).length > 0).map(l => l.code);

function renderPicker(selectedCode: string) {
    return render(
        <LanguagePickerModal
            visible
            onClose={jest.fn()}
            onSelect={jest.fn()}
            selectedCode={selectedCode}
        />,
    );
}

describe('LanguagePickerModal - offered languages', () => {
    it('offers only the complete locales when the active language is complete', () => {
        const { queryAllByText } = renderPicker('fr');

        expect(renderedCodes(queryAllByText)).toEqual(completeInDeclarationOrder);

        // The point of the change: no row exists for a locale that would render
        // mostly English fallback.
        for (const lang of incompleteEntries) {
            expect(queryAllByText(lang.name)).toHaveLength(0);
        }
    });

    it('keeps the active language listed when the install holds an incomplete locale', () => {
        const { queryAllByText } = renderPicker('ar');
        const offered = renderedCodes(queryAllByText);

        expect(offered).toHaveLength(completeInDeclarationOrder.length + 1);
        expect(offered).toContain('ar');

        // Declaration order is preserved: ar is declared after fr and before pt,
        // and must not be appended to the end of the list.
        expect(offered.indexOf('ar')).toBeGreaterThan(offered.indexOf('fr'));
        expect(offered.indexOf('ar')).toBeLessThan(offered.indexOf('pt'));

        // The other four incomplete locales are still withheld - holding ar does
        // not reopen the door to all of them.
        for (const lang of incompleteEntries.filter(l => l.code !== 'ar')) {
            expect(queryAllByText(lang.name)).toHaveLength(0);
        }

        // ar carries the selected state. Exactly one checkmark is rendered, and
        // the component marks a row when its code equals selectedCode - which
        // only the ar row does. Had ar been filtered out the count would be zero.
        expect(queryAllByText(CHECKMARK)).toHaveLength(1);
    });
});
