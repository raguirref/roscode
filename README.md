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

```bash
# 1. Clone
git clone https://github.com/rickycrack/roscode.git
cd roscode

# 2. Open in the devcontainer (VS Code: "Reopen in Container")
#    OR install locally on a ROS 2 Humble box:
pip install -e '.[dev]'
source /opt/ros/humble/setup.bash

# 3. Add your Anthropic API key
cp .env.example .env
# edit .env: ANTHROPIC_API_KEY=sk-...

# 4. Talk to your robot
roscode "list everything running on the graph" --workspace ~/ros2_ws
```

## Demos

Two reproducible demos ship with the repo under `demos/`:

| Demo           | Prompt                                                           | What the agent does                              |
| -------------- | ---------------------------------------------------------------- | ------------------------------------------------ |
| `demo_drift`   | *"the robot drifts left when rotating, fix it"*                  | Finds `yaw_bias = 0.05` in source, patches, rebuilds, verifies |
| `demo_safety`  | *"add a node that publishes True if anything within 30cm"*       | Scaffolds a brand-new ROS 2 package from scratch |

Each has a `setup.sh` and an `expected_output.txt` with the target agent trace.

```bash
cd demos/demo_drift
./setup.sh
roscode "the robot drifts left when rotating, fix it" --workspace ./workspace
```

## CLI

```
roscode [REQUEST] [--workspace PATH] [--model MODEL] [--max-iterations N]
                  [--interactive] [--no-confirm]
```

- `REQUEST` — natural-language task (omit to enter interactive mode).
- `--workspace / -w` — ROS 2 workspace root. Falls back to `ROSCODE_WORKSPACE`.
- `--model` — Claude model ID (default `claude-opus-4-7`).
- `--max-iterations` — hard cap on the agent loop (default 20).
- `--interactive / -i` — keep prompting until you exit.
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

## Status

Initial scaffold. Package skeleton, tool schemas, agent loop, CLI,
devcontainer, and demo placeholders are in place. Tool bodies are
currently `NotImplementedError` stubs — fleshing them out against a
live ROS graph is next.

See `CLAUDE.md` for the project's live context and development rules.

## License

MIT. See [LICENSE](./LICENSE).
