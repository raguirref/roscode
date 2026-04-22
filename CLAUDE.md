# roscode — Claude Code context

## What this is
An agentic CLI that controls ROS 2 robots with natural language.
Claude Opus 4.7 is the brain. ROS 2 is the body. The human confirms destructive actions.
Built for the Anthropic "Built with Opus 4.7" hackathon (Anthropic + Cerebral Valley).
**Deadline: Sunday April 26 2026, 8:00 PM EST.**

## Stack
Python 3.10+, `anthropic` SDK, `rclpy`, `rich`, `pydantic`, ROS 2 Humble (Docker / devcontainer).

## Model
Default model is `claude-opus-4-7` (Opus 4.7). Override via `ROSCODE_MODEL` env var
or `--model` CLI flag. The brief originally referenced `claude-opus-4-5-20251001`;
we use 4.7 because the hackathon itself is "Built with Opus 4.7".

## Key files
- `roscode/agent.py` — the agentic loop. **DO NOT** change the confirmation-gate
  logic around `DESTRUCTIVE_TOOLS` without discussion.
- `roscode/tools/` — all ROS / fs / build tool wrappers. Add new tools here.
  Each tool must also be registered in `TOOL_DEFINITIONS` and `TOOL_MAP`.
- `roscode/prompts.py` — system prompt. Edit carefully; re-run demos after changes.
- `roscode/ui.py` — Rich-based terminal UI. This is the demo surface — keep it clean.
- `roscode/cli.py` — Click entry point (`roscode "…" --workspace …`).
- `demos/` — self-contained demo workspaces. Each has a `setup.sh` you can run
  cold to reproduce the demo.

## Rules when making changes
- Never remove the `DESTRUCTIVE_TOOLS` confirmation gate in `agent.py`.
- All tools must return `str` (not dicts, not bytes, not raw subprocess output).
- Tool descriptions must be specific enough for Opus to know *when* to call
  each one. Vague descriptions → wrong tool selection.
- Demos must be reproducible with just:
  `cd demos/demo_X && ./setup.sh && roscode "<prompt>"`.
- Path safety: `write_source_file` and `read_source_file` must validate the
  target is inside `workspace_path` (no `..` traversal).

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

## Known issues / watch out for
- `colcon build` can be slow (60s+) — never set the build timeout under 120s.
- `ros2 topic echo` blocks — always wrap subprocess calls in `timeout`.
- On Mac M-series: ROS 2 must run inside Docker; `rclpy` won't work natively.
- Windows dev: OneDrive path sync can race with `colcon build` artifacts — do
  builds inside the devcontainer, not directly on the Windows host.
