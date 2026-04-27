# roscode

> AI-native tooling for ROS 2 — inspect your robot, fix bugs, build packages, all from natural language.

[![ROS 2 Humble](https://img.shields.io/badge/ROS%202-Humble-blue?logo=ros)](https://docs.ros.org/en/humble/)
[![Claude Opus 4.7](https://img.shields.io/badge/Claude-Opus%204.7-orange)](https://anthropic.com)
[![Python 3.10+](https://img.shields.io/badge/Python-3.10%2B-blue?logo=python)](https://python.org)
[![Tauri 2](https://img.shields.io/badge/Tauri-2-blueviolet?logo=tauri)](https://tauri.app)

---

## Branches

| Branch | What's there |
|---|---|
| **[`studio`](../../tree/studio)** ← **start here** | Full desktop app — `.dmg` download, embedded Lima VM + ROS container, Monaco editor, agent chat, nodes/topics/terminal panels |
| [`main`](../../tree/main) | Python CLI — `roscode "fix the drift"` in a terminal, no UI required |

---

## roscode studio (desktop app)

One `.dmg`. No Docker, no ROS, no Python install needed on the host.

| Workspace dashboard | Live topic echo + agent |
|---|---|
| ![Workspace](docs/screenshots/workspace-home.png) | ![Topics](docs/screenshots/topics-echo.png) |

| Package library | Terminal + agent steps |
|---|---|
| ![Library](docs/screenshots/library.png) | ![Terminal](docs/screenshots/terminal.png) |

**[→ Download & full docs in the `studio` branch](../../tree/studio)**

---

## roscode CLI (Python agent)

A lightweight command-line agent that connects to any running ROS 2 system.

```bash
pip install -e .
roscode "why is the robot drifting right?"
```

The agent gets 37 ROS-aware tools:

| Category | Tools |
|---|---|
| Inspection | `ros_graph`, `topic_echo`, `topic_hz`, `ros_node_info`, `log_tail` |
| Build | `workspace_build`, `package_scaffold`, `write_source_file` |
| Runtime | `node_spawn`, `node_kill`, `ros_launch`, `param_get`, `param_set` |
| Safety | `robot_estop` (never gated), velocity caps (0.3 m/s / 0.5 rad/s) |

### Quick start

```bash
# Clone
git clone https://github.com/raguirref/roscode.git
cd roscode

# Install (in a venv or globally)
pip install -e .

# Set your API key
export ANTHROPIC_API_KEY=sk-ant-...

# Run
roscode "describe the ROS graph and check for any errors"
```

### Requirements

- Python 3.10+
- ROS 2 Humble (or `ros2` on PATH)
- `ANTHROPIC_API_KEY`

---

## Project layout

```
roscode/             Python agent — tools, server, agent loop
  agent.py           agentic loop (tool dispatch, confirmation gate)
  server.py          WebSocket bridge to the studio frontend
  tools/             37 ROS / fs / build / safety tool wrappers
  container.py       transparent Docker/Podman backend (CLI path)
studio/              Tauri 2 desktop app
  src/               Svelte frontend
  src-tauri/         Rust backend (Lima VM + container lifecycle)
demos/               ready-to-run demo workspaces
  demo_recording/    diff-drive robot with gyro bias drift
releases/            pre-built binaries
  *.dmg              macOS Apple Silicon
tests/               Python agent unit tests
docs/screenshots/    UI screenshots
```

---

## Environment variables

| Variable | Description |
|---|---|
| `ANTHROPIC_API_KEY` | **Required.** Your Anthropic API key. |
| `ROSCODE_MODEL` | Override model (default: `claude-opus-4-7`). |
| `ROSCODE_NO_CONTAINER` | Set to `1` to force native ROS mode (skip Docker). |
