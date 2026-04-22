# roscode

> **Claude Code for robots.** Control, debug, and extend ROS 2 robots with natural language.
> Claude Opus 4.7 is the brain. ROS 2 is the body. The human stays in the loop only for
> destructive actions.

You describe a goal — *"the robot drifts left when rotating, fix it"* — and roscode
autonomously inspects the live ROS graph, reads source code, forms a hypothesis,
proposes a patch, gets human confirmation, rebuilds the workspace, respawns the node,
and verifies the fix. All in one uninterrupted loop.

Built for the **Built with Opus 4.7** hackathon (Anthropic + Cerebral Valley,
deadline Sun Apr 26 2026 8:00 PM EST).

---

## Architecture

```
      ┌──────────────────┐
      │     You (CLI)    │   "fix the drift"
      └────────┬─────────┘
               │
               v
   ┌──────────────────────────┐
   │     roscode agent loop   │  ◀── claude-opus-4-7 via Anthropic API
   │   (roscode/agent.py)     │
   └────────┬─────────────────┘
            │ tool_use
            v
   ┌──────────────────────────┐           ┌─────────────────────────┐
   │   roscode tool surface   │           │   ⚠  CONFIRMATION GATE  │
   │   (roscode/tools/*.py)   │── dest. ─>│   (roscode/ui.py)       │
   │                          │           └─────────────────────────┘
   │  ros_tools.py  runtime   │
   │  fs_tools.py   reads     │
   │  build_tools.py writes   │
   └────────┬─────────────────┘
            │ subprocess
            v
   ┌──────────────────────────┐
   │  ROS 2 Humble (Docker /  │
   │  devcontainer)           │
   │  colcon, ros2 CLI, rclpy │
   └──────────────────────────┘
```

The agent picks a tool, the UI layer renders the call, destructive tools
(`write_source_file`, `workspace_build`, `node_spawn`, `node_kill`, `param_set`,
`package_scaffold`) hit a confirmation prompt first, and results are fed back
into the model on the next turn.

## Quick start

### Linux with ROS 2 Humble already installed

```bash
git clone https://github.com/raguirref/roscode.git
cd roscode
pip install -e '.[dev]'
source /opt/ros/humble/setup.bash

cp .env.example .env                      # add ANTHROPIC_API_KEY=sk-...
roscode "list everything running on the graph" --workspace ~/ros2_ws
```

### macOS or Windows — no ROS install required

roscode ships a **transparent container backend**. If `ros2` isn't on your
`PATH`, it auto-pulls `ros:humble-ros-base`, mounts your workspace, and
routes every `ros2` / `colcon` call through `docker exec`. You never touch
Docker manually.

```bash
# Prereq: Docker Desktop or Podman installed and running.
git clone https://github.com/raguirref/roscode.git
cd roscode
pip install -e '.[dev]'

cp .env.example .env                      # add ANTHROPIC_API_KEY=sk-...
roscode "list everything running on the graph" --workspace ./demos/demo_drift/workspace
#        ^ roscode spots no local ros2, starts the container, and runs in it.
```

Pass `--no-container` (or set `ROSCODE_NO_CONTAINER=1`) to force native mode
even when Docker is available — useful when you've already sourced ROS 2.

## Demos

Two reproducible demos ship with the repo under `demos/`. Each is a real
ROS 2 workspace with a `setup.sh` that builds the packages, launches the
nodes, and prints the exact agent prompt to run in a second terminal.

| Demo           | Prompt                                                           | What the agent does                              |
| -------------- | ---------------------------------------------------------------- | ------------------------------------------------ |
| `demo_drift`   | *"the robot drifts left when rotating, fix it"*                  | Reads the live `/odom`, pulls source, finds the injected `yaw_bias = 0.05` bug, patches, rebuilds, verifies |
| `demo_safety`  | *"add a node that monitors /scan and publishes True to /obstacle_detected if anything within 30cm"* | Scaffolds a brand-new `safety_stop` ROS 2 package from scratch, subscribes, builds, spawns |

### Running demo_drift

```bash
# Terminal 1: launch the fake IMU + buggy odometry node
cd demos/demo_drift
./setup.sh

# Terminal 2: hand the agent the problem
roscode "the robot drifts left when rotating, fix it" \
        --workspace "$PWD/demos/demo_drift/workspace"
```

The agent will subscribe to `/odom`, notice yaw is drifting while the robot
is stationary, grep the source tree, find `self.yaw_bias = 0.05` in
`odometry_node.py`, propose a patch (you approve the diff), rebuild with
`colcon`, and respawn the node.

### Running demo_safety

```bash
# Terminal 1: build and launch the fake lidar
cd demos/demo_safety
./setup.sh

# Terminal 2: hand the agent the task
roscode "add a node that monitors /scan and publishes True to /obstacle_detected if anything within 30cm" \
        --workspace "$PWD/demos/demo_safety/workspace"
```

The agent will inspect the live `/scan` topic, scaffold a brand-new `safety_stop`
ROS 2 package from scratch, write a `~20-line` subscriber that publishes
`Bool` on `/obstacle_detected`, build it with `colcon`, spawn the node, and
verify it by echoing the output topic. Rays 0–4 in the fake lidar are at
0.25 m (inside the 30 cm threshold), so `/obstacle_detected` should
immediately publish `True`.

## CLI

```
roscode [REQUEST] [--workspace PATH] [--model MODEL] [--max-iterations N]
                  [--interactive] [--no-confirm] [--no-container]
```

- `REQUEST` — natural-language task (omit to enter interactive mode).
- `--workspace / -w` — ROS 2 workspace root. Falls back to `ROSCODE_WORKSPACE`.
- `--model` — Claude model ID (default `claude-opus-4-7`).
- `--max-iterations` — hard cap on the agent loop (default 20).
- `--interactive / -i` — keep prompting until you exit.
- `--no-container` — force native mode; don't start a Docker/Podman container.
- `--no-confirm` — **dangerous**, skips the confirmation gate. Testing only.

## Tool surface

| Tool                | Module         | Destructive? |
| ------------------- | -------------- | :----------: |
| `ros_graph`         | `ros_tools`    |              |
| `topic_echo`        | `ros_tools`    |              |
| `topic_hz`          | `ros_tools`    |              |
| `log_tail`          | `ros_tools`    |              |
| `service_call`      | `ros_tools`    |              |
| `param_get`         | `ros_tools`    |              |
| `param_set`         | `ros_tools`    |      ✓       |
| `tf_lookup`         | `ros_tools`    |              |
| `read_source_file`  | `fs_tools`     |              |
| `list_workspace`    | `fs_tools`     |              |
| `write_source_file` | `build_tools`  |      ✓       |
| `workspace_build`   | `build_tools`  |      ✓       |
| `node_spawn`        | `build_tools`  |      ✓       |
| `node_kill`         | `build_tools`  |      ✓       |
| `package_scaffold`  | `build_tools`  |      ✓       |
| `pkg_search`        | `pkg_tools`    |              |
| `pkg_info`          | `pkg_tools`    |              |
| `open_rviz`         | `gui_tools`    |              |
| `open_rqt_plot`     | `gui_tools`    |              |
| `open_rqt_multiplot`| `gui_tools`    |              |
| `ros_launch`        | `build_tools`  |      ✓       |

GUI tools require optional packages — install once per container:
```bash
apt-get install -y ros-humble-rviz2 ros-humble-rqt ros-humble-rqt-plot ros-humble-rqt-multiplot
```

## Status

- ✅ 21 tools implemented end-to-end (ros / fs / build / pkg / gui), unit tests passing.
- ✅ Transparent container backend for macOS / Windows (Docker or Podman).
- ✅ Rich UI with diff previews for `write_source_file` and a confirmation gate on every destructive call.
- ✅ Two reproducible demo workspaces under `demos/` with real ROS 2 packages.
- ⏳ Demo recordings and walkthrough GIFs — coming before the hackathon deadline.

See `CLAUDE.md` for the project's live context and development rules.

## License

MIT. See [LICENSE](./LICENSE).
