const fs = require("fs");
const path = require("path");
const { AndroidConfig, withAndroidManifest, withDangerousMod } = require("expo/config-plugins");

// Valto owns its Android backup rules (pass 82, Owner decision 1).
//
// allowBackup stays true (Expo's default), so Android reads these rules for
// cloud backups and phone transfers: data-extraction-rules on Android 12 and
// later, full-backup-content on Android 11 and earlier. Until now the only
// rules were expo-secure-store's (app.json now sets its configureAndroidBackup
// to false), and valto.db and the AsyncStorage database stayed out only
// because Android backs up nothing outside an include.
//
// Every section names what must never leave the device: the database domain
// (valto.db, RKStorage), the file domain, and the SecureStore preferences file
// that holds the database key. What is backed up does not change: the one
// include is every shared preference, as before.
//
// The database and file excludes sit outside that include, which Android lint
// reports as "is not in an included path" (FullBackupContent, a FATAL issue:
// it fails lintVitalRelease). They are there so that widening the include can
// never pull those domains in, so each carries tools:ignore="FullBackupContent"
// and nothing else does: lint still checks the include and the SecureStore
// exclude.
const DATA_EXTRACTION_RULES = "valto_data_extraction_rules";
const FULL_BACKUP_CONTENT = "valto_full_backup_content";

const RULES = [
  '<include domain="sharedpref" path="."/>',
  '<exclude domain="sharedpref" path="SecureStore.xml"/>',
  '<exclude domain="database" path="." tools:ignore="FullBackupContent"/>',
  '<exclude domain="file" path="." tools:ignore="FullBackupContent"/>',
];

function rulesAt(indent) {
  return RULES.map((rule) => `${indent}${rule}\n`).join("");
}

const XML_HEADER = '<?xml version="1.0" encoding="utf-8"?>\n';
const TOOLS_NS = 'xmlns:tools="http://schemas.android.com/tools"';

const DATA_EXTRACTION_RULES_XML =
  XML_HEADER +
  "<!-- Android 12 and later. Written by plugins/withAndroidBackupRules.js. -->\n" +
  `<data-extraction-rules ${TOOLS_NS}>\n` +
  "  <cloud-backup>\n" +
  rulesAt("    ") +
  "  </cloud-backup>\n" +
  "  <device-transfer>\n" +
  rulesAt("    ") +
  "  </device-transfer>\n" +
  "</data-extraction-rules>\n";

const FULL_BACKUP_CONTENT_XML =
  XML_HEADER +
  "<!-- Android 11 and earlier. Written by plugins/withAndroidBackupRules.js. -->\n" +
  `<full-backup-content ${TOOLS_NS}>\n` +
  rulesAt("  ") +
  "</full-backup-content>\n";

function setBackupRules(androidManifest) {
  const application = AndroidConfig.Manifest.getMainApplicationOrThrow(androidManifest);
  application.$["android:dataExtractionRules"] = `@xml/${DATA_EXTRACTION_RULES}`;
  application.$["android:fullBackupContent"] = `@xml/${FULL_BACKUP_CONTENT}`;
  return androidManifest;
}

module.exports = function withAndroidBackupRules(config) {
  config = withAndroidManifest(config, (cfg) => {
    cfg.modResults = setBackupRules(cfg.modResults);
    return cfg;
  });
  return withDangerousMod(config, [
    "android",
    async (cfg) => {
      const xmlDir = path.join(cfg.modRequest.platformProjectRoot, "app", "src", "main", "res", "xml");
      await fs.promises.mkdir(xmlDir, { recursive: true });
      await fs.promises.writeFile(path.join(xmlDir, `${DATA_EXTRACTION_RULES}.xml`), DATA_EXTRACTION_RULES_XML);
      await fs.promises.writeFile(path.join(xmlDir, `${FULL_BACKUP_CONTENT}.xml`), FULL_BACKUP_CONTENT_XML);
      return cfg;
    },
  ]);
};

module.exports.setBackupRules = setBackupRules;
module.exports.DATA_EXTRACTION_RULES = DATA_EXTRACTION_RULES;
module.exports.FULL_BACKUP_CONTENT = FULL_BACKUP_CONTENT;
module.exports.DATA_EXTRACTION_RULES_XML = DATA_EXTRACTION_RULES_XML;
module.exports.FULL_BACKUP_CONTENT_XML = FULL_BACKUP_CONTENT_XML;
