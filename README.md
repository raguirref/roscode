# roscode studio

> **A standalone AI-native IDE for ROS 2.** Not a plugin, not a wrapper — a full desktop IDE forked from VSCodium, rebranded and rebuilt around a Claude Opus 4.7 agent that understands your robot.

Built for the **Built with Opus 4.7** hackathon (Anthropic + Cerebral Valley). Deadline: 2026-04-27 8PM EST.

```
┌─ ROSCODE/STUDIO ───────── Blueprint Ops · ROS 2 IDE · powered by Claude ─┐
│                                                                          │
│  FIL · HOM · NET · GRF · NOD · TOP · PLT · LIB · TRM · AGT              │
│                                                                          │
│   10-tab activity bar · amber HUD · embedded Python agent (46 tools)    │
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘
```

**Download:** grab `dist/roscode-studio-win32-x64.zip` (224 MB), extract anywhere, run `roscode-studio.exe`. No Python install required — the agent is bundled.

---

## The journey — four branches, four iterations

The `studio` branch is the final deliverable, but the story is the iteration. Each branch on GitHub is a snapshot of a different answer to "how do you ship an AI IDE for ROS in 4 days?"

| Branch | Commit snapshot | Answer we tried |
|---|---|---|
| [`main`](https://github.com/raguirref/roscode/tree/main) | CLI hackathon original | **"It's a Python bot"** — 46 tools, PID autotuning, confirmation gate, rich terminal UI. The brain. |
| [`extension`](https://github.com/raguirref/roscode/tree/extension) | `67c4d26` | **"It's a VS Code extension"** — 13-tool agent sidebar, inline Cmd+K, AI library search. Works, but competes with VS Code's own chrome. |
| [`tauri`](https://github.com/raguirref/roscode/tree/tauri) | `c847713` | **"It's a Tauri app"** — Svelte + Rust, Lima VM for ROS on Mac, live Cytoscape graph, own chrome. Too much scope for 4 days. |
| [`studio`](https://github.com/raguirref/roscode/tree/studio) | HEAD | **"It's a fork of VSCodium"** — Cursor-style: patch the packaged binary, bake our extension as builtin, ship the Python agent as sidecar. Maximum credibility, minimum wheel-reinvention. |

Each branch compiles and runs. Together they are the trail.

---

## The fork — `studio` branch

```bash
# Windows
cd dist && unzip roscode-studio-win32-x64.zip && cd out && ./roscode-studio.exe
```

The activity bar maps 1:1 to Blueprint Ops wireframes (design ref: `.design-ref/`):

| Tab | What it does |
|---|---|
| **FIL** · Files | VS Code Explorer (native, relabelled) |
| **HOM** · Home | Connection status + New Project wizard + quick actions |
| **NET** · Network | LAN scan for ROS 1 / ROS 2 daemons (ports 11311 / 7400-7402) |
| **GRF** · Graph | Live ROS node graph inline, amber rects + dashed teal topics (rqt_graph replacement). Falls back to demo graph when offline. |
| **NOD** · Nodes | Running node tree with search |
| **TOP** · Topics | Active topics tree, click for echo |
| **PLT** · Plot | Live canvas chart of any numeric field — presets for `/cmd_vel`, `/scan`, `/odom`, `/tf` (rqt_plot replacement). Falls back to sine+noise when offline. |
| **LIB** · Library | Curated ROS 2 msg/srv/action catalog + ✨ AI GitHub package search |
| **TRM** · Terminal | Integrated shell launcher with 10 ROS quick commands (node list, topic echo, colcon build, bag record) |
| **AGT** · Agent | Streaming Claude Opus 4.7 chat with Confirm/Reject cards on every destructive tool |

**Baked in:**
- Custom VSCodium binary (nameShort / applicationName / 69 branded product.json fields)
- Blueprint Ops CSS injected into `workbench.html` (amber HUD, mono labels, custom watermark)
- roscode extension shipped as builtin (`resources/app/extensions/roscode/`)
- Python agent as PyInstaller sidecar exe (`resources/app/sidecar/roscode-agent.exe`) — 46 tools available even without host Python

---

## Two complementary forms

| | roscode studio (fork) | roscode CLI |
|---|---|---|
| **Form** | Standalone IDE — forked VSCodium + custom extension + Python sidecar | Python command-line agent |
| **Agent** | Claude Opus 4.7 via Anthropic SDK (TypeScript) in-IDE, plus Python sidecar for 46 tool set | Claude Opus 4.7 via Anthropic SDK (Python) |
| **Tools** | 13 (topics, nodes, files, shell, build, params, services) | 46 (all of the above + PID tuning, signal analysis, safety envelope, autonomous robotics) |
| **UI** | 10-tab Blueprint Ops activity bar with streaming chat + confirm/reject cards | Rich terminal with diff previews and workspace map renderer |
| **ROS** | Connects to live robot over LAN or localhost Docker | Native or Docker/Podman container (transparent) |
| **Install** | Extract + run .exe | `pip install -e .` |

---

## roscode CLI

### Quick start

**Linux with ROS 2 Humble:**
```bash
git clone https://github.com/raguirref/roscode.git && cd roscode
pip install -e '.[dev]'
cp .env.example .env          # add ANTHROPIC_API_KEY=sk-...
source /opt/ros/humble/setup.bash
roscode "list everything running on the graph" --workspace ~/ros2_ws
```

**macOS / Windows — no ROS install required:**

roscode has a transparent container backend. If `ros2` isn't on `PATH`, it auto-pulls `ros:humble-ros-base`, mounts your workspace, and routes every `ros2` / `colcon` call through `docker exec`.

```bash
# Prereq: Docker Desktop or Podman running
git clone https://github.com/raguirref/roscode.git && cd roscode
pip install -e '.[dev]'
cp .env.example .env          # add ANTHROPIC_API_KEY=sk-...
roscode "list everything running on the graph" --workspace ./demos/demo_drift/workspace
```

Pass `--no-container` (or `ROSCODE_NO_CONTAINER=1`) to force native mode.

### Python tool surface (46 tools)

| Tool                | Module            | Destructive? |
| ------------------- | ----------------- | :----------: |
| `workspace_map`     | `analysis_tools`  |              |
| `code_search`       | `analysis_tools`  |              |
| `ros_graph`         | `ros_tools`       |              |
| `topic_echo`        | `ros_tools`       |              |
| `topic_hz`          | `ros_tools`       |              |
| `log_tail`          | `ros_tools`       |              |
| `service_call`      | `ros_tools`       |              |
| `param_get`         | `ros_tools`       |              |
| `param_set`         | `ros_tools`       |      ✓       |
| `tf_lookup`         | `ros_tools`       |              |
| `read_source_file`  | `fs_tools`        |              |
| `list_workspace`    | `fs_tools`        |              |
| `write_source_file` | `build_tools`     |      ✓       |
| `workspace_build`   | `build_tools`     |      ✓       |
| `node_spawn`        | `build_tools`     |      ✓       |
| `node_kill`         | `build_tools`     |      ✓       |
| `package_scaffold`  | `build_tools`     |      ✓       |
| `ros_launch`        | `build_tools`     |      ✓       |
| `pkg_search`        | `pkg_tools`       |              |
| `pkg_info`          | `pkg_tools`       |              |
| `pkg_install`       | `pkg_tools`       |      ✓       |
| `open_rviz`         | `gui_tools`       |              |
| `open_rqt_plot`     | `gui_tools`       |              |
| `open_rqt_multiplot`| `gui_tools`       |              |
| `topic_publish`     | `runtime_tools`   |      ✓       |
| `robot_estop`       | `runtime_tools`   | ✗ (never gated)|
| `topic_sample`      | `runtime_tools`   |              |
| `analyze_signal`    | `runtime_tools`   |              |
| `identify_fopdt`    | `runtime_tools`   |              |
| `relay_autotune`    | `runtime_tools`   |      ✓       |
| `safety_envelope`   | `runtime_tools`   |              |
| `step_response_metrics`| `runtime_tools`|              |
| *PID gain calculators*| `runtime_tools` |              |

---

## Demos

Two reproducible demos ship under `demos/`. Each has a `setup.sh` that builds the packages, launches the nodes, and prints the exact prompt to run.

### Demo 1 — Drift fix

The robot reports a slow left-hand drift even when stationary. The bug is a hardcoded `yaw_bias = 0.05 rad/s` added to every IMU integration step.

```bash
# Terminal 1: launch the fake IMU + buggy odometry node
cd demos/demo_drift && ./setup.sh

# Terminal 2: hand the agent the problem
roscode "the robot drifts left when rotating, fix it" \
        --workspace "$PWD/demos/demo_drift/workspace"
```

### Demo 2 — Safety node creation

The workspace has a fake lidar publishing `/scan` at 10 Hz. Rays 0-4 report an obstacle at 0.25 m — inside the 0.30 m danger threshold. No safety monitor exists yet.

```bash
# Terminal 1: launch the fake lidar
cd demos/demo_safety && ./setup.sh

# Terminal 2: ask the agent to build the safety node
roscode "add a node that monitors /scan and publishes True to /obstacle_detected if anything within 30cm" \
        --workspace "$PWD/demos/demo_safety/workspace"
```

---

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                roscode studio                        │
│                                                      │
│  VS Code extension          Tauri app                │
│  ┌────────────────┐         ┌──────────────────┐     │
│  │ AgentView.ts   │         │ Chat.svelte       │     │
│  │ Anthropic SDK  │         │ WebSocket client  │     │
│  │ (TypeScript)   │         └────────┬─────────┘     │
│  └───────┬────────┘                  │ ws://9000      │
│          │ API                       v                │
│          │              ┌─────────────────────────┐  │
│          │              │   roscode/server.py      │  │
│          │              │   (Python WebSocket)     │  │
│          │              └────────────┬────────────┘  │
│          │                           │               │
│          ▼                           ▼               │
│  ┌────────────────────────────────────────────────┐  │
│  │          roscode agent loop (agent.py)          │  │
│  │          claude-opus-4-7 via Anthropic API      │  │
│  └──────────────────────┬─────────────────────────┘  │
│                         │ tool_use                    │
│                         ▼                             │
│  ┌────────────────────────────────────────────────┐  │
│  │             Tool surface                        │  │
│  │  DESTRUCTIVE tools ──► ⚠ confirmation gate     │  │
│  └──────────────────────┬─────────────────────────┘  │
│                         │ subprocess / ros2 CLI       │
└─────────────────────────┼───────────────────────────┘
                          ▼
             ┌─────────────────────────┐
             │  ROS 2 Humble           │
             │  (Docker / Lima / native)│
             └─────────────────────────┘
```

**Safety invariants (never broken):**
- Every destructive tool call pauses for explicit human approval before executing.
- `robot_estop` is the only tool that runs without a gate — it must be callable at any time as a failsafe.
- Safety caps in `runtime_tools.py` (`SAFETY_CAPS`: linear 0.3 m/s, angular 0.5 rad/s) are programmatic and cannot be bypassed by prompting.

---

## Status

- ✅ **46 tools** implemented end-to-end (analysis / ros / fs / build / pkg / gui / runtime), 131 unit tests passing.
- ✅ **Standalone IDE** fork of VSCodium with 10-tab activity bar and integrated agent.
- ✅ **Transparent container backend** for macOS / Windows (Docker or Podman).
- ✅ **Rich UI** with diff previews and workspace map renderer.
- ✅ **Two reproducible demo workspaces** under `demos/` with real ROS 2 packages.

---

## License

MIT. ROS is a trademark of Open Source Robotics Foundation. roscode is an independent open-source tool and is not affiliated with Open Robotics.
