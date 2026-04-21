"""Source-file access tools (read-only in this module — writes live in build_tools).

Both tools must validate that the target path lives inside the active workspace
so the agent can't accidentally escape the sandbox via `..` traversal. The
scaffolded bodies raise NotImplementedError; Task 3 in the brief fleshes them
out.
"""

from __future__ import annotations

from typing import Any


def read_source_file(file_path: str) -> str:
    """Read a source file inside the workspace. Caps output at 300 lines."""
    raise NotImplementedError(
        "read_source_file — validate path is within workspace, cap at 300 lines"
    )


def list_workspace(package: str | None = None) -> str:
    """List .py and .cpp files in the workspace `src/`, optionally filtered by package."""
    raise NotImplementedError("list_workspace — os.walk(workspace/src)")


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
            "Return a tree of .py and .cpp source files in the workspace's src/ "
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
