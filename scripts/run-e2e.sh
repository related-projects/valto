#!/usr/bin/env bash
#
# Run the Maestro end-to-end flows against a given Valto APK.
#
# Usage: scripts/run-e2e.sh <path-to-apk>
#
# The APK is the one built by EAS (profile "preview"); this script builds and
# downloads nothing. It expects exactly one running emulator or device on adb.
# It uninstalls the app if present (so the flows start from a fresh install),
# installs the APK, then runs every flow in .maestro/ in the order set by
# .maestro/config.yaml. The JUnit report and the Maestro artifacts are written
# to e2e-results/ (git-ignored). The exit status is non-zero on any failure.

set -euo pipefail

APP_ID="com.renkakpo.valto.app"
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
FLOWS_DIR="$REPO_ROOT/.maestro"
RESULTS_DIR="$REPO_ROOT/e2e-results"

die() {
    echo "run-e2e: $*" >&2
    exit 1
}

usage() {
    echo "Usage: scripts/run-e2e.sh <path-to-apk>" >&2
    exit 2
}

[ "$#" -eq 1 ] || usage
APK="$1"
[ -f "$APK" ] || die "APK not found: $APK"
case "$APK" in
    *.apk) ;;
    *) die "not an .apk file: $APK" ;;
esac

command -v adb >/dev/null 2>&1 || die "adb not found on PATH (install the Android SDK platform-tools)"
command -v maestro >/dev/null 2>&1 || die "maestro not found on PATH (install the Maestro CLI)"

# Exactly one device in the "device" state. Unauthorized or offline entries
# are not usable, and with two devices the target would be ambiguous.
DEVICES="$(adb devices | awk 'NR > 1 && $2 == "device" { print $1 }')"
COUNT="$(printf '%s\n' "$DEVICES" | grep -c . || true)"
if [ "$COUNT" -ne 1 ]; then
    adb devices >&2
    die "expected exactly one running emulator or device, found $COUNT"
fi
SERIAL="$DEVICES"
echo "run-e2e: device $SERIAL"

PACKAGES="$(adb -s "$SERIAL" shell pm list packages "$APP_ID" | tr -d '\r')"
if grep -qx "package:$APP_ID" <<< "$PACKAGES"; then
    echo "run-e2e: uninstalling $APP_ID"
    adb -s "$SERIAL" uninstall "$APP_ID" >/dev/null || die "uninstall failed: $APP_ID"
fi

echo "run-e2e: installing $APK"
adb -s "$SERIAL" install "$APK" || die "install failed: $APK"

mkdir -p "$RESULTS_DIR"
echo "run-e2e: running flows in $FLOWS_DIR"
STATUS=0
maestro --device "$SERIAL" test \
    --config "$FLOWS_DIR/config.yaml" \
    --format junit \
    --output "$RESULTS_DIR/report.xml" \
    --test-output-dir "$RESULTS_DIR/artifacts" \
    "$FLOWS_DIR" || STATUS=$?

echo "run-e2e: report at $RESULTS_DIR/report.xml"
if [ "$STATUS" -ne 0 ]; then
    die "flows failed (maestro exit status $STATUS)"
fi
echo "run-e2e: all flows passed"
