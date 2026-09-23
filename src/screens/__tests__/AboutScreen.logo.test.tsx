/**
 * The About screen's logo.
 *
 * The screen drew no image at all: it rendered U+1F4B0 in a Text node, written
 * five months before the brand artwork landed, so the one screen that names the
 * app showed a system emoji instead of the app's own icon.
 *
 * The identity assertion below is real rather than tautological. The jest-expo
 * preset routes .png through node_modules/react-native/jest/assetFileTransformer.js,
 * which emits `{ testUri: path.relative(<that directory>, <the file>) }` - a value
 * that identifies the file. So the expected value is derived from app.json at run
 * time: change what app.json declares as `icon`, or change what the screen
 * requires, and this test fails.
 *
 * The emoji is written as an escape, never as the literal character, so every
 * line in this file is ASCII.
 */

import { render } from '@testing-library/react-native';
import * as fs from 'fs';
import * as path from 'path';
import React from 'react';

import i18n from '../../localization/i18n';
import { AboutScreen } from '../AboutScreen';

jest.mock('react-native-safe-area-context', () => ({
    useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.mock('expo-router', () => ({
    useRouter: () => ({ back: jest.fn() }),
}));

jest.mock('expo-constants', () => ({
    __esModule: true,
    default: { expoConfig: { version: '1.1.1', sdkVersion: '54.0.0' } },
}));

/** U+1F4B0 MONEY BAG - the character the identity card used to render. */
const MONEY_BAG = '\u{1F4B0}';

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');

/**
 * The testUri the asset transformer will have produced for whichever file
 * app.json declares as the app icon. Read from app.json on every run, so this
 * never hardcodes the asset's path.
 */
function declaredIconTestUri(): string {
    const appJson = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'app.json'), 'utf8'));
    const declared: string = appJson.expo.icon;
    const iconAbsolute = path.resolve(REPO_ROOT, declared);

    return path
        .relative(path.join(REPO_ROOT, 'node_modules', 'react-native', 'jest'), iconAbsolute)
        .split(path.sep)
        .join('/');
}

beforeAll(async () => {
    await i18n.changeLanguage('fr');
});

describe('AboutScreen logo', () => {
    it('no longer renders the money-bag emoji', () => {
        const { queryByText } = render(<AboutScreen />);

        expect(queryByText(MONEY_BAG)).toBeNull();
    });

    it('renders an image in the identity card, decorative', () => {
        const { getByTestId, queryByTestId } = render(<AboutScreen />);

        // It is there...
        expect(getByTestId('about_app_logo', { includeHiddenElements: true })).toBeTruthy();
        // ...and deliberately not there for a screen reader. The default query
        // skips anything hidden from accessibility, so this second assertion is
        // what proves accessibilityElementsHidden took effect: the title beside
        // the image already announces the app, and a label would be read twice.
        expect(queryByTestId('about_app_logo')).toBeNull();
    });

    it('renders the very file app.json declares as the app icon', () => {
        const { getByTestId } = render(<AboutScreen />);

        const logo = getByTestId('about_app_logo', { includeHiddenElements: true });

        expect(logo.props.source.testUri).toBe(declaredIconTestUri());
    });
});
