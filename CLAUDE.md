# roscode studio — Claude Code context

---

<<<<<<< HEAD
## 1. What this is
=======
## Stack
Python 3.10+, `anthropic` SDK, `rclpy`, `rich`, `pydantic`, ROS 2 Humble (Docker / devcontainer).
>>>>>>> main

`roscode studio` is a ROS 2 IDE built as a fork of VSCodium — a fully branded, standalone desktop application. It is **not** a VS Code extension. The IDE ships as a native macOS/Windows/Linux app with roscode branding, the Python agent embedded, and ROS 2 tooling built in.

The Python agent from the `roscode` CLI (15+ tools, confirmation gate) is the brain of the IDE.

**Deadline: Sunday April 27 2026, 8:00 PM EST (hackathon).**

<<<<<<< HEAD
---
=======
## Current priorities (in order)
1. ~~All 15 tools implemented with mocked unit tests~~ ✓ (56 tests pass)
2. ~~20 tools: added pkg_search, pkg_info, open_rviz, open_rqt_plot, open_rqt_multiplot~~ ✓
   ~~23 tools: added workspace_map, code_search, ros_launch~~ ✓  (78 tests pass)
3. Manually drive the full tool surface against a live ROS graph inside
   the devcontainer (no mocks) — smoke test before any demo recording.
4. Demo 1 (drift fix) working end-to-end: verify colcon build + node
   restart succeed; `ros2 topic echo /odom` shows twist.angular.z ≈ 0.
5. Demo 2 (safety node creation) working end-to-end — agent scaffolds
   `safety_stop`, builds, spawns; /obstacle_detected → True immediately.
6. Rich UI polished for the demo video.
7. README with demo GIFs / screen recording.

## GUI tools (new — 2026-04-22)
`open_rviz`, `open_rqt_plot`, `open_rqt_multiplot` are in `gui_tools.py`.
They forward $DISPLAY to the container. Packages needed (not in ros:humble-ros-base):
  apt-get install -y ros-humble-rviz2 ros-humble-rqt ros-humble-rqt-plot ros-humble-rqt-multiplot
>>>>>>> main

## 2. Repos

- `roscode` (this repo) — Python agent + demos + tests. Branch `studio` is the active IDE development branch.
- `roscode-studio` (fork of VSCodium at `github.com/raguirref/roscode-studio`) — the VSCodium fork. Branch `roscode-studio` is where all IDE customization lives.

---

## 3. Repo structure (studio branch)

```
roscode/                               # repo root on `studio` branch
├── CLAUDE.md                          # this file
├── README.md
├── pyproject.toml                     # Python package config (hatch)
├── requirements.txt
├── .devcontainer/devcontainer.json    # ROS 2 Humble + Python 3.11
├── .env.example
│
├── roscode/                           # Python agent (brain of the IDE)
│   ├── __init__.py                    # version 0.1.0
│   ├── agent.py                       # agentic loop, max 20 iterations, DESTRUCTIVE gate
│   ├── cli.py                         # Click entry point (--workspace, --model, --no-confirm, -i)
│   ├── config.py                      # Pydantic settings (ANTHROPIC_API_KEY, ROSCODE_MODEL, etc.)
│   ├── container.py                   # Docker/Podman transparent backend for ROS 2
│   ├── prompts.py                     # system prompt (~191 lines, PID tuning methodology)
│   ├── server.py                      # WebSocket server (port 9000) for IDE webview
│   ├── ui.py                          # Rich terminal renderer (TerminalSink + NullSink)
│   ├── ui_protocol.py                 # Abstract UiSink protocol
│   └── tools/
│       ├── __init__.py                # TOOL_DEFINITIONS + TOOL_MAP exports
│       ├── _state.py                  # thread-safe workspace path singleton
│       ├── _shell.py                  # subprocess wrapper (container-transparent)
│       ├── fs_tools.py                # read_source_file, list_workspace
│       ├── ros_tools.py               # ros_graph, topic_echo, topic_hz, log_tail,
│       │                              #   service_call, param_get, param_set, tf_lookup
│       ├── build_tools.py             # write_source_file, workspace_build,
│       │                              #   node_spawn, node_kill, package_scaffold
│       └── runtime_tools.py           # topic_publish, robot_estop, topic_sample,
│                                      #   analyze_signal, identify_fopdt, relay_autotune,
│                                      #   PID gain calculators, step_response_metrics,
│                                      #   safety_envelope
│
├── tests/                             # 56 passing unit tests (mocked shell)
│   ├── conftest.py
│   ├── test_fs_tools.py
│   ├── test_build_tools.py
│   ├── test_ros_tools.py
│   └── test_tools.py
│
├── demos/
│   ├── demo_drift/                    # Fix yaw_bias bug in simple_odometry
│   └── demo_safety/                   # Scaffold obstacle-detection safety node
│
└── packages/
    └── registry.json                  # 15-20 curated ROS 2 packages (JSON)
```

---

## 4. Stack decisions (locked)

| Layer | Choice |
|---|---|
| **IDE base** | VSCodium 1.112 binary patched at build time (no source compile) |
| **Branding** | `scripts/patch-product.py` rewrites `product.json` |
| **Design injection** | `scripts/inject-css.py` injects CSS + HTML + JS into `workbench.html` |
| **Chrome** | Title bar brand mark, styled activity bar, agent in native auxiliary bar |
| **Agent panel** | Injected HTML into `.part.auxiliarybar` (VSCode's native right sidebar part) |
| **Agent backend** | Python WebSocket server (`roscode/server.py`) on ws://localhost:9000 |
| **No extension** | `roscode-extension/` is frozen — do NOT develop it further |
| **ROS graph** | Future: inject into `.part.sidebar` or custom view |
| **Terminal** | VSCode's native integrated terminal (xterm.js) |
| **Accent color** | `#4cc9f0` (cyan) interactive / `#f2a83b` (amber) brand mark |
| **Dark only** | yes, no light mode |
| **Build command** | `bash scripts/patch-bundle.sh` → outputs `roscode-studio-build/roscode studio.app` |

---

## 5. Key invariants — never break these

- **DESTRUCTIVE_TOOLS gate** — `write_source_file` / `workspace_build` / `node_spawn` / `node_kill` / `param_set` / `package_scaffold` / `topic_publish` / `relay_autotune` always require human confirmation.
- **`robot_estop` is never gated** — must fire autonomously as a failsafe.
- **Never modify `roscode/` tools without running tests** — `pytest tests/` must stay green (56 tests).
- **All Python tool results return `str`** — no dicts, no bytes.
- **Safety caps in `runtime_tools.py`** — `SAFETY_CAPS` (linear 0.3 m/s, angular 0.5 rad/s) cannot be bypassed by prompting.
- **No API keys in source** — `ANTHROPIC_API_KEY` always from env.

---

## 6. Developer workflow

### Python agent CLI
```bash
pip install -e .
roscode "describe the ROS graph" --workspace ~/ros2_ws
```

### Python agent WebSocket server
```bash
python -m roscode.server   # starts on ws://localhost:9000
```

### Run tests
```bash
pytest tests/
```

### Run demos (requires devcontainer or ROS 2 Humble on PATH)
```bash
cd demos/demo_drift && ./setup.sh
roscode "the robot drifts left when rotating, fix it"

cd demos/demo_safety && ./setup.sh
roscode "add a node that monitors /scan and publishes True to /obstacle_detected if anything within 30cm"
```
