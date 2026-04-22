# roscode studio

AI-native IDE for ROS 2. A Tauri desktop app that bundles an embedded
Linux VM + containerized ROS 2 + the roscode agent into a single
download — **no Docker, no ROS, no Python install required.**

> **Status:** Day-1 scaffold. Runs as an empty Tauri shell. Lima integration
> and the in-app roscode agent land over the next four days of the hackathon.

## Architecture

```
┌─ Tauri app (native window) ─────────────────────────────────┐
│                                                              │
│  Svelte + TypeScript webview                                 │
│    ┌─ Monaco ─┬─ chat ─┬─ Foxglove (embedded) ─┐             │
│    └──────────┴────────┴────────────────────────┘            │
│                          ▲                                   │
│                     Tauri IPC                                │
│                          ▼                                   │
│  Rust backend (src-tauri/)                                   │
│    ├─ lima::                 → manages the Linux VM          │
│    ├─ container::            → pulls & runs ROS 2 Humble     │
│    └─ commands::             → tauri::command handlers       │
│                          ▲                                   │
│                          ▼                                   │
│  Embedded Lima VM (Alpine + containerd)                      │
│    └─ osrf/ros:humble-desktop                                │
│        ├─ user workspace (bind-mounted from host)            │
│        ├─ roscode CLI agent (our Python package)             │
│        └─ foxglove-bridge (port-forwarded to host)           │
└──────────────────────────────────────────────────────────────┘
```

## Prerequisites

One-time install on your Mac:

```bash
# Rust toolchain (you probably already have this)
brew install rust

# Tauri CLI
cargo install tauri-cli --version "^2.0"

# Lima — the Linux VM manager we embed
brew install lima

# pnpm for frontend deps
brew install pnpm
```

## Dev workflow

```bash
cd studio
pnpm install           # frontend deps — one-time
cargo tauri dev        # starts vite + tauri, opens the window
```

First Rust build is slow (~5 min). Subsequent runs are cached.

## Layout

```
studio/
├── src/                # Svelte frontend
│   ├── App.svelte
│   ├── main.ts
│   └── lib/tauri.ts    # wraps Tauri invoke() calls
├── src-tauri/          # Rust backend
│   ├── Cargo.toml
│   ├── src/
│   │   ├── main.rs
│   │   ├── lib.rs
│   │   ├── lima.rs     # limactl wrapper
│   │   ├── container.rs
│   │   └── commands.rs
│   └── tauri.conf.json
├── package.json
├── vite.config.ts
└── index.html
```

## Day-by-day

- ~~**Day 1** — scaffold: Tauri project structure, placeholder UI.~~ ✓
- ~~**Day 2** — real Lima VM lifecycle, `nerdctl` container management via `limactl shell`, streaming progress events from Rust → webview.~~ ✓
- ~~**Day 3** — roscode agent runs inside the container (`python -m roscode.server`), exposed on `ws://localhost:9000`. Chat pane streams tool calls, diffs, and confirmation prompts live.~~ ✓
- **Day 4** — Monaco editor + Foxglove embed working. Demo recordings.
- **Day 5** — polish + submit.

See `../CLAUDE.md` for the parent project's rules.
