#!/usr/bin/env bash
set -e

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ZIP="$REPO_ROOT/vscodium-build/VSCodium.zip"
WORK="$REPO_ROOT/vscodium-build/work"
OUT="$REPO_ROOT/roscode-studio-build/roscode studio.app"
EXT_SRC="$REPO_ROOT/roscode-extension"

echo "🔧 roscode studio — patch pipeline"
echo "   zip:  $ZIP"
echo "   out:  $OUT"
echo ""

# ── 1. Unzip fresco ────────────────────────────────────────────────────────
echo "📦 Unzipping VSCodium..."
rm -rf "$WORK" && mkdir -p "$WORK"
unzip -q "$ZIP" -d "$WORK"

APP=$(find "$WORK" -name "*.app" -maxdepth 2 | head -1)
if [ -z "$APP" ]; then
  echo "❌ No .app found in zip"
  exit 1
fi
RESOURCES="$APP/Contents/Resources/app"
echo "   app: $APP"

# ── 2. Patch product.json ──────────────────────────────────────────────────
echo "🏷  Patching product.json..."
python3 "$REPO_ROOT/scripts/patch-product.py" "$RESOURCES/product.json"

# ── 3. Inject CSS nuclear ─────────────────────────────────────────────────
echo "💉 Injecting nuclear CSS..."

# Primary target — electron-browser workbench
python3 "$REPO_ROOT/scripts/inject-css.py" \
  "$RESOURCES/out/vs/code/electron-browser/workbench/workbench.html" 2>/dev/null || true

# Fallback targets (electron-sandbox variants in newer builds)
for html in \
  "$RESOURCES/out/vs/code/electron-sandbox/workbench/workbench.html" \
  "$RESOURCES/out/vs/workbench/workbench.html" \
  "$APP/Contents/Resources/app/out/vs/workbench/workbench.html"; do
  [ -f "$html" ] && python3 "$REPO_ROOT/scripts/inject-css.py" "$html"
done

# web.main.nls.js is a JS file — inject-css.py will skip it (not HTML)
# Keeping the call for parity with PLAN.md; the warning is expected
python3 "$REPO_ROOT/scripts/inject-css.py" \
  "$RESOURCES/out/vs/workbench/workbench.web.main.nls.js" 2>/dev/null || true

# ── 4. Copiar ícono custom ─────────────────────────────────────────────────
ICNS="$REPO_ROOT/roscode-studio-build/roscode-studio.icns"
if [ -f "$ICNS" ]; then
  echo "🎨 Installing custom icon..."
  cp "$ICNS" "$APP/Contents/Resources/VSCodium.icns"
else
  echo "⚠️  No roscode-studio.icns found at $ICNS — keeping original icon"
fi

# ── 5. Build extensión ────────────────────────────────────────────────────
echo "🔨 Building roscode extension..."
cd "$EXT_SRC"
pnpm run package --silent 2>/dev/null || pnpm run package
cd "$REPO_ROOT"

# ── 6. Instalar extensión como built-in ──────────────────────────────────
echo "🔌 Installing extension as built-in..."
BUILTIN="$RESOURCES/extensions/roscode"
rm -rf "$BUILTIN" && mkdir -p "$BUILTIN"
# .vsix es un zip renombrado
unzip -q "$EXT_SRC/roscode-0.1.0.vsix" -d "$BUILTIN/tmp"
cp -r "$BUILTIN/tmp/extension/." "$BUILTIN/"
rm -rf "$BUILTIN/tmp"
echo "   installed: $BUILTIN"

# ── 7. Copiar al destino final ────────────────────────────────────────────
echo "📁 Copying to output..."
rm -rf "$OUT"
cp -r "$APP" "$OUT"

echo ""
echo "✅ roscode studio.app listo en roscode-studio-build/"
echo "   open \"$OUT\""
