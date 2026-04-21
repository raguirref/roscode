"""Destructive tools: source writes, colcon build, node lifecycle, package scaffolding.

Every tool in this module is gated by the confirmation prompt in `agent.py`
via the DESTRUCTIVE_TOOLS set. Bodies are scaffolded with NotImplementedError;
Task 3 in the brief fleshes them out.
"""

from __future__ import annotations

from typing import Any


def write_source_file(file_path: str, content: str) -> str:
    """Write `content` to `file_path`. DESTRUCTIVE — confirmed in the agent loop.

    Must show a unified diff against the existing file (if any) before writing,
    and must validate the target lives inside the workspace.
    """
    raise NotImplementedError("write_source_file — path check + difflib preview + write")


def workspace_build(package: str | None = None) -> str:
    """Run `colcon build`. DESTRUCTIVE. Returns last 30 lines + pass/fail marker."""
    raise NotImplementedError(
        "workspace_build — colcon build --symlink-install [--packages-select {pkg}], 120s timeout"
    )


def node_spawn(package: str, executable: str, node_name: str | None = None) -> str:
    """Spawn a node in the background via `ros2 run`. DESTRUCTIVE. Stores pid for node_kill."""
    raise NotImplementedError(
        "node_spawn — Popen ros2 run, store pid keyed on node_name (or derived name)"
    )


def node_kill(node_name: str) -> str:
    """Send SIGTERM to a previously-spawned node. DESTRUCTIVE."""
    raise NotImplementedError("node_kill — SIGTERM the stored pid, then poll")


def package_scaffold(package_name: str, node_name: str, description: str) -> str:
    """Create a minimal ROS 2 Python package under src/. DESTRUCTIVE.

    Produces package.xml, setup.py, setup.cfg, resource/<pkg>, <pkg>/__init__.py,
    and <pkg>/<node_name>.py with an empty rclpy.Node subclass.
    """
    raise NotImplementedError("package_scaffold — write the canonical ament_python layout")


SCHEMAS: list[dict[str, Any]] = [
    {
        "name": "write_source_file",
        "description": (
            "Write new contents to a source file inside the workspace. DESTRUCTIVE — "
            "the user is shown a unified diff and must confirm before the write happens. "
            "Validate the target is inside the workspace; never write outside it."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "file_path": {
                    "type": "string",
                    "description": "Path inside the workspace (relative or absolute).",
                },
                "content": {
                    "type": "string",
                    "description": "Full new file contents (not a patch).",
                },
            },
            "required": ["file_path", "content"],
        },
    },
    {
        "name": "workspace_build",
        "description": (
            "Run `colcon build --symlink-install` against the workspace, optionally "
            "restricted to a single package. DESTRUCTIVE because it mutates build/, "
            "install/, log/. Returns the last ~30 lines of colcon output plus a "
            "'Build succeeded' or 'Build FAILED' marker. Has a 120-second timeout."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "package": {
                    "type": "string",
                    "description": "Optional package name. Omit to build the whole workspace.",
                },
            },
        },
    },
    {
        "name": "node_spawn",
        "description": (
            "Spawn a ROS 2 node in the background via `ros2 run {package} {executable}`. "
            "DESTRUCTIVE. The pid is tracked so node_kill can stop it later. Use this "
            "after a successful build to bring a new or rebuilt node online."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "package": {"type": "string", "description": "Package name."},
                "executable": {
                    "type": "string",
                    "description": "Executable/entry-point name from setup.py.",
                },
                "node_name": {
                    "type": "string",
                    "description": "Optional node name; defaults to the executable name.",
                },
            },
            "required": ["package", "executable"],
        },
    },
    {
        "name": "node_kill",
        "description": (
            "Send SIGTERM to a previously-spawned node and wait for it to exit. "
            "DESTRUCTIVE. Use this before respawning after a rebuild."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "node_name": {
                    "type": "string",
                    "description": "Node name you passed to node_spawn.",
                },
            },
            "required": ["node_name"],
        },
    },
    {
        "name": "package_scaffold",
        "description": (
            "Create a new empty ROS 2 Python (ament_python) package under src/ with "
            "one node stub. DESTRUCTIVE because it creates files on disk. Use this "
            "when the user asks you to add a new node and no suitable package exists."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "package_name": {
                    "type": "string",
                    "description": "Package name, e.g. 'safety_stop'.",
                },
                "node_name": {
                    "type": "string",
                    "description": "Node/executable stub to create, e.g. 'safety_node'.",
                },
                "description": {
                    "type": "string",
                    "description": "One-line description that goes into package.xml.",
                },
            },
            "required": ["package_name", "node_name", "description"],
        },
    },
]

TOOLS = {
    "write_source_file": write_source_file,
    "workspace_build": workspace_build,
    "node_spawn": node_spawn,
    "node_kill": node_kill,
    "package_scaffold": package_scaffold,
}
