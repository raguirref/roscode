# roscode studio

> **Claude Opus 4.7 for ROS 2 robots.** Inspect, fix, and build robot software with natural language — from your IDE or terminal.

Built for the **Built with Opus 4.7** hackathon (Anthropic + Cerebral Valley).

---

## Two ways to use roscode

| | roscode studio extension | roscode CLI |
|---|---|---|
| **Form** | VS Code / VSCodium extension | Python command-line agent |
| **Agent** | Claude Opus 4.7 via Anthropic SDK (TypeScript) | Claude Opus 4.7 via Anthropic SDK (Python) |
| **Tools** | 13 (topics, nodes, files, shell, build, params, services) | 25+ (all of the above + PID tuning, signal analysis, safety envelope) |
| **UI** | Streaming chat with Confirm/Reject cards | Rich terminal with diff previews |
| **ROS** | Connects to live robot over LAN or localhost Docker | Native or Docker/Podman container (transparent) |
| **Install** | `code --install-extension roscode-0.1.0.vsix` | `pip install -e .` |

---

## roscode studio — VS Code Extension

### Install

```bash
cd roscode-extension
pnpm install && pnpm run package          # builds roscode-0.1.0.vsix
code --install-extension roscode-0.1.0.vsix
```

Or install the pre-built .vsix directly:

```bash
code --install-extension roscode-extension/roscode-0.1.0.vsix
```

Set your API key in VS Code settings → `roscode.anthropicApiKey`, or export `ANTHROPIC_API_KEY` before launching.

### What you get

**Sidebar — primary activity bar (`roscode` icon)**

| View | What it shows |
|---|---|
| **Home** | Connection status · New project wizard · Start ROS runtime |
| **Network** | Robots discovered on your LAN (ROS 1 port 11311 · ROS 2 DDS 7400-7402) |
| **Nodes** | All running ROS nodes with search/filter |
| **Topics** | Active topics, click to open monitor panel |
| **Library** | Curated ROS 2 message types with field explorer + ✨ AI package search |

**Agent sidebar (secondary bar)**

Streaming chat powered by Claude Opus 4.7. Type a goal, watch the agent read your graph, inspect your code, and propose changes — pausing for your approval before anything destructive runs.

```
You: the robot drifts left when rotating, fix it

agent   Inspecting graph ──────────── 3 lines
agent   Read file ─────────────────── odometry_node.py
agent   Found self.yaw_bias = 0.05 — should be 0.0.
        Here's the patch:
        - self.yaw_bias = 0.05
        + self.yaw_bias = 0.0

        ⚠ Write file — requires confirmation
        [Run]  [Reject]

agent   Written. Running colcon build…   ← you clicked Run
        ⚠ colcon build — requires confirmation
        [Run]  [Reject]
```

**Panels (open from sidebar or command palette)**

- `⌘⇧G` — **Node Graph** — Cytoscape interactive graph of every node and topic
- **Topic Monitor** — live echo of any topic, click a topic tree item to open

### New project wizard

Click **"New ROS 2 project…"** in the Home sidebar:

1. Type a project name
2. Choose a robot template: **Diff-drive** (full `/cmd_vel` → `/odom` node) or **Empty** (hello-world publisher). Ackermann and Manipulator templates are stubs.
3. Click **Create project** → picks a parent folder → scaffolds the workspace → opens in VS Code.

Generated structure:
```
my_robot/
├── .roscode/config.json          # roscode project metadata
├── src/
│   └── my_robot/
│       ├── package.xml
│       ├── setup.py
│       ├── my_robot/
│       │   └── my_robot_node.py  # fully functional starter node
│       └── launch/launch.py
└── runtime/
    └── docker-compose.yml        # one-click ROS 2 Humble container
```

### Start ROS runtime

Click **"Start ROS runtime"** in the Home sidebar. roscode runs `docker compose up -d` from `runtime/`, waits for the ROS daemon, and connects automatically. Requires Docker Desktop or Podman.

### AI package search

In the Library view title bar, click **✨ AI Search**. Describe what you need ("lidar SLAM", "object detection", "arm trajectory control") and Claude suggests 4-5 real GitHub repos — click one to open it directly.

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

What the agent does:
1. Calls `ros_graph` — sees `/imu` → `odometry_node` → `/odom`
2. Calls `topic_echo /odom` — notices `twist.angular.z` growing while robot is stationary
3. Calls `read_source_file odometry_node.py` — spots `self.yaw_bias = 0.05`
4. Calls `write_source_file` (confirmation required) — patches to `0.0`
5. Calls `workspace_build` (confirmation required) — `colcon build`
6. Calls `node_kill` + `node_spawn` (confirmation required) — restarts the node
7. Calls `topic_echo /odom` again — confirms drift is gone

### Demo 2 — Safety node creation

The workspace has a fake lidar publishing `/scan` at 10 Hz. Rays 0-4 report an obstacle at 0.25 m — inside the 0.30 m danger threshold. No safety monitor exists yet.

```bash
# Terminal 1: launch the fake lidar
cd demos/demo_safety && ./setup.sh

# Terminal 2: ask the agent to build the safety node
roscode "add a node that monitors /scan and publishes True to /obstacle_detected if anything within 30cm" \
        --workspace "$PWD/demos/demo_safety/workspace"
```

What the agent does:
1. Calls `ros_graph` — sees only `fake_lidar` publishing `/scan`
2. Calls `topic_sample /scan` — reads the laser data, confirms obstacle at 0.25 m
3. Calls `package_scaffold safety_stop` (confirmation required) — creates the package
4. Calls `write_source_file` (confirmation required) — writes the subscriber/publisher node
5. Calls `workspace_build` (confirmation required) — `colcon build`
6. Calls `node_spawn safety_stop` (confirmation required) — starts the node
7. Calls `topic_echo /obstacle_detected` — shows `data: True`

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

roscode has a transparent container backend. If `ros2` isn't on `PATH`, it auto-pulls `osrf/ros:humble-desktop`, mounts your workspace, and routes every `ros2` / `colcon` call through `docker exec`.

```bash
# Prereq: Docker Desktop or Podman running
git clone https://github.com/raguirref/roscode.git && cd roscode
pip install -e '.[dev]'
cp .env.example .env          # add ANTHROPIC_API_KEY=sk-...
roscode "list everything running on the graph" --workspace ./demos/demo_drift/workspace
```

Pass `--no-container` (or `ROSCODE_NO_CONTAINER=1`) to force native mode.

### CLI reference

```
roscode [REQUEST] [OPTIONS]

  REQUEST   Natural-language goal. Omit for interactive mode (-i).

Options:
  -w, --workspace PATH      ROS 2 workspace root (or ROSCODE_WORKSPACE env var)
  --model MODEL             Claude model ID (default: claude-opus-4-7)
  --max-iterations N        Hard cap on agent loop (default: 20)
  -i, --interactive         Keep prompting until you exit (Ctrl-C or "exit")
  --no-confirm              Skip confirmation gate — dangerous, testing only
  --no-container            Force native ros2/colcon, don't start Docker
```

### Python tool surface (25+ tools)

| Tool | Module | Destructive |
|---|---|:---:|
| `ros_graph` | ros_tools | |
| `topic_echo` | ros_tools | |
| `topic_hz` | ros_tools | |
| `topic_sample` | ros_tools | |
| `log_tail` | ros_tools | |
| `service_call` | ros_tools | |
| `param_get` | ros_tools | |
| `param_set` | ros_tools | ✓ |
| `tf_lookup` | ros_tools | |
| `read_source_file` | fs_tools | |
| `list_workspace` | fs_tools | |
| `write_source_file` | build_tools | ✓ |
| `workspace_build` | build_tools | ✓ |
| `node_spawn` | build_tools | ✓ |
| `node_kill` | build_tools | ✓ |
| `package_scaffold` | build_tools | ✓ |
| `topic_publish` | runtime_tools | ✓ |
| `robot_estop` | runtime_tools | ✗ (never gated) |
| `topic_sample` | runtime_tools | |
| `analyze_signal` | runtime_tools | |
| `identify_fopdt` | runtime_tools | |
| `relay_autotune` | runtime_tools | ✓ |
| `step_response_metrics` | runtime_tools | |
| `safety_envelope` | runtime_tools | |
| *PID gain calculators* | runtime_tools | |

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

## Developer setup

### Extension

```bash
cd roscode-extension
pnpm install
pnpm run package          # builds .vsix
code --install-extension roscode-0.1.0.vsix
```

### Python CLI

```bash
pip install -e '.[dev]'
pytest tests/             # 90 tests, all mocked, no ROS required
```

### Python WebSocket server (for Tauri app)

```bash
python -m roscode.server  # listens on ws://localhost:9000
```

### Tauri app (standalone desktop)

```bash
cd studio
pnpm install
pnpm tauri dev            # requires Rust + Tauri CLI
```

---

## Status

- ✅ VS Code extension: sidebar, agent chat, node graph, topic monitor, package library, network discovery
- ✅ Confirmation gate on every destructive tool (write_file, shell, colcon_build, param_set, package_scaffold)
- ✅ New project wizard: diff-drive and empty templates, scaffolds full ament_python workspace
- ✅ AI package search: Claude suggests GitHub repos from natural language query
- ✅ Start ROS runtime: one-click docker compose → auto-connect
- ✅ 13 extension tools / 25+ Python tools
- ✅ Tauri standalone app (macOS build in `roscode-studio-build/`)
- ✅ Two reproducible demos: `demo_drift` (bug fix) · `demo_safety` (node creation)
- ✅ 90 Python unit tests, all green, no ROS required

---

## License

MIT. ROS is a trademark of Open Source Robotics Foundation. roscode is an independent open-source tool and is not affiliated with Open Robotics.
