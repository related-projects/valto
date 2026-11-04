/**
 * plugins/withAndroidBackupRules - the backup rules Valto owns (pass 82, Owner
 * decision 1).
 *
 * Every section of both rule files - cloud-backup and device-transfer for
 * Android 12 and later, full-backup-content for Android 11 and earlier -
 * excludes the database domain (valto.db, the AsyncStorage database), the file
 * domain and the SecureStore preferences file in so many words, instead of
 * leaving them out only because Android backs up nothing outside an include.
 *
 * What is backed up does not change: the one include is still every shared
 * preference. The database and file excludes sit outside it, which Android lint
 * reports as "is not in an included path" under FullBackupContent, a FATAL
 * issue that fails lintVitalRelease; each of those excludes therefore carries
 * tools:ignore="FullBackupContent", and only those.
 *
 * app.json registering the plugin, and the manifest pointing at these files
 * once every plugin has run, are checked in
 * tests/__tests__/androidBackupRules.test.ts.
 */

import { AndroidConfig, XML } from 'expo/config-plugins';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

/** One <include> or <exclude> line of a rules section. */
interface Rule {
    kind: 'include' | 'exclude';
    domain?: string;
    path?: string;
    ignore?: string;
}

const PLUGIN_FILE = path.join(__dirname, '..', 'withAndroidBackupRules.js');

/** The SharedPreferences file expo-secure-store writes (SecureStoreModule.kt:367, :380). */
const SECURE_STORE_PREFS = 'SecureStore.xml';

/** Read through fs so a missing plugin fails an assertion, not the module load. */
function loadPlugin(): any {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return fs.existsSync(PLUGIN_FILE) ? require(PLUGIN_FILE) : null;
}

function rulesOf(section: any): Rule[] {
    const lines = (kind: Rule['kind']): Rule[] =>
        (section?.[kind] ?? []).map((line: any) => ({
            kind,
            domain: line.$?.domain,
            path: line.$?.path,
            ignore: line.$?.['tools:ignore'],
        }));
    return [...lines('include'), ...lines('exclude')];
}

/** Every section Android reads backup rules from, by name. */
async function sections(): Promise<Record<string, Rule[]>> {
    const plugin = loadPlugin();
    expect(plugin).not.toBeNull();
    const extraction: any = await XML.parseXMLAsync(plugin.DATA_EXTRACTION_RULES_XML);
    const full: any = await XML.parseXMLAsync(plugin.FULL_BACKUP_CONTENT_XML);
    return {
        'data-extraction-rules > cloud-backup': rulesOf(extraction['data-extraction-rules']['cloud-backup']?.[0]),
        'data-extraction-rules > device-transfer': rulesOf(extraction['data-extraction-rules']['device-transfer']?.[0]),
        'full-backup-content': rulesOf(full['full-backup-content']),
    };
}

const SECTION_NAMES = [
    'data-extraction-rules > cloud-backup',
    'data-extraction-rules > device-transfer',
    'full-backup-content',
];

describe('withAndroidBackupRules', () => {
    it.each(SECTION_NAMES)(
        'pass 82 a: %s excludes the database domain, the file domain and the SecureStore preferences',
        async (name) => {
            const excludes = (await sections())[name]
                .filter((rule) => rule.kind === 'exclude')
                .map(({ domain, path: rulePath }) => ({ domain, path: rulePath }));

            expect(excludes).toEqual(
                expect.arrayContaining([
                    { domain: 'database', path: '.' },
                    { domain: 'file', path: '.' },
                    { domain: 'sharedpref', path: SECURE_STORE_PREFS },
                ]),
            );
        },
    );

    // Owner decision 1 changes who owns the rules, not what is backed up.
    it.each(SECTION_NAMES)('scope: %s still includes the shared preferences and nothing else', async (name) => {
        const includes = (await sections())[name]
            .filter((rule) => rule.kind === 'include')
            .map(({ domain, path: rulePath }) => ({ domain, path: rulePath }));

        expect(includes).toEqual([{ domain: 'sharedpref', path: '.' }]);
    });

    // lintVitalRelease fails a release build on a FATAL lint issue, and an
    // exclude outside every include is one. The ignore stays on those lines
    // only, so lint still checks the include and the SecureStore exclude.
    it.each(SECTION_NAMES)('lint: in %s, exactly the excludes outside every include ignore FullBackupContent', async (name) => {
        const rules = (await sections())[name];
        const includedDomains = new Set(rules.filter((rule) => rule.kind === 'include').map((rule) => rule.domain));

        for (const rule of rules) {
            const outside = rule.kind === 'exclude' && !includedDomains.has(rule.domain);
            expect({ ...rule, ignore: rule.ignore ?? null }).toEqual({
                ...rule,
                ignore: outside ? 'FullBackupContent' : null,
            });
        }
    });

    it('pass 82 a: points the application at both rule files', async () => {
        const plugin = loadPlugin();
        expect(plugin).not.toBeNull();
        const manifest = (await XML.parseXMLAsync(
            '<manifest xmlns:android="http://schemas.android.com/apk/res/android"><application android:name=".MainApplication"/></manifest>',
        )) as unknown as AndroidConfig.Manifest.AndroidManifest;

        const application = AndroidConfig.Manifest.getMainApplicationOrThrow(plugin.setBackupRules(manifest)).$;

        expect(application['android:dataExtractionRules']).toBe('@xml/valto_data_extraction_rules');
        expect(application['android:fullBackupContent']).toBe('@xml/valto_full_backup_content');
    });

    it('pass 82 a: writes both rule files into res/xml', async () => {
        const plugin = loadPlugin();
        expect(plugin).not.toBeNull();

        const root = fs.mkdtempSync(path.join(os.tmpdir(), 'valto-backup-rules-'));
        try {
            const config = plugin({ name: 'valto', slug: 'valto' });
            await config.mods.android.dangerous({
                ...config,
                modResults: {},
                modRawConfig: config,
                modRequest: {
                    projectRoot: root,
                    platformProjectRoot: path.join(root, 'android'),
                    modName: 'dangerous',
                    platform: 'android',
                    introspect: false,
                },
            });

            const xmlDir = path.join(root, 'android', 'app', 'src', 'main', 'res', 'xml');
            expect(fs.readFileSync(path.join(xmlDir, 'valto_data_extraction_rules.xml'), 'utf8')).toBe(
                plugin.DATA_EXTRACTION_RULES_XML,
            );
            expect(fs.readFileSync(path.join(xmlDir, 'valto_full_backup_content.xml'), 'utf8')).toBe(
                plugin.FULL_BACKUP_CONTENT_XML,
            );
        } finally {
            fs.rmSync(root, { recursive: true, force: true });
        }
    });
});
