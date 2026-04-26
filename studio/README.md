# roscode studio — Tauri app

AI-native desktop IDE for ROS 2. One app, zero setup — bundles an embedded
Linux VM, a containerized ROS 2 Humble environment, and a Claude-powered agent
into a single `.dmg` / `.AppImage`.

**No Docker, no ROS, no Python install required on the host.**

---

## What's inside

```
┌─ Tauri 2 (native macOS / Linux window) ────────────────────────┐
│                                                                  │
│  Svelte + TypeScript webview                                     │
│    ├─ Monaco editor  — read/write files inside the container     │
│    ├─ Chat panel     — Claude Opus 4.7 + 37 ROS-aware tools      │
│    ├─ Files explorer — live container filesystem tree            │
│    ├─ Nodes / Topics — live ROS 2 graph (ros2 node/topic list)   │
│    ├─ Terminal       — pty shell inside the ROS container        │
│    └─ Package library — curated ROS 2 package registry          │
│                         ▲                                        │
│                    Tauri IPC                                     │
│                         ▼                                        │
│  Rust backend (src-tauri/src/)                                   │
│    ├─ lima.rs        → limactl VM lifecycle                      │
│    ├─ container.rs   → nerdctl container lifecycle               │
│    └─ commands.rs    → ~20 Tauri command handlers                │
│                         ▲                                        │
│                         ▼                                        │
│  Lima VM  (Ubuntu 22.04 + rootless containerd)                   │
│    └─ ros:humble-ros-base                                        │
│        ├─ /workspace  ← bind-mounted from host                   │
│        ├─ /opt/roscode-src ← Python agent (editable install)     │
│        └─ roscode.server on :9000  ← forwarded to host          │
└──────────────────────────────────────────────────────────────────┘
```

---

## Run in development

```bash
# Prerequisites (macOS)
brew install lima pnpm

# 1 — install frontend deps (once)
cd studio
pnpm install

# 2 — dev window (hot-reload)
pnpm tauri dev
```

The Lima VM (`roscode`) is created on first launch and reused on every restart.
Port 9000 is forwarded VM → host so the webview connects to the agent instantly.

---

## Build a release binary

```bash
cd studio
pnpm tauri build
# macOS  → src-tauri/target/release/bundle/macos/roscode studio.app
# macOS  → src-tauri/target/release/bundle/dmg/roscode studio_*.dmg
# Linux  → src-tauri/target/release/bundle/appimage/*.AppImage
```

Open without Gatekeeper prompt (macOS):
```bash
xattr -cr "src-tauri/target/release/bundle/macos/roscode studio.app"
open "src-tauri/target/release/bundle/macos/roscode studio.app"
```

---

## Environment

Create a `.env` file at the **repo root** (not inside `studio/`):

```
ANTHROPIC_API_KEY=sk-ant-...
```

The Tauri binary loads it automatically at startup via `dotenvy`.

---

## Project layout

```
studio/
├── src/                    Svelte frontend
│   ├── App.svelte           top-level IDE shell + Welcome screen
│   ├── lib/
│   │   ├── tauri.ts         Tauri invoke() wrappers
│   │   ├── chat.ts          WebSocket agent client
│   │   ├── Chat.svelte      chat panel (streaming, confirmation gate)
│   │   ├── Terminal.svelte  xterm.js + pty bridge
│   │   ├── editor/          Monaco editor (read/write container files)
│   │   ├── layout/          ActivityBar, LeftToolPanel, AgentPanel, StatusBar
│   │   ├── pages/           Files, Nodes, Topics, Network, Library, Terminal
│   │   ├── modals/          ApiKeyModal, NewPackageModal, CommandPalette
│   │   └── stores/layout.ts all Svelte stores (runtime state, open files, etc.)
│   └── main.ts
├── src-tauri/
│   ├── src/
│   │   ├── lib.rs           Tauri builder, PATH fix, host server auto-spawn
│   │   ├── lima.rs          limactl VM detect / start / shell_exec
│   │   ├── container.rs     nerdctl pull / run / exec / bootstrap_agent
│   │   └── commands.rs      all #[tauri::command] handlers
│   ├── capabilities/        Tauri 2 permission declarations
│   ├── icons/               app icons (png, icns, ico)
│   └── tauri.conf.json
├── package.json
├── vite.config.ts
└── svelte.config.js
```

---

## Key behaviours

| Feature | Detail |
|---|---|
| **Auto-detect runtime** | On startup, probes port 9000 — skips boot sequence if already live |
| **Container filesystem** | Files panel reads/writes `/workspace` inside the container directly |
| **Agent tools** | 37 tools: `ros_graph`, `topic_echo`, `write_source_file`, `package_scaffold`, `workspace_build`, `node_spawn`, … |
| **Confirmation gate** | Destructive tools (write, build, spawn, kill) require user approval |
| **E-stop** | `robot_estop` never gated — fires immediately as failsafe |
| **Safety caps** | Max linear 0.3 m/s, angular 0.5 rad/s — cannot be overridden by prompt |
