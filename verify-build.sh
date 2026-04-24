#!/usr/bin/env bash
# verify-build.sh — one-command smoke test for the roscode studio fork.
# Run this right before the demo to catch any missing piece.
#
#   bash verify-build.sh
#
# Exits non-zero on any failure so you know before hitting record.

set -uo pipefail

RED=$'\033[31m'; GRN=$'\033[32m'; YEL=$'\033[33m'; BLD=$'\033[1m'; NC=$'\033[0m'
pass=0; fail=0
ok()   { echo "${GRN}  ✓${NC} $*"; pass=$((pass+1)); }
bad()  { echo "${RED}  ✗${NC} $*"; fail=$((fail+1)); }
warn() { echo "${YEL}  ⚠${NC} $*"; }
hdr()  { echo; echo "${BLD}$*${NC}"; }

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

hdr "1 · Fork binaries present"
[ -f vscodium-build/out/roscode-studio.exe ]                                && ok "roscode-studio.exe"            || bad "missing: vscodium-build/out/roscode-studio.exe"
[ -f dist/roscode-studio-win32-x64.zip ]                                    && ok "portable zip"                  || bad "missing: dist/roscode-studio-win32-x64.zip"
[ -f vscodium-build/out/resources/app/sidecar/roscode-agent.exe ]           && ok "Python sidecar baked"          || bad "missing: resources/app/sidecar/roscode-agent.exe"
[ -f vscodium-build/out/resources/app/extensions/roscode/dist/extension.js ] && ok "extension.js baked"            || bad "missing: extensions/roscode/dist/extension.js"

hdr "2 · Product rebrand applied"
if grep -q '"nameShort": "roscode"' vscodium-build/out/resources/app/product.json 2>/dev/null; then
  ok "product.json rebranded (nameShort = roscode)"
else
  bad "product.json not rebranded — rerun scripts/build-studio.sh"
fi

hdr "3 · CSS injection landed"
WB_HTML="vscodium-build/out/resources/app/out/vs/code/electron-browser/workbench/workbench.html"
if [ -f "$WB_HTML" ] && grep -q "roscode-brand" "$WB_HTML"; then
  ok "workbench.html has roscode-brand marker"
else
  bad "CSS injection missing from workbench.html"
fi
[ -f vscodium-build/out/resources/app/out/vs/code/electron-browser/workbench/roscode-brand.css ] \
  && ok "roscode-brand.css dropped next to workbench" \
  || bad "missing: roscode-brand.css next to workbench.html"

hdr "4 · All 9 activity bar icons"
missing_icons=0
for icon in home network graph nodes topics plot library terminal agent; do
  f="vscodium-build/out/resources/app/extensions/roscode/media/icon-${icon}.svg"
  if [ -f "$f" ]; then
    :
  else
    bad "missing icon: icon-${icon}.svg"
    missing_icons=$((missing_icons+1))
  fi
done
[ "$missing_icons" = "0" ] && ok "all 9 icon SVGs present"

hdr "5 · 9 view IDs compiled into extension.js"
EXT_JS="vscodium-build/out/resources/app/extensions/roscode/dist/extension.js"
missing_views=0
for vid in home network graph nodes topics plot library terminal agent; do
  if ! grep -q "roscode\\.${vid}" "$EXT_JS" 2>/dev/null; then
    bad "view ID roscode.${vid} not found in compiled extension.js"
    missing_views=$((missing_views+1))
  fi
done
[ "$missing_views" = "0" ] && ok "all 9 view IDs compiled in"

hdr "6 · Python sidecar --help"
SIDECAR="vscodium-build/out/resources/app/sidecar/roscode-agent.exe"
if [ -f "$SIDECAR" ]; then
  if "$SIDECAR" --help >/dev/null 2>&1; then
    ok "sidecar responds to --help"
  else
    bad "sidecar present but --help failed (may be broken build)"
  fi
fi

hdr "7 · Demos present"
[ -f demos/demo_drift/setup.sh ]  && ok "demo_drift setup.sh"  || warn "demo_drift/setup.sh missing"
[ -f demos/demo_safety/setup.sh ] && ok "demo_safety setup.sh" || warn "demo_safety/setup.sh missing"

hdr "8 · ANTHROPIC_API_KEY available"
if [ -n "${ANTHROPIC_API_KEY:-}" ]; then
  ok "ANTHROPIC_API_KEY is set in this shell"
elif [ -f .env ] && grep -q "ANTHROPIC_API_KEY" .env; then
  ok "ANTHROPIC_API_KEY is in .env"
else
  warn "no ANTHROPIC_API_KEY in env or .env — agent chat will show a setup banner"
fi

echo
if [ "$fail" = "0" ]; then
  echo "${GRN}${BLD}✓ verify-build: ${pass} checks passed. ship it.${NC}"
  exit 0
else
  echo "${RED}${BLD}✗ verify-build: ${fail} failed / ${pass} passed.${NC}"
  echo "  fix the ✗ lines above, rerun scripts/build-studio.sh, then retry."
  exit 1
fi
