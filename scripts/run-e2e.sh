#!/usr/bin/env bash
#
# Run the Maestro end-to-end flows against a given Valto APK.
#
# Usage: scripts/run-e2e.sh <path-to-apk>
#
# The APK is the one built by EAS (profile "preview"); this script builds and
# downloads nothing. It expects exactly one running emulator or device on adb.
# It waits until the device reports sys.boot_completed=1, then lets it settle,
# uninstalls the app if present (so the flows start from a fresh install),
# installs the APK, then runs every flow in .maestro/ in the order set by
# .maestro/config.yaml. The JUnit report and the Maestro artifacts are written
# to e2e-results/ (git-ignored). The exit status is non-zero on any failure.
#
# Environment (whole numbers of seconds):
#   VALTO_E2E_BOOT_TIMEOUT    longest wait for sys.boot_completed (default 600)
#   VALTO_E2E_SETTLE_SECONDS  pause after the boot completes (default 120)

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

BOOT_TIMEOUT="${VALTO_E2E_BOOT_TIMEOUT:-600}"
SETTLE_SECONDS="${VALTO_E2E_SETTLE_SECONDS:-120}"
case "$BOOT_TIMEOUT" in
    '' | *[!0-9]*) die "VALTO_E2E_BOOT_TIMEOUT must be a whole number of seconds: '$BOOT_TIMEOUT'" ;;
esac
case "$SETTLE_SECONDS" in
    '' | *[!0-9]*) die "VALTO_E2E_SETTLE_SECONDS must be a whole number of seconds: '$SETTLE_SECONDS'" ;;
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

# adb lists an emulator as "device" before Android has finished starting, and
# an install or a flow started then fails for reasons that are not the app's.
# Wait for the boot to complete, then give the system time to settle before
# installing anything.
echo "run-e2e: waiting for $SERIAL to finish booting (up to ${BOOT_TIMEOUT}s)"
WAITED=0
until [ "$(adb -s "$SERIAL" shell getprop sys.boot_completed 2>/dev/null | tr -d '\r' || true)" = "1" ]; do
    if [ "$WAITED" -ge "$BOOT_TIMEOUT" ]; then
        die "device $SERIAL did not finish booting within ${BOOT_TIMEOUT}s"
    fi
    sleep 2
    WAITED=$((WAITED + 2))
done
echo "run-e2e: boot completed; settling for ${SETTLE_SECONDS}s"
sleep "$SETTLE_SECONDS"

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
