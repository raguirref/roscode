#!/usr/bin/env bash
set -e

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ZIP="$REPO_ROOT/vscodium-build/VSCodium.zip"
WORK="$REPO_ROOT/vscodium-build/work"
OUT="$REPO_ROOT/roscode-studio-build/roscode studio.app"

echo "🔧 roscode studio — standalone IDE build"
echo "   zip:  $ZIP"
echo "   out:  $OUT"
echo ""

# ── 1. Unzip fresh VSCodium ────────────────────────────────────────────────
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

# ── 2. Patch product.json — branding ──────────────────────────────────────
echo "🏷  Patching product.json..."
python3 "$REPO_ROOT/scripts/patch-product.py" "$RESOURCES/product.json"

# ── 3. Inject roscode design system into workbench HTML ───────────────────
echo "💉 Injecting roscode workbench (CSS + agent panel HTML + JS)..."

# Primary target
python3 "$REPO_ROOT/scripts/inject-css.py" \
  "$RESOURCES/out/vs/code/electron-browser/workbench/workbench.html" 2>/dev/null || true

# Fallback targets (electron-sandbox variants in newer VSCodium builds)
for html in \
  "$RESOURCES/out/vs/code/electron-sandbox/workbench/workbench.html" \
  "$RESOURCES/out/vs/workbench/workbench.html"; do
  [ -f "$html" ] && python3 "$REPO_ROOT/scripts/inject-css.py" "$html"
done

# ── 4. Custom icon ─────────────────────────────────────────────────────────
ICNS="$REPO_ROOT/roscode-studio-build/roscode-studio.icns"
if [ -f "$ICNS" ]; then
  echo "🎨 Installing custom icon..."
  cp "$ICNS" "$APP/Contents/Resources/VSCodium.icns"
else
  echo "⚠️  No roscode-studio.icns found — keeping original icon"
fi

# ── 5. Patch workbench.desktop.main.js — layout defaults ──────────────────
echo "🩺 Patching workbench defaults..."
python3 - "$RESOURCES/out/vs/workbench/workbench.desktop.main.js" << 'PYEOF'
import sys, os, re
path = sys.argv[1]
if not os.path.exists(path):
    print(f"  skip: {path} not found"); sys.exit(0)
content = open(path).read()
patches = [
    # 1. Keep activity bar visible (we style it ourselves, not hide it)
    #    default was already "default"; make sure it's not hidden
    ('"workbench.activityBar.location":{type:"string",enum:["default","top","bottom","hidden"],default:"hidden"',
     '"workbench.activityBar.location":{type:"string",enum:["default","top","bottom","hidden"],default:"default"'),
    # 2. Show auxiliary bar (right agent panel) by default
    ('default:"visibleInWorkspace",description:d(4767,null)',
     'default:"visible",description:d(4767,null)'),
    # 3. Don't auto-open Explorer sidebar on startup — clean slate
    ('},0,{isDefault:!0})',
     '},0,{isDefault:!1})'),
    # 4. Remove "Restricted Mode" welcome banner
    ('"security.workspace.trust.banner":"untilDismissed"',
     '"security.workspace.trust.banner":"never"'),
    # 5. Disable update notifications
    ('"update.mode":"default"',
     '"update.mode":"none"'),
]
applied = 0
for old, new in patches:
    if content.count(old) == 1:
        content = content.replace(old, new, 1)
        applied += 1
        print(f"  ✓ patched: {old[:65]}...")
    elif content.count(old) == 0:
        print(f"  - skip (not found): {old[:65]}...")
    else:
        print(f"  ⚠ skip ({content.count(old)} matches): {old[:65]}...")
open(path, 'w').write(content)
print(f"  applied {applied}/{len(patches)} patches")
PYEOF

echo "📁 Copying to output..."
rm -rf "$OUT"
cp -r "$APP" "$OUT"

# ── 8. Strip firma vieja + ad-hoc re-sign (Electron-correct) ─────────────
# Regla: firmar solo binarios individuales, nunca el wrapper de framework.
# Orden: dylibs → framework binaries → helpers → main binary → app bundle.
echo "🔏 Re-signing (ad-hoc)..."

xattr -cr "$OUT" 2>/dev/null || true
find "$OUT" -name "_CodeSignature" -type d -exec rm -rf {} + 2>/dev/null || true

FW="$OUT/Contents/Frameworks"
EFA="$FW/Electron Framework.framework/Versions/A"

# Paso 1: dylibs de Electron Framework
for lib in "$EFA/Libraries/"*.dylib; do
  [ -f "$lib" ] && codesign --sign - --force "$lib" 2>/dev/null && echo "   signed: $(basename "$lib")" || true
done

# Paso 2: crash handler
[ -f "$EFA/Helpers/chrome_crashpad_handler" ] && \
  codesign --sign - --force "$EFA/Helpers/chrome_crashpad_handler" 2>/dev/null || true

# Paso 3: Electron Framework binary (Mach-O, no el .framework wrapper)
[ -f "$EFA/Electron Framework" ] && \
  codesign --sign - --force "$EFA/Electron Framework" 2>/dev/null && \
  echo "   signed: Electron Framework binary" || true

# Paso 4: Otros frameworks (Mantle, ReactiveObjC, Squirrel) — son .dylib-style, sin subdirs
for fwk in "$FW/Mantle.framework" "$FW/ReactiveObjC.framework" "$FW/Squirrel.framework"; do
  [ -d "$fwk" ] && codesign --sign - --force "$fwk" 2>/dev/null && \
    echo "   signed: $(basename "$fwk")" || true
done

# Paso 5: Helper .app bundles (estos SÍ son bundles normales)
for helper in "$FW/"*.app; do
  [ -d "$helper" ] && \
    codesign --sign - --force --deep "$helper" 2>/dev/null && \
    echo "   signed: $(basename "$helper")" || true
done

# Paso 6: Binario principal
codesign --sign - --force "$OUT/Contents/MacOS/VSCodium" 2>/dev/null && \
  echo "   signed: VSCodium binary" || true

# Paso 7: App bundle sin --deep (componentes ya firmados arriba)
codesign --sign - --force "$OUT" 2>/dev/null && \
  echo "   signed: app bundle" || true

echo ""
echo "✅ roscode studio.app listo en roscode-studio-build/"
echo "   open \"$OUT\""
echo ""
echo "   Si macOS bloquea: clic derecho → Abrir → Abrir de todas formas"
