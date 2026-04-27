# roscode studio

> AI-native desktop IDE for ROS 2 — one `.dmg`, zero setup.

[![macOS](https://img.shields.io/badge/macOS-Apple%20Silicon-black?logo=apple)](releases/)
[![ROS 2 Humble](https://img.shields.io/badge/ROS%202-Humble-blue?logo=ros)](https://docs.ros.org/en/humble/)
[![Claude Opus 4](https://img.shields.io/badge/Claude-Opus%204.7-orange?logo=anthropic)](https://anthropic.com)
[![Tauri 2](https://img.shields.io/badge/Tauri-2-blueviolet?logo=tauri)](https://tauri.app)

**No Docker. No ROS install. No Python setup.**  
Download, open, and your robot stack is running in under a minute.

---

## Screenshots

<!-- Replace these with real screenshots once you have them -->
<!-- Drop .png files into docs/screenshots/ and update the paths below -->

| IDE overview | Agent in action |
|---|---|
| ![IDE overview](../docs/screenshots/studio-overview.png) | ![Agent chat](../docs/screenshots/studio-agent.png) |

| Node graph | Topics panel |
|---|---|
| ![Node graph](../docs/screenshots/studio-nodes.png) | ![Topics](../docs/screenshots/studio-topics.png) |

---

## Download

| Platform | File | Notes |
|---|---|---|
| **macOS Apple Silicon** | [`roscode studio_0.1.0_aarch64.dmg`](../releases/roscode%20studio_0.1.0_aarch64.dmg) | Requires macOS 13+ |

> **First launch**: macOS may block the app. Run once to bypass Gatekeeper:
> ```bash
> xattr -cr "/Applications/roscode studio.app"
> ```

---

## What's inside

```
┌─ roscode studio (Tauri 2 native window) ────────────────────────────┐
│                                                                       │
│  Svelte + TypeScript webview                                          │
│    ├─ Monaco editor   — read/write files inside the ROS container     │
│    ├─ Agent chat      — Claude Opus 4.7 · 37 ROS-aware tools          │
│    ├─ File explorer   — live container filesystem (create/rename/del) │
│    ├─ Nodes page      — live node graph · pub/sub/service inspector   │
│    ├─ Topics page     — topic list · echo · type browser              │
│    ├─ Terminal        — full pty shell inside the container           │
│    └─ Package library — curated ROS 2 package registry               │
│                         ▲                                             │
│                    Tauri IPC                                          │
│                         ▼                                             │
│  Rust backend                                                         │
│    ├─ lima.rs         → Lima VM lifecycle (start / shell_exec)        │
│    ├─ container.rs    → nerdctl pull / run / exec / agent bootstrap   │
│    └─ commands.rs     → ~25 Tauri command handlers                    │
│                         ▲                                             │
│                         ▼                                             │
│  Lima VM  (Ubuntu 22.04 · rootless containerd)                        │
│    └─ ros:humble-ros-base                                             │
│        ├─ /workspace           ← bind-mounted from host (r/w)        │
│        ├─ /opt/roscode-src     ← Python agent (editable install)      │
│        └─ roscode.server :9000 ← forwarded to host by Lima           │
└───────────────────────────────────────────────────────────────────────┘
```

---

## Features

### Claude-powered ROS agent
- **37 tools** — `ros_graph`, `topic_echo`, `workspace_build`, `node_spawn`, `ros_launch`, `write_source_file`, `package_scaffold`, and more
- **Agentic mode** — auto-approves all confirmations, shows a summary at the end
- **Plan mode** — agent outputs a step-by-step plan without executing anything
- **Chat mode** — conversational only, no tool calls
- Collapsible tool-call chips showing live argument previews and result snippets
- Confirmation gate for destructive operations (write, build, spawn, kill)
- E-stop (`robot_estop`) fires instantly, never gated

### Monaco editor
- Syntax highlighting for Python, C++, XML, YAML, JSON
- Breadcrumb navigation — click any path segment to browse the container filesystem
- Reads/writes files directly inside `/workspace` in the container

### File explorer
- Live container filesystem tree
- Create file / create folder / rename / delete via right-click context menu
- Auto-expands to the currently open file (VSCode-style)
- Preserves folder expansion state after any file operation

### Nodes & Topics
- Node list auto-refreshes every 5 seconds
- Connection diagram — subscribers → node → publishers with SVG arrows
- Topic echo, type browser, message inspector
- Live error display if ROS is not reachable

### Terminal
- Full pty shell inside the ROS container
- Resize-aware (SIGWINCH forwarded)

---

## Run in development

```bash
# Prerequisites (macOS)
brew install lima pnpm

# 1 — install frontend deps (once)
cd studio
pnpm install

# 2 — dev window with hot-reload
pnpm tauri dev
```

The Lima VM (`roscode`) is created on first launch and reused on every restart.
Port 9000 (agent WebSocket) is forwarded VM → host automatically by Lima.

---

## Build a release

```bash
cd studio
pnpm tauri build
# → src-tauri/target/release/bundle/macos/roscode studio.app
# → src-tauri/target/release/bundle/dmg/roscode studio_*.dmg
```

---

## Environment

Create `.env` at the **repo root** (one level above `studio/`):

```
ANTHROPIC_API_KEY=sk-ant-...
```

The Tauri binary loads it automatically at startup via `dotenvy`.  
The key is also forwarded into the Lima container so the agent server can call Claude.

---

## Project layout

```
studio/
├── src/
│   ├── App.svelte            top-level IDE shell + Welcome screen
│   ├── app.css               global dark theme + CSS variables
│   └── lib/
│       ├── tauri.ts          Tauri invoke() wrappers + ROS graph parsers
│       ├── chat.ts           WebSocket agent client
│       ├── Chat.svelte       agent chat panel (streaming, tool chips, modes)
│       ├── Terminal.svelte   xterm.js + pty bridge
│       ├── editor/           Monaco editor + breadcrumb
│       ├── layout/           ActivityBar, LeftToolPanel, AgentPanel, StatusBar
│       ├── pages/            Files, Nodes, Topics, Network, Library, Terminal
│       ├── modals/           ApiKeyModal, NewPackageModal, CommandPalette
│       └── stores/layout.ts  all Svelte stores (runtime state, open files, …)
├── src-tauri/
│   ├── src/
│   │   ├── lib.rs            Tauri builder + PATH fix + host server auto-spawn
│   │   ├── lima.rs           limactl VM detect / start / shell_exec
│   │   ├── container.rs      nerdctl pull / run / exec / bootstrap / server start
│   │   └── commands.rs       all #[tauri::command] handlers
│   ├── capabilities/         Tauri 2 permission declarations
│   ├── icons/                app icons (png, icns, ico)
│   └── tauri.conf.json
└── package.json
```

---

## Key behaviours

| Feature | Detail |
|---|---|
| **Auto-detect runtime** | Probes :9000 on startup — skips VM boot if agent is already live |
| **Workspace build → launch** | After `colcon build`, agent sources `install/setup.bash` automatically before `ros2 run` / `ros2 launch` |
| **Container filesystem** | Files panel reads/writes `/workspace` inside the container without any host-side mounts beyond what Lima provides |
| **Safety caps** | Max linear 0.3 m/s, angular 0.5 rad/s — cannot be overridden via prompt |
| **Confirmation gate** | Every destructive tool shows a diff preview; agentic mode batches approvals |
| **E-stop** | `robot_estop` is never gated — fires immediately as a hardware failsafe |

---

## Demo workspace

A ready-to-run differential-drive drift demo lives in `demos/demo_recording/`.  
Point the workspace setting to `demos/demo_recording/workspace`, start the runtime, then ask the agent:

> *"why is the robot drifting right?"*

The agent will inspect `/imu/data`, find the gyro bias, patch `robot_base.py`, rebuild, and the drift disappears in `/odom`.
