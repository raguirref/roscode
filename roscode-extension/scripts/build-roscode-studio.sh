#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────
#  build-roscode-studio.sh
#  Produces /Applications/roscode studio.app from a Homebrew-installed
#  VSCodium base. Re-runnable: each run rebuilds the bundle cleanly.
#  No sudo required.
# ─────────────────────────────────────────────────────────────────
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
EXT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
REPO_ROOT="$(cd "$EXT_ROOT/.." && pwd)"
BUILD_DIR="$REPO_ROOT/roscode-studio-build"

VSCODIUM_SRC="/Applications/VSCodium.app"
APP_DST="/Applications/roscode studio.app"
APP_STAGE="$BUILD_DIR/roscode studio.app"
LOGO_PNG="$REPO_ROOT/studio/src/assets/logo.png"

info() { printf "\033[1;36m→\033[0m %s\n" "$*"; }
done_ok() { printf "\033[1;32m✓\033[0m %s\n" "$*"; }

# ── 1. Prerequisites ─────────────────────────────────────────────
[ -d "$VSCODIUM_SRC" ] || { echo "VSCodium not installed. Run: brew install --cask vscodium"; exit 1; }
[ -f "$LOGO_PNG" ]    || { echo "Logo not found at $LOGO_PNG"; exit 1; }

mkdir -p "$BUILD_DIR"

# ── 2. Generate .icns from logo.png ──────────────────────────────
info "Generating roscode .icns icon"
rm -rf "$BUILD_DIR/roscode-studio.iconset"
mkdir -p "$BUILD_DIR/roscode-studio.iconset"
for size in 16 32 128 256 512; do
  sips -z $size $size "$LOGO_PNG" --out "$BUILD_DIR/roscode-studio.iconset/icon_${size}x${size}.png" >/dev/null 2>&1
  dbl=$((size*2))
  sips -z $dbl $dbl "$LOGO_PNG" --out "$BUILD_DIR/roscode-studio.iconset/icon_${size}x${size}@2x.png" >/dev/null 2>&1
done
iconutil -c icns "$BUILD_DIR/roscode-studio.iconset" -o "$BUILD_DIR/roscode-studio.icns"
done_ok "icon generated"

# ── 3. Build extension ────────────────────────────────────────────
info "Compiling roscode extension"
(cd "$EXT_ROOT" && node esbuild.js >/dev/null)
done_ok "extension compiled"

# ── 4. Stage fresh copy of VSCodium ──────────────────────────────
info "Staging VSCodium copy at $APP_STAGE"
rm -rf "$APP_STAGE"
cp -R "$VSCODIUM_SRC" "$APP_STAGE"
done_ok "staged"

# ── 5. Swap icons ────────────────────────────────────────────────
info "Installing roscode icon"
cp "$BUILD_DIR/roscode-studio.icns" "$APP_STAGE/Contents/Resources/Code.icns"
cp "$BUILD_DIR/roscode-studio.icns" "$APP_STAGE/Contents/Resources/VSCodium.icns"
cp "$BUILD_DIR/roscode-studio.icns" "$APP_STAGE/Contents/Resources/roscode-studio.icns"
done_ok "icons swapped"

# ── 6. Rebrand Info.plist ────────────────────────────────────────
info "Rebranding Info.plist"
PLIST="$APP_STAGE/Contents/Info.plist"
/usr/libexec/PlistBuddy -c "Set :CFBundleName 'roscode studio'"          "$PLIST"
/usr/libexec/PlistBuddy -c "Set :CFBundleDisplayName 'roscode studio'"   "$PLIST"
/usr/libexec/PlistBuddy -c "Set :CFBundleIdentifier 'com.roscode.studio'" "$PLIST"
/usr/libexec/PlistBuddy -c "Set :CFBundleURLTypes:0:CFBundleURLName 'roscode studio'" "$PLIST" 2>/dev/null || true
/usr/libexec/PlistBuddy -c "Set :CFBundleURLTypes:0:CFBundleURLSchemes:0 'roscode-studio'" "$PLIST" 2>/dev/null || true
done_ok "Info.plist rebranded"

# ── 7. Rebrand product.json ──────────────────────────────────────
info "Rebranding product.json"
python3 - <<PY
import json
p = "$APP_STAGE/Contents/Resources/app/product.json"
d = json.load(open(p))
d["nameShort"] = "roscode studio"
d["nameLong"] = "roscode studio"
d["applicationName"] = "roscode-studio"
d["dataFolderName"] = ".roscode-studio"
d["win32MutexName"] = "roscode-studio"
d["darwinBundleIdentifier"] = "com.roscode.studio"
d["urlProtocol"] = "roscode-studio"
d["reportIssueUrl"]   = "https://github.com/raguirref/roscode/issues/new"
d["documentationUrl"] = "https://github.com/raguirref/roscode"
d["releaseNotesUrl"]  = "https://github.com/raguirref/roscode/releases"
d["extensionsGallery"] = {
    "serviceUrl": "https://open-vsx.org/vscode/gallery",
    "itemUrl": "https://open-vsx.org/vscode/item",
    "resourceUrlTemplate": "https://open-vsx.org/vscode/unpkg/{publisher}/{name}/{version}/{path}"
}
d["enableTelemetry"] = False
# Clear file checksums so our modified workbench.html / bundled extension
# don't trigger "Your installation appears to be corrupt" warning.
d["checksums"] = {}
d["checksumFailMoreInfoUrl"] = ""
json.dump(d, open(p,"w"), indent=2)
PY
done_ok "product.json rebranded"

# ── 8. Install roscode extension as built-in ─────────────────────
info "Bundling roscode extension as built-in"
BUILTIN="$APP_STAGE/Contents/Resources/app/extensions/roscode"
rm -rf "$BUILTIN"
mkdir -p "$BUILTIN"
cp    "$EXT_ROOT/package.json" "$BUILTIN/"
cp -R "$EXT_ROOT/dist"          "$BUILTIN/"
cp -R "$EXT_ROOT/media"         "$BUILTIN/"
cp -R "$EXT_ROOT/themes"        "$BUILTIN/"
[ -f "$EXT_ROOT/package.nls.json" ] && cp "$EXT_ROOT/package.nls.json" "$BUILTIN/" || echo '{}' > "$BUILTIN/package.nls.json"
done_ok "extension bundled"

# ── 9. Rename Electron helpers → roscode studio Helper* ──────────
info "Renaming Electron helpers"
FRAMEWORKS="$APP_STAGE/Contents/Frameworks"
for variant in "" " (GPU)" " (Plugin)" " (Renderer)"; do
  OLD_DIR="$FRAMEWORKS/VSCodium Helper${variant}.app"
  NEW_DIR="$FRAMEWORKS/roscode studio Helper${variant}.app"
  [ -d "$OLD_DIR" ] || continue
  mv "$OLD_DIR" "$NEW_DIR"
  OLD_BIN="$NEW_DIR/Contents/MacOS/VSCodium Helper${variant}"
  NEW_BIN="$NEW_DIR/Contents/MacOS/roscode studio Helper${variant}"
  [ -f "$OLD_BIN" ] && mv "$OLD_BIN" "$NEW_BIN"
  HPLIST="$NEW_DIR/Contents/Info.plist"
  /usr/libexec/PlistBuddy -c "Set :CFBundleName 'roscode studio Helper${variant}'"        "$HPLIST" 2>/dev/null || true
  /usr/libexec/PlistBuddy -c "Set :CFBundleDisplayName 'roscode studio Helper${variant}'" "$HPLIST" 2>/dev/null || true
  /usr/libexec/PlistBuddy -c "Set :CFBundleExecutable 'roscode studio Helper${variant}'"  "$HPLIST" 2>/dev/null || true
  /usr/libexec/PlistBuddy -c "Set :CFBundleIdentifier 'com.roscode.studio.helper${variant// /}'" "$HPLIST" 2>/dev/null || true
done
done_ok "helpers renamed"

# ── 10. Remove quarantine & ad-hoc re-sign ───────────────────────
info "Signing bundle"
xattr -cr "$APP_STAGE"
codesign --force --deep --sign - "$APP_STAGE" 2>&1 | tail -2
done_ok "signed"

# ── 11. Install into /Applications ───────────────────────────────
info "Installing to $APP_DST"
# Kill any running instance first
pkill -f "/Applications/roscode studio.app" 2>/dev/null || true
sleep 1
rm -rf "$APP_DST"
cp -R "$APP_STAGE" "$APP_DST"
xattr -cr "$APP_DST"
codesign --force --deep --sign - "$APP_DST" 2>&1 | tail -1
done_ok "installed"

echo
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  roscode studio.app is ready at $APP_DST"
echo "  open \"$APP_DST\""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
