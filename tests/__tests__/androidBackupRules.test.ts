/**
 * Guard: Valto owns its Android backup rules (pass 82, Owner decision 1).
 *
 * allowBackup is true by Expo's default (config-plugins AllowBackup.js:26), and
 * until this pass the only rules the manifest pointed at were expo-secure-store's
 * own (withSecureStore.js:8, :26-28): include every shared preference, exclude
 * the SecureStore file. valto.db and the AsyncStorage database stayed out of
 * cloud backups and phone transfers only because Android backs up nothing
 * outside an include - nothing in the project said so.
 *
 * The rules are now written by plugins/withAndroidBackupRules.js (its contents
 * are checked in plugins/__tests__/withAndroidBackupRules.test.ts), and
 * expo-secure-store is told not to apply its own (configureAndroidBackup:
 * false). This file checks the two lines of app.json and the manifest that
 * results once every plugin prebuild runs has run.
 */

import * as fs from 'fs';
import * as path from 'path';

import { applicationAttributes, REPO_ROOT, resolveAndroidManifest } from '../helpers/resolvedAndroidManifest';

type PluginEntry = string | [string, Record<string, unknown>];

const PLUGIN = './plugins/withAndroidBackupRules';

const DATA_EXTRACTION_RULES = '@xml/valto_data_extraction_rules';
const FULL_BACKUP_CONTENT = '@xml/valto_full_backup_content';

function plugins(): PluginEntry[] {
    const appJson = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'app.json'), 'utf8'));
    return appJson.expo.plugins;
}

function pluginName(entry: PluginEntry): string {
    return typeof entry === 'string' ? entry : entry[0];
}

/** The options object of a plugin entry, or an empty object if it has none. */
function pluginOptions(name: string): Record<string, unknown> {
    const entry = plugins().find((candidate) => pluginName(candidate) === name);
    return entry !== undefined && typeof entry !== 'string' ? entry[1] : {};
}

describe('pass 82 a. app.json', () => {
    it('pass 82 a: turns off the backup rules expo-secure-store applies by default', () => {
        expect(pluginOptions('expo-secure-store').configureAndroidBackup).toBe(false);
    });

    it('pass 82 a: registers the plugin that writes the app-owned rules', () => {
        expect(plugins().map(pluginName)).toContain(PLUGIN);
    });
});

describe('pass 82 a. the resulting manifest', () => {
    let application: Record<string, string | undefined>;

    beforeAll(async () => {
        application = applicationAttributes(await resolveAndroidManifest());
    });

    it('pass 82 a: points Android 12 and later at the app-owned data extraction rules', () => {
        expect(application['android:dataExtractionRules']).toBe(DATA_EXTRACTION_RULES);
    });

    it('pass 82 a: points Android 11 and earlier at the app-owned full backup content', () => {
        expect(application['android:fullBackupContent']).toBe(FULL_BACKUP_CONTENT);
    });

    // CONTROL: allowBackup is out of scope (Owner decision 1 changes the rules
    // only). True before and after this change.
    it('control: allowBackup stays true', () => {
        expect(application['android:allowBackup']).toBe('true');
    });
});
