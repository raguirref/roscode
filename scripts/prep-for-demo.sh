#!/usr/bin/env bash
# prep-for-demo.sh — rebuild extension .vsix + Tauri app after Blueprint Ops update
# Run this in the lab before recording. Fails loudly on any error.

set -euo pipefail

RED=$'\033[31m'; GREEN=$'\033[32m'; YELLOW=$'\033[33m'; BOLD=$'\033[1m'; NC=$'\033[0m'
ok() { echo "${GREEN}✓${NC} $*"; }
warn() { echo "${YELLOW}⚠${NC} $*"; }
fail() { echo "${RED}✗${NC} $*"; exit 1; }
step() { echo -e "\n${BOLD}→ $*${NC}"; }

command -v pnpm >/dev/null || fail "pnpm not found. Install: npm i -g pnpm"
command -v node >/dev/null || fail "node not found"

step "1/3 · Pull latest (Blueprint Ops commit)"
git pull --ff-only origin studio || fail "git pull failed — resolve manually"
ok "up to date: $(git log -1 --oneline)"

step "2/3 · Rebuild VS Code extension"
(
  cd roscode-extension
  [ -d node_modules ] || { echo "installing deps…"; pnpm install; }
  pnpm run package
)
ok "built: roscode-extension/roscode-0.1.0.vsix"
warn "install with: code --install-extension roscode-extension/roscode-0.1.0.vsix --force"
warn "or for VSCodium: codium --install-extension roscode-extension/roscode-0.1.0.vsix --force"

step "3/3 · Prepare Tauri app"
(
  cd studio
  [ -d node_modules ] || { echo "installing deps…"; pnpm install; }
)
ok "studio ready — run: cd studio && pnpm tauri dev"

echo
echo "${BOLD}Next:${NC}"
echo "  • Extension:  reload VSCodium window (Cmd/Ctrl+Shift+P → 'Reload Window')"
echo "  • Tauri app:  cd studio && pnpm tauri dev  (hot-reload)"
echo "  • Standalone build: cd studio && pnpm tauri build"
