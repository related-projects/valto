/**
 * InputField - the text input carries its own testID (pass 94, item 2)
 *
 * The testID prop was put on the container View only (InputField.tsx:32). A
 * Maestro flow that taps that id lands on the wrapper, so it cannot address the
 * field it has to type into. The TextInput now also carries `${testID}_input`;
 * the container keeps its id unchanged. The tests named "control" pass before
 * the change: they pin what must not move.
 */

import { render, within } from '@testing-library/react-native';
import React from 'react';

import { InputField } from '../InputField';

jest.mock('../../../theme/theme', () => ({
    useTheme: () => ({
        colors: {
            foreground: '#F1F5F9',
            primary: '#7C3AED',
            destructive: '#EF4444',
            muted: '#334155',
            mutedForeground: '#94A3B8',
            card: '#1E293B',
            input: '#0F172A',
            border: '#334155',
        },
        spacing: { xs: 4, sm: 8, md: 12, lg: 16, xl: 20 },
        radius: { sm: 6, md: 10, lg: 14, xl: 20 },
        typography: { sizes: { xs: 11, sm: 13, md: 15, lg: 17 } },
    }),
}));

const PLACEHOLDER = 'Type here';

describe('pass 94 item 2. InputField testIDs', () => {
    it('pass 94 item 2. the TextInput carries the id with an _input suffix', () => {
        const { getByPlaceholderText } = render(
            <InputField testID="field" placeholder={PLACEHOLDER} />,
        );

        expect(getByPlaceholderText(PLACEHOLDER).props.testID).toBe('field_input');
    });

    it('control: the container keeps the id it was given, and holds the input', () => {
        const { getByTestId } = render(
            <InputField testID="field" placeholder={PLACEHOLDER} />,
        );

        const container = getByTestId('field');
        expect(container.props.placeholder).toBeUndefined();
        expect(within(container).getByPlaceholderText(PLACEHOLDER)).toBeTruthy();
    });

    it('control: without a testID the input carries none', () => {
        const { getByPlaceholderText } = render(<InputField placeholder={PLACEHOLDER} />);

        expect(getByPlaceholderText(PLACEHOLDER).props.testID).toBeUndefined();
    });
});
