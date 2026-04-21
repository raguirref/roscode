# roscode — Claude Code context

## What this is
An agentic CLI that controls ROS 2 robots with natural language.
Claude Opus 4.7 is the brain. ROS 2 is the body. The human confirms destructive actions.
Built for the Anthropic "Built with Opus 4.7" hackathon (Anthropic + Cerebral Valley).
**Deadline: Sunday April 26 2026, 8:00 PM EST.**

## Stack
Python 3.11+, `anthropic` SDK, `rclpy`, `rich`, `pydantic`, ROS 2 Humble (Docker / devcontainer).

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
2. Manually drive the full tool surface against a live ROS graph inside
   the devcontainer (no mocks) — smoke test before any demo recording.
3. Demo 1 (drift fix) working end-to-end: populate
   `demos/demo_drift/workspace/` with the `simple_odometry` package
   including the injected `yaw_bias = 0.05` bug + fake IMU publisher.
4. Demo 2 (safety node creation) working end-to-end: populate
   `demos/demo_safety/workspace/` with the synthetic `fake_lidar`.
5. Rich UI polished for the demo video (the write_source_file diff
   preview already lands in ui.py; stress-test with long diffs).
6. README with demo GIFs / screen recording.

## Known issues / watch out for
- `colcon build` can be slow (60s+) — never set the build timeout under 120s.
- `ros2 topic echo` blocks — always wrap subprocess calls in `timeout`.
- On Mac M-series: ROS 2 must run inside Docker; `rclpy` won't work natively.
- Windows dev: OneDrive path sync can race with `colcon build` artifacts — do
  builds inside the devcontainer, not directly on the Windows host.
