import { render } from '@testing-library/react-native';
import React from 'react';

import i18n from '../../../localization/i18n';
import { CategoryModal } from '../CategoryModal';

/**
 * CategoryModal - the type control names its options in the app language
 *
 * Registry F-06, findings 10 and 11. The segmented control was built from
 * Object.values(CategoryType), so it showed the raw enum values "expense" and
 * "income" in all ten locales, on screen and - because SegmentControl feeds the
 * same string to getSelectableA11y - to the screen reader as well.
 *
 * D1: the labels come from categories.expense / categories.income, and because
 * the segments are built inside the component they follow a language change
 * without a remount. The second test is the one that pins the placement: a
 * module-scope constant would pass the first test in whichever language loaded
 * first and fail this one.
 *
 * Expected strings are read from the bundles rather than restated, so a
 * translation edit cannot leave this test asserting a stale sentence.
 */

jest.mock('../../../hooks/useCategories', () => ({
    useCategories: () => ({
        createCategory: jest.fn(),
        updateCategory: jest.fn(),
    }),
}));

const labelsIn = (language: string) => {
    const fixed = i18n.getFixedT(language);
    return { expense: fixed('categories.expense'), income: fixed('categories.income') };
};

describe('CategoryModal type labels', () => {
    afterAll(async () => {
        await i18n.changeLanguage('en');
    });

    it('names both types in the active language', async () => {
        await i18n.changeLanguage('fr');
        const fr = labelsIn('fr');

        const { getByText } = render(<CategoryModal visible onClose={jest.fn()} />);

        expect(getByText(fr.expense)).toBeTruthy();
        expect(getByText(fr.income)).toBeTruthy();
    });

    it('follows a language change without remounting', async () => {
        await i18n.changeLanguage('fr');

        const { rerender, getByText, queryByText } = render(
            <CategoryModal visible onClose={jest.fn()} />,
        );

        await i18n.changeLanguage('ru');
        rerender(<CategoryModal visible onClose={jest.fn()} />);

        const ru = labelsIn('ru');
        const fr = labelsIn('fr');

        expect(getByText(ru.expense)).toBeTruthy();
        expect(getByText(ru.income)).toBeTruthy();
        expect(queryByText(fr.expense)).toBeNull();
    });
});
