#!/usr/bin/env bash
# Builds the roscode studio app bundle from the compiled extension + VSCodium base
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT="$SCRIPT_DIR/.."
BUILD_DIR="$ROOT/../vscodium-build"
APP="$BUILD_DIR/roscode studio.app"
EXT_DIR="$APP/Contents/Resources/app/extensions/roscode"

echo "→ Compiling extension…"
cd "$ROOT" && node esbuild.js

echo "→ Syncing extension into app bundle…"
mkdir -p "$EXT_DIR"
cp -r "$ROOT/dist"        "$EXT_DIR/"
cp    "$ROOT/package.json" "$EXT_DIR/"
cp -r "$ROOT/media"       "$EXT_DIR/"

echo "→ Signing app bundle (ad-hoc)…"
xattr -cr "$APP"
codesign --force --deep --sign - "$APP" 2>&1 | tail -2

echo "✓ roscode studio.app ready at $APP"
echo "  Run: open \"$APP\""
