#!/usr/bin/env bash
# build-studio.sh — fork VSCodium into "roscode studio" standalone IDE
#
# What this does:
#   1. Extract vscodium-build/VSCodium.zip → vscodium-build/out/
#   2. Patch resources/app/product.json (rebrand)
#   3. Inject roscode-extension/themes/workbench.css into workbench.html
#   4. Extract roscode-0.1.0.vsix into resources/app/extensions/roscode/
#   5. Rename VSCodium.exe → roscode-studio.exe
#   6. Zip as dist/roscode-studio-win32-x64.zip
#
# Run from repo root:  bash scripts/build-studio.sh

set -euo pipefail

RED=$'\033[31m'; GRN=$'\033[32m'; YEL=$'\033[33m'; BLD=$'\033[1m'; NC=$'\033[0m'
ok()    { echo "${GRN}✓${NC} $*"; }
info()  { echo "${BLD}→${NC} $*"; }
warn()  { echo "${YEL}⚠${NC} $*"; }
fail()  { echo "${RED}✗${NC} $*"; exit 1; }

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

VSCODIUM_ZIP="vscodium-build/VSCodium.zip"
OUT="vscodium-build/out"
DIST="dist"
VSIX="roscode-extension/roscode-0.1.0.vsix"
WORKBENCH_CSS="roscode-extension/themes/workbench.css"

[ -f "$VSCODIUM_ZIP" ] || fail "VSCodium.zip not found. Download first: curl -L -o $VSCODIUM_ZIP https://github.com/VSCodium/vscodium/releases/download/1.112.01907/VSCodium-win32-x64-1.112.01907.zip"
[ -f "$VSIX" ]         || fail "roscode-0.1.0.vsix not found. Run: cd roscode-extension && pnpm run package"

# ══ 1. Extract ══════════════════════════════════════════════════════
info "1/6 Extracting VSCodium …"
rm -rf "$OUT"
mkdir -p "$OUT"
unzip -q "$VSCODIUM_ZIP" -d "$OUT"
ok "extracted to $OUT"

# Find the app root (VSCodium.exe lives here)
APP_ROOT="$OUT"
[ -f "$APP_ROOT/VSCodium.exe" ] || APP_ROOT="$(find "$OUT" -maxdepth 2 -name VSCodium.exe -print -quit | xargs dirname)"
[ -f "$APP_ROOT/VSCodium.exe" ] || fail "could not locate VSCodium.exe in $OUT"
ok "app root: $APP_ROOT"

RESOURCES="$APP_ROOT/resources/app"

# ══ 2. Patch product.json ═══════════════════════════════════════════
info "2/6 Rebranding product.json …"
PRODUCT_JSON="$RESOURCES/product.json"
[ -f "$PRODUCT_JSON" ] || fail "product.json missing at $PRODUCT_JSON"

node -e '
const fs = require("fs");
const path = process.argv[1];
const p = JSON.parse(fs.readFileSync(path, "utf8"));
Object.assign(p, {
  nameShort: "roscode",
  nameLong: "roscode studio",
  applicationName: "roscode",
  dataFolderName: ".roscode-studio",
  win32AppUserModelId: "Anthropic.RoscodeStudio",
  win32MutexName: "roscodestudio",
  win32DirName: "roscode studio",
  win32NameVersion: "roscode studio",
  win32RegValueName: "roscodestudio",
  win32ShellNameShort: "roscode studio",
  darwinBundleIdentifier: "com.anthropic.roscode-studio",
  linuxIconName: "roscode-studio",
  serverApplicationName: "roscode-studio-server",
  serverDataFolderName: ".roscode-studio-server",
  urlProtocol: "roscode-studio",
  reportIssueUrl: "https://github.com/rickycrack/roscode/issues",
  licenseUrl: "https://github.com/rickycrack/roscode/blob/main/LICENSE",
  documentationUrl: "https://github.com/rickycrack/roscode",
});
fs.writeFileSync(path, JSON.stringify(p, null, 2));
console.log("rebranded:", Object.keys(p).length, "fields");
' "$PRODUCT_JSON"
ok "product.json patched"

# ══ 3. Inject workbench.css ═════════════════════════════════════════
info "3/6 Injecting workbench CSS …"
WB_HTML=""
for candidate in \
  "$RESOURCES/out/vs/code/electron-sandbox/workbench/workbench.html" \
  "$RESOURCES/out/vs/code/electron-browser/workbench/workbench.html" \
  "$RESOURCES/out/vs/code/electron-sandbox/workbench/workbench.esm.html"; do
  [ -f "$candidate" ] && WB_HTML="$candidate" && break
done
[ -n "$WB_HTML" ] || fail "workbench.html not found under $RESOURCES/out"
ok "workbench: $WB_HTML"

cp "$WORKBENCH_CSS" "$(dirname "$WB_HTML")/roscode-brand.css"

MARKER="<!-- roscode-brand -->"
if ! grep -q "$MARKER" "$WB_HTML"; then
  node -e '
const fs = require("fs");
const p = process.argv[1];
let s = fs.readFileSync(p, "utf8");
const inject = `\t<!-- roscode-brand -->\n\t<link rel="stylesheet" href="./roscode-brand.css">\n</head>`;
s = s.replace("</head>", inject);
fs.writeFileSync(p, s);
' "$WB_HTML"
  ok "css injected"
else
  ok "css already injected (skipped)"
fi

# ══ 4. Bake .vsix as builtin extension ══════════════════════════════
info "4/6 Baking roscode-extension as builtin …"
EXT_DIR="$RESOURCES/extensions/roscode"
rm -rf "$EXT_DIR"
mkdir -p "$EXT_DIR"
# .vsix is a zip with "extension/" at root — we want its contents at EXT_DIR root
TMPEXT=$(mktemp -d)
unzip -q "$VSIX" -d "$TMPEXT"
cp -r "$TMPEXT/extension/"* "$EXT_DIR/"
rm -rf "$TMPEXT"
ok "extension at $EXT_DIR"

# ══ 5. Rename executable ════════════════════════════════════════════
info "5/6 Renaming executable …"
if [ -f "$APP_ROOT/VSCodium.exe" ]; then
  mv "$APP_ROOT/VSCodium.exe" "$APP_ROOT/roscode-studio.exe"
  ok "VSCodium.exe → roscode-studio.exe"
fi
# Also the helper bin script
if [ -f "$APP_ROOT/bin/codium.cmd" ]; then
  mv "$APP_ROOT/bin/codium.cmd" "$APP_ROOT/bin/roscode-studio.cmd"
  ok "bin/codium.cmd → bin/roscode-studio.cmd"
fi

# ══ 6. Package portable zip ═════════════════════════════════════════
info "6/6 Packaging portable zip …"
mkdir -p "$DIST"
ZIP_OUT="$DIST/roscode-studio-win32-x64.zip"
rm -f "$ZIP_OUT"

ZIP_SRC_WIN="$(cygpath -w "$APP_ROOT" 2>/dev/null || echo "$APP_ROOT")"
ZIP_OUT_WIN="$(cygpath -w "$ROOT/$ZIP_OUT" 2>/dev/null || echo "$ROOT/$ZIP_OUT")"

if command -v zip >/dev/null 2>&1; then
  (cd "$(dirname "$APP_ROOT")" && zip -rq "$ROOT/$ZIP_OUT" "$(basename "$APP_ROOT")")
elif command -v 7z >/dev/null 2>&1; then
  7z a -tzip -bsp0 -bso0 "$ROOT/$ZIP_OUT" "$APP_ROOT"
elif command -v powershell >/dev/null 2>&1 || command -v pwsh >/dev/null 2>&1; then
  PS="$(command -v pwsh || command -v powershell)"
  "$PS" -NoProfile -Command "Compress-Archive -Path '$ZIP_SRC_WIN\\*' -DestinationPath '$ZIP_OUT_WIN' -Force"
else
  warn "no zip/7z/powershell — skipping archive; binary still ready at $APP_ROOT"
  ZIP_OUT=""
fi

if [ -n "$ZIP_OUT" ] && [ -f "$ZIP_OUT" ]; then
  SIZE=$(du -h "$ZIP_OUT" | cut -f1)
  ok "built $ZIP_OUT ($SIZE)"
fi

echo
echo "${BLD}${GRN}✓ roscode studio built${NC}"
echo
echo "  run:    $APP_ROOT/roscode-studio.exe"
echo "  dist:   $DIST/roscode-studio-win32-x64.zip"
echo
