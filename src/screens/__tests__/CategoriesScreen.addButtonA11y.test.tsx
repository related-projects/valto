/**
 * The Categories add button is announced as a button with a name (pass 84b,
 * item 3)
 *
 * The floating add button shows only a "+" icon. It had no role and no label,
 * so TalkBack announced an unlabelled control. It now reads as a button named
 * by a11y.addCategory, which existed in every complete bundle and was read by
 * nothing.
 *
 * The modal and the data hook are replaced: neither is what is announced here.
 */

import { fireEvent, render } from '@testing-library/react-native';
import React from 'react';

import i18n from '../../localization/i18n';
import { CategoriesScreen } from '../CategoriesScreen';

jest.mock('react-native-safe-area-context', () => ({
    useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.mock('expo-router', () => ({
    useRouter: () => ({ back: jest.fn(), push: jest.fn() }),
}));

jest.mock('../../hooks/useCategories', () => ({
    useCategories: () => ({
        expenseCategories: [],
        incomeCategories: [],
        loading: false,
        deleteCategory: jest.fn(),
    }),
}));

const mockCategoryModal = jest.fn();
jest.mock('../../components/modals/CategoryModal', () => ({
    CategoryModal: (props: { visible: boolean }) => {
        mockCategoryModal(props);
        return null;
    },
}));

beforeAll(async () => {
    await i18n.changeLanguage('en');
});

describe('pass 84b item 3. Categories add button', () => {
    it('pass 84b item 3. is a button labelled by a11y.addCategory', () => {
        const label = i18n.t('a11y.addCategory');
        expect(label).not.toBe('a11y.addCategory');

        const { getByRole } = render(<CategoriesScreen />);
        fireEvent.press(getByRole('button', { name: label }));

        expect(mockCategoryModal).toHaveBeenLastCalledWith(expect.objectContaining({ visible: true }));
    });
});
