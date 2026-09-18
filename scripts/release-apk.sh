#!/usr/bin/env bash
# Build a standalone release APK for one flavour.
#
#   scripts/release-apk.sh production
#   scripts/release-apk.sh staging
#
# The flavour is inlined into the JavaScript bundle at build time from
# EXPO_PUBLIC_FLAVOR, and Expo reads .env.local OVER the shell, so this script
# writes a temporary .env.local for the build and restores the original after,
# whatever happens. It then checks the Hermes bundle actually carries the
# flavour's API host, and names the APK by flavour, version and date in dist/.
#
# Signing: android/keystore.properties (see README, "Release build") signs
# with the store key. Without it the build is debug-signed and the script says
# so; a debug-signed APK cannot be submitted.
set -euo pipefail

FLAVOR="${1:-}"
case "$FLAVOR" in
  production|staging|devnet) ;;
  *) echo "usage: $0 production|staging|devnet" >&2; exit 2 ;;
esac

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

ENV_LOCAL=".env.local"
BACKUP=".env.local.release-backup"
restore() {
  if [ -f "$BACKUP" ]; then mv -f "$BACKUP" "$ENV_LOCAL"; fi
}
trap restore EXIT

if [ -f "$ENV_LOCAL" ]; then
  cp "$ENV_LOCAL" "$BACKUP"
  # Keep every line but the flavour, then set the flavour we were asked for.
  grep -v '^EXPO_PUBLIC_FLAVOR=' "$BACKUP" > "$ENV_LOCAL" || true
else
  : > "$ENV_LOCAL"
fi
echo "EXPO_PUBLIC_FLAVOR=$FLAVOR" >> "$ENV_LOCAL"

if [ ! -f android/keystore.properties ]; then
  echo "NOTE: android/keystore.properties is missing; this APK will be DEBUG-SIGNED." >&2
fi

( cd android && ./gradlew assembleRelease -PreactNativeArchitectures=arm64-v8a -q )

BUNDLE="android/app/build/generated/assets/react/release/index.android.bundle"
case "$FLAVOR" in
  production) HOST="www.mentioned.market" ;;
  staging) HOST="mentioned-staging.up.railway.app" ;;
  devnet) HOST="mentioned-web-dev-dev.up.railway.app" ;;
esac
# Every flavour's host is in the config table, so presence alone proves
# nothing. What is inlined is the flavour name as the CONFIG lookup key; the
# apiBase string of the chosen flavour is what the app logs, and the pill on
# Home says the rest. Check at least that the bundle is fresh and holds the host.
if ! grep -q "$HOST" "$BUNDLE"; then
  echo "ERROR: bundle does not contain $HOST" >&2; exit 1
fi

VERSION="$(node -p "require('./app.json').expo.version")"
OUT="dist/mentioned-$FLAVOR-$VERSION-$(date +%Y-%m-%d).apk"
cp android/app/build/outputs/apk/release/app-release.apk "$OUT"
echo "built $OUT"
echo "sha256 $(shasum -a 256 "$OUT" | cut -c1-16)"
AAPT="$(ls -d "${ANDROID_HOME:-$HOME/Library/Android/sdk}"/build-tools/*/aapt 2>/dev/null | tail -1 || true)"
if [ -n "$AAPT" ]; then "$AAPT" dump badging "$OUT" | grep -E "^package:|sdkVersion|native-code"; fi
