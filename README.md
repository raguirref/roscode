# roscode studio

> An AI-native desktop IDE for ROS 2. Connect to a robot, inspect the live graph, and talk to an agent that understands your workspace.

**Stack:** Tauri 2 · Svelte · Rust · Python · Claude Opus 4.7  
**Version:** 0.1.0 · ROS 2 Humble

---

## What it does

roscode studio gives you a full desktop window around your ROS 2 robot:

- **Home** — welcome screen, recent workspaces, LAN robot scanner
- **Nodes / Topics / Services** — live graph inspection, click to echo or call
- **Files** — browse and edit source files inside the workspace
- **Terminal** — integrated shell with ROS 2 quick commands
- **Agent** — Claude Opus 4.7 with 37 ROS-aware tools, confirmation gate on every destructive action

The agent can inspect the TF tree, read and write source files, run `colcon build`, restart nodes, and scaffold new packages — all from the chat panel on the right.

---

## Requirements

| Dependency | Version |
|---|---|
| [Rust + Cargo](https://rustup.rs) | stable |
| [Node.js](https://nodejs.org) | ≥ 18 |
| [pnpm](https://pnpm.io) | `npm i -g pnpm` |
| Python | 3.10+ |
| `ANTHROPIC_API_KEY` | set in env |

---

## Run in development

```bash
# 1 — clone
git clone -b studio https://github.com/raguirref/roscode.git
cd roscode

# 2 — Python agent deps
pip install -e .

# 3 — frontend deps
cd studio && pnpm install

# 4 — launch (opens a native window)
pnpm tauri dev
```

The Tauri dev window connects to the Python agent running on `ws://localhost:9000`.

---

## Build a release binary

```bash
cd studio
pnpm tauri build
# Output → studio/src-tauri/target/release/bundle/
```

| Platform | Output |
|---|---|
| macOS | `.dmg` |
| Linux | `.AppImage` · `.deb` |
| Windows | `.msi` |

---

## Project layout

```
roscode/        Python agent — 37 ROS tools + agentic loop (Claude Opus 4.7)
  agent.py      agentic loop (tool dispatch, confirmation gate)
  server.py     WebSocket bridge to the frontend
  tools/        all ROS / fs / build tool wrappers
studio/
  src/          Svelte frontend
  src-tauri/    Rust shell (Tauri 2)
tests/          Python agent unit tests
```

---

## Environment variables

| Variable | Default | Description |
|---|---|---|
| `ANTHROPIC_API_KEY` | — | **Required.** Your Anthropic API key. |
| `ROSCODE_MODEL` | `claude-opus-4-7` | Override the agent model. |

Copy `.env.example` → `.env` and fill in your key.

---

## Other branches

| Branch | What's there |
|---|---|
| [`main`](../../tree/main) | Python CLI — `roscode "fix the drift"` in a terminal, no UI |
| [`(compendium)`](../../tree/(compendium)) | Archived experiments: VS Code extension + VSCodium fork approach |
