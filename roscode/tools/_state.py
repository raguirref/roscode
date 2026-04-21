"""Shared mutable state for the tool surface.

The agent passes one `workspace_path` into `agent.run()` and every tool needs
to see it. Rather than threading it through every tool signature (and every
Anthropic tool schema), `agent.run()` calls `set_workspace()` once before
starting the loop, and tools call `get_workspace()` when they need it.
"""

from __future__ import annotations

from pathlib import Path

_workspace: Path | None = None


def set_workspace(path: str | Path) -> None:
    """Set the active ROS 2 workspace root. Called by agent.run() at startup."""
    global _workspace
    _workspace = Path(path).expanduser().resolve()


def get_workspace() -> Path:
    """Return the active workspace. Raises if `set_workspace` was never called."""
    if _workspace is None:
        raise RuntimeError(
            "Tool called before workspace was set. "
            "roscode.tools.set_workspace(...) must run before the agent loop."
        )
    return _workspace
