"""Source-file access tools (read-only here; writes live in build_tools).

Both tools validate that the target lives inside the active workspace so the
agent can't escape the sandbox via `..` traversal.
"""

from __future__ import annotations

from typing import Any

from roscode.tools._state import get_workspace, resolve_inside_workspace

_MAX_READ_LINES = 300
_SOURCE_SUFFIXES = {".py", ".cpp", ".hpp", ".h", ".c", ".cc"}


def read_source_file(file_path: str) -> str:
    """Read a source file inside the workspace. Caps output at 300 lines."""
    try:
        path = resolve_inside_workspace(file_path)
    except ValueError as exc:
        return f"Error: {exc}"

    if not path.exists():
        return f"Error: File not found: {file_path}"
    if not path.is_file():
        return f"Error: Not a file: {file_path}"

    lines = path.read_text(errors="replace").splitlines()
    total = len(lines)
    rel = path.relative_to(get_workspace())
    header = f"# {rel.as_posix()} ({total} line{'s' if total != 1 else ''})"

    if total > _MAX_READ_LINES:
        body = "\n".join(lines[:_MAX_READ_LINES])
        suffix = f"\n... [truncated: showing {_MAX_READ_LINES}/{total} lines]"
        return f"{header}\n{body}{suffix}"
    return f"{header}\n" + "\n".join(lines)


def list_workspace(package: str | None = None) -> str:
    """List source files under workspace/src, optionally filtered by package."""
    workspace = get_workspace()
    src = workspace / "src"
    if not src.exists():
        return f"Error: No src/ directory under {workspace}"

    root = src / package if package else src
    if package and not root.exists():
        return f"Error: Package {package!r} not found under {src.as_posix()}"

    files = sorted(
        p.relative_to(workspace).as_posix()
        for p in root.rglob("*")
        if p.is_file() and p.suffix in _SOURCE_SUFFIXES
    )
    if not files:
        scope = f"package {package!r}" if package else "workspace/src"
        return f"No source files ({', '.join(sorted(_SOURCE_SUFFIXES))}) under {scope}."

    header = f"# {len(files)} source file(s) under {root.relative_to(workspace).as_posix()}"
    return f"{header}\n" + "\n".join(files)


SCHEMAS: list[dict[str, Any]] = [
    {
        "name": "read_source_file",
        "description": (
            "Read a source file from the active ROS 2 workspace and return its contents. "
            "Output is capped at 300 lines — longer files are truncated with a note. "
            "Paths are resolved relative to the workspace root; absolute paths outside "
            "the workspace are rejected."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "file_path": {
                    "type": "string",
                    "description": (
                        "Path relative to the workspace root (or absolute inside it), "
                        "e.g. 'src/simple_odometry/simple_odometry/odometry_node.py'."
                    ),
                },
            },
            "required": ["file_path"],
        },
    },
    {
        "name": "list_workspace",
        "description": (
            "Return a list of .py/.cpp/.h source files in the workspace's src/ "
            "directory. Optionally restrict to a single package. Use this to discover "
            "the codebase before reading specific files."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "package": {
                    "type": "string",
                    "description": "Optional package name to filter by.",
                },
            },
        },
    },
]

TOOLS = {
    "read_source_file": read_source_file,
    "list_workspace": list_workspace,
}
