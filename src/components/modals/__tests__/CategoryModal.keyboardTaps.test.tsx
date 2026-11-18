/**
 * CategoryModal - one tap on a colour swatch with the keyboard up (pass 95)
 *
 * The name field sits above the colour swatches, which sit in a nested
 * horizontal ScrollView that left keyboardShouldPersistTaps unset ("never").
 * A nested ScrollView is offered the touch after its parents and before the
 * swatch, so after typing a name it took the first tap to close the keyboard,
 * even though the sheet's own ScrollView says "handled".
 *
 * The swatches carry no testID or text, so this reads the prop of every scroll
 * view the sheet renders: the sheet's and the swatch row. Jest has no soft
 * keyboard, so the prop is what can be pinned here.
 *
 * Harness as in CategoryModal.typeLabels.test.tsx.
 */

import { render } from '@testing-library/react-native';
import React from 'react';

import i18n from '../../../localization/i18n';
import type { TreeNode } from '../../../test-utils/scrollAncestors';
import { CategoryModal } from '../CategoryModal';

jest.mock('../../../hooks/useCategories', () => ({
    useCategories: () => ({
        createCategory: jest.fn(),
        updateCategory: jest.fn(),
    }),
}));

beforeAll(async () => {
    await i18n.changeLanguage('en');
});

describe('pass 95. CategoryModal swatches with the keyboard up', () => {
    it('pass 95. every scroll view in the sheet keeps the tap for its controls', () => {
        const { UNSAFE_root } = render(<CategoryModal visible onClose={jest.fn()} />);
        const scrollViews: TreeNode[] = UNSAFE_root.findAll((node: TreeNode) => node.type === 'RCTScrollView');

        // Outermost first: the sheet's ScrollView, then the horizontal swatch row.
        expect(scrollViews.map(node => [node.props.horizontal === true, node.props.keyboardShouldPersistTaps])).toEqual([
            [false, 'handled'],
            [true, 'handled'],
        ]);
    });
});
