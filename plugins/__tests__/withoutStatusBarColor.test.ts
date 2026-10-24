/**
 * plugins/withoutStatusBarColor - the generated AppTheme no longer sets
 * android:statusBarColor (pass 81, Owner decision 2).
 *
 * The fixture below is the AppTheme and splash theme prebuild generated at
 * 8d7179e, item for item: the status bar colour is the splash background,
 * copied there by the splash plugin, not something app.json asks for. The mod
 * has to take that one item out and leave every other one exactly as it was -
 * in particular the splash theme, which the removal must not touch.
 */

import type { ExpoConfig } from 'expo/config';
import type { AndroidConfig, ExportedConfig } from 'expo/config-plugins';

import withoutStatusBarColor, { removeStatusBarColor } from '../withoutStatusBarColor';

type ResourceXML = AndroidConfig.Resources.ResourceXML;

const STATUS_BAR_COLOR = 'android:statusBarColor';

/** styles.xml as prebuild generated it at 8d7179e. */
function generatedStyles(): ResourceXML {
    return {
        resources: {
            $: { 'xmlns:tools': 'http://schemas.android.com/tools' },
            style: [
                {
                    $: { name: 'AppTheme', parent: 'Theme.AppCompat.DayNight.NoActionBar' },
                    item: [
                        { _: 'true', $: { name: 'android:enforceNavigationBarContrast', 'tools:targetApi': '29' } },
                        { _: '@drawable/rn_edit_text_material', $: { name: 'android:editTextBackground' } },
                        { _: '@color/colorPrimary', $: { name: 'colorPrimary' } },
                        { _: '#9C7855', $: { name: STATUS_BAR_COLOR } },
                    ],
                },
                {
                    $: { name: 'Theme.App.SplashScreen', parent: 'Theme.SplashScreen' },
                    item: [
                        { _: '@color/splashscreen_background', $: { name: 'windowSplashScreenBackground' } },
                        { _: '@drawable/splashscreen_logo', $: { name: 'windowSplashScreenAnimatedIcon' } },
                        { _: '@style/AppTheme', $: { name: 'postSplashScreenTheme' } },
                        { _: 'icon_preferred', $: { name: 'android:windowSplashScreenBehavior' } },
                    ],
                },
            ],
        },
    };
}

function theme(styles: ResourceXML, name: string) {
    const found = styles.resources.style?.find((style) => style.$.name === name);
    if (!found) throw new Error(`no style named ${name}`);
    return found;
}

const itemNames = (styles: ResourceXML, name: string) =>
    theme(styles, name).item.map((item) => item.$.name);

describe('withoutStatusBarColor', () => {
    it('removes android:statusBarColor from AppTheme', () => {
        const result = removeStatusBarColor(generatedStyles());

        expect(itemNames(result, 'AppTheme')).not.toContain(STATUS_BAR_COLOR);
    });

    it('leaves every other AppTheme item as it was, in order', () => {
        const expected = theme(generatedStyles(), 'AppTheme').item.filter(
            (item) => item.$.name !== STATUS_BAR_COLOR,
        );

        const result = removeStatusBarColor(generatedStyles());

        expect(theme(result, 'AppTheme').item).toEqual(expected);
        expect(theme(result, 'AppTheme').$).toEqual(theme(generatedStyles(), 'AppTheme').$);
    });

    it('leaves the splash theme untouched', () => {
        const result = removeStatusBarColor(generatedStyles());

        expect(theme(result, 'Theme.App.SplashScreen')).toEqual(
            theme(generatedStyles(), 'Theme.App.SplashScreen'),
        );
    });

    it('registers an Android styles mod that applies the same removal', async () => {
        const config: ExportedConfig = withoutStatusBarColor({ name: 'valto', slug: 'valto' } as ExpoConfig);
        const mod = config.mods?.android?.styles;

        expect(typeof mod).toBe('function');

        const result = await mod!({
            ...config,
            modResults: generatedStyles(),
            modRequest: {
                projectRoot: '/project',
                platformProjectRoot: '/project/android',
                modName: 'styles',
                platform: 'android',
                introspect: true,
            },
        } as unknown as Parameters<NonNullable<typeof mod>>[0]);

        expect(itemNames(result.modResults, 'AppTheme')).not.toContain(STATUS_BAR_COLOR);
        expect(theme(result.modResults, 'Theme.App.SplashScreen')).toEqual(
            theme(generatedStyles(), 'Theme.App.SplashScreen'),
        );
    });

    // CONTROL: a theme that never had the item comes out exactly as it went in.
    it('returns styles without the item unchanged', () => {
        const input = removeStatusBarColor(generatedStyles());
        const snapshot = JSON.parse(JSON.stringify(input));

        expect(removeStatusBarColor(input)).toEqual(snapshot);
    });
});
