/**
 * Guard: the Android permissions Valto never uses are removed (pass 82, Owner
 * decision 3).
 *
 * The prebuild template declares READ_EXTERNAL_STORAGE, WRITE_EXTERNAL_STORAGE
 * and SYSTEM_ALERT_WINDOW, and two libraries declare the storage pair again in
 * their own manifests (expo-file-system both, expo-image READ up to API 32), so
 * the Gradle manifest merge would bring them back even from a template without
 * them. Nothing in app/, src/ or plugins/ uses external storage or an overlay
 * window: every file Valto writes goes to the app cache, and the restore picker
 * copies the chosen file there. android.blockedPermissions writes a
 * tools:node="remove" entry for each, which the merge applies to every
 * manifest it merges.
 */

import { getConfig } from 'expo/config';

import { REPO_ROOT, resolveAndroidManifest, usesPermissions } from '../helpers/resolvedAndroidManifest';

const BLOCKED = [
    'android.permission.READ_EXTERNAL_STORAGE',
    'android.permission.WRITE_EXTERNAL_STORAGE',
    'android.permission.SYSTEM_ALERT_WINDOW',
];

describe('pass 82 c. unused Android permissions', () => {
    let permissions: Record<string, string | undefined>[];

    beforeAll(async () => {
        permissions = usesPermissions(await resolveAndroidManifest());
    });

    it('pass 82 c: the project config blocks the three permissions', () => {
        const { exp } = getConfig(REPO_ROOT, { skipSDKVersionRequirement: true });

        expect(exp.android?.blockedPermissions ?? []).toEqual(expect.arrayContaining(BLOCKED));
    });

    it.each(BLOCKED)('pass 82 c: the resulting manifest declares %s only to remove it', (name) => {
        const entries = permissions.filter((entry) => entry['android:name'] === name);

        expect(entries).toEqual([{ 'android:name': name, 'tools:node': 'remove' }]);
    });

    // CONTROL: only the three are blocked. INTERNET carries Sentry reports and
    // VIBRATE the haptics; both stay requested. True before and after.
    it.each(['android.permission.INTERNET', 'android.permission.VIBRATE'])('control: %s is still requested', (name) => {
        const entries = permissions.filter((entry) => entry['android:name'] === name);

        expect(entries).toEqual([{ 'android:name': name }]);
    });
});
