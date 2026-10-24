const { AndroidConfig, withAndroidStyles } = require("expo/config-plugins");

// android:statusBarColor is deprecated from API 35 and ignored once the app is
// edge-to-edge. Nothing in app.json asks for it: the splash screen plugin
// copies its backgroundColor into androidStatusBar.backgroundColor, and the
// default StatusBar plugin then writes that colour into AppTheme. Removing it
// here leaves the splash configuration exactly as it is.
//
// Order: prebuild registers its default plugins (StatusBar included) after the
// ones listed in app.json, and a mod registered later runs earlier. So this mod
// always sees the item already written, wherever it sits in app.json.
const STATUS_BAR_COLOR = "android:statusBarColor";

function removeStatusBarColor(styles) {
  return AndroidConfig.Styles.removeStylesItem({
    name: STATUS_BAR_COLOR,
    xml: styles,
    parent: AndroidConfig.Styles.getAppThemeGroup(),
  });
}

module.exports = function withoutStatusBarColor(config) {
  return withAndroidStyles(config, (cfg) => {
    cfg.modResults = removeStatusBarColor(cfg.modResults);
    return cfg;
  });
};

module.exports.removeStatusBarColor = removeStatusBarColor;
