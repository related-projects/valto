import { render } from '@testing-library/react-native';
import React from 'react';

import i18n from '../../localization/i18n';
import { AboutScreen } from '../AboutScreen';

/**
 * About - the version rows report the binary that is running
 *
 * Registry F-06, findings 8, 13, 14 and 15. The Build Number row read
 * Constants.expoConfig?.ios?.buildNumber ?? ...android?.versionCode ?? '1'.
 * app.json declares neither key and eas.json sets appVersionSource: "remote",
 * so EAS stamps the number into the native project and never into the config
 * that ships to expoConfig. Both branches were undefined in every build and the
 * row printed a confident "1" - forever, on both platforms. The App Version and
 * SDK rows carried the same shape of lie in their '1.0.0' and 'N/A' fallbacks.
 *
 * D7: the values come from expo-application, which reads the binary, and a row
 * whose value is null is not rendered at all. That is also why there is no
 * 'N/A' key to translate: a row with nothing to say says nothing.
 *
 * These tests drive the module through getters so one suite can present both a
 * real build and a platform that reports null (expo-application documents null
 * on web), which is the branch the removed fallbacks used to hide.
 */

let mockApplicationVersion: string | null = '1.1.2';
let mockBuildVersion: string | null = '37';

jest.mock('expo-application', () => ({
    get nativeApplicationVersion() { return mockApplicationVersion; },
    get nativeBuildVersion() { return mockBuildVersion; },
}));

jest.mock('react-native-safe-area-context', () => ({
    useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.mock('expo-router', () => ({
    useRouter: () => ({ back: jest.fn() }),
}));

const label = (key: string) => i18n.getFixedT('en')(key);

beforeAll(async () => {
    await i18n.changeLanguage('en');
});

beforeEach(() => {
    mockApplicationVersion = '1.1.2';
    mockBuildVersion = '37';
});

describe('About version rows', () => {
    it('shows the build number the binary reports', () => {
        const { getByText } = render(<AboutScreen />);

        expect(getByText(label('about.buildNumber'))).toBeTruthy();
        expect(getByText('37')).toBeTruthy();
    });

    it('shows the application version the binary reports', () => {
        const { getAllByText } = render(<AboutScreen />);

        expect(getAllByText('1.1.2').length).toBeGreaterThan(0);
    });

    it('drops the build row entirely when the platform reports no build number', () => {
        mockBuildVersion = null;

        const { queryByText } = render(<AboutScreen />);

        expect(queryByText(label('about.buildNumber'))).toBeNull();
        expect(queryByText('1')).toBeNull();
    });

    it('drops the version row entirely when the platform reports no version', () => {
        mockApplicationVersion = null;

        const { queryByText } = render(<AboutScreen />);

        expect(queryByText(label('about.appVersion'))).toBeNull();
        expect(queryByText('1.0.0')).toBeNull();
    });
});
