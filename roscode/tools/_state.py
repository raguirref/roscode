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


def resolve_inside_workspace(file_path: str) -> Path:
    """Resolve `file_path` against the workspace and assert it stays inside.

    Relative paths are resolved against the workspace root. Absolute paths must
    already be inside the workspace. Raises ValueError on any escape (``..``
    traversal, absolute path outside the workspace).
    """
    workspace = get_workspace()
    candidate = Path(file_path)
    if not candidate.is_absolute():
        candidate = workspace / candidate
    resolved = candidate.resolve()
    try:
        resolved.relative_to(workspace)
    except ValueError as exc:
        raise ValueError(
            f"Path {file_path!r} resolves outside workspace {workspace}"
        ) from exc
    return resolved
