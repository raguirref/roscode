"""ROS 2 runtime tool wrappers.

Each tool shells out to the `ros2` CLI via `_shell.run` and returns a
formatted `str`. Errors are caught and returned as `"Error: ..."` strings
so the agent loop never sees an exception.

Schemas are final — edit function bodies without touching the schemas to
avoid churning Opus tool-selection.
"""

from __future__ import annotations

import re
from pathlib import Path
from typing import Any

from roscode.tools import _shell

_MSG_SEP = re.compile(r"^---\s*$", re.MULTILINE)


def _error(prefix: str, stderr: str) -> str:
    return f"Error: {prefix}: {stderr.strip() or '(no stderr)'}"


def ros_graph() -> str:
    """Return a formatted listing of active nodes, topics, and services."""
    nodes = _shell.run(["ros2", "node", "list"], timeout=5.0)
    topics = _shell.run(["ros2", "topic", "list", "-t"], timeout=5.0)
    services = _shell.run(["ros2", "service", "list"], timeout=5.0)

    if not nodes.ok:
        return _error("ros2 node list", nodes.stderr)

    parts: list[str] = []
    parts.append("NODES:")
    parts.extend(f"  {n}" for n in nodes.stdout.splitlines() if n.strip())
    if not any(n.strip() for n in nodes.stdout.splitlines()):
        parts.append("  (none)")

    parts.append("\nTOPICS:")
    if topics.ok:
        for line in topics.stdout.splitlines():
            if line.strip():
                parts.append(f"  {line}")
    else:
        parts.append(f"  (error: {topics.stderr.strip()})")

    parts.append("\nSERVICES:")
    if services.ok:
        for line in services.stdout.splitlines():
            if line.strip():
                parts.append(f"  {line}")
    else:
        parts.append(f"  (error: {services.stderr.strip()})")

    return "\n".join(parts)


def topic_echo(topic: str, duration_sec: float = 3.0, max_messages: int = 20) -> str:
    """Subscribe to `topic` for `duration_sec` seconds, return up to N messages."""
    result = _shell.run(
        ["timeout", f"{duration_sec}", "ros2", "topic", "echo", "--no-arr", topic],
        timeout=duration_sec + 2.0,
    )

    if result.returncode not in (0, 124) and not result.stdout:
        return _error(f"ros2 topic echo {topic}", result.stderr)

    chunks = [c.strip() for c in _MSG_SEP.split(result.stdout) if c.strip()]
    if not chunks:
        return (
            f"No messages received on {topic} during {duration_sec}s window.\n"
            f"(Is the topic being published? Try ros_graph to confirm.)"
        )

    chunks = chunks[:max_messages]
    total = len(chunks)
    lines = [f"Got {total} message(s) on {topic} in {duration_sec}s:\n"]
    for i, chunk in enumerate(chunks, start=1):
        lines.append(f"[msg {i}/{total}]")
        lines.append(chunk)
        lines.append("")
    return "\n".join(lines).rstrip()


def topic_hz(topic: str, duration_sec: float = 5.0) -> str:
    """Measure publish rate of `topic` over `duration_sec` seconds."""
    result = _shell.run(
        ["timeout", f"{duration_sec}", "ros2", "topic", "hz", topic],
        timeout=duration_sec + 2.0,
    )

    if not result.stdout:
        return _error(f"ros2 topic hz {topic}", result.stderr)

    rates = re.findall(r"average rate:\s*([\d.]+)", result.stdout)
    stddev = re.findall(r"std dev:\s*([\d.]+)s", result.stdout)

    if not rates:
        return (
            f"Could not measure rate on {topic} over {duration_sec}s "
            f"(likely no messages received)."
        )

    mean = float(rates[-1])
    std = float(stddev[-1]) if stddev else 0.0
    return f"Topic {topic}: mean {mean:.2f} Hz, std {std:.4f}s over {duration_sec}s"


def _log_dir() -> Path:
    """Return the ROS 2 log directory. Separated so tests can patch it."""
    return Path.home() / ".ros" / "log" / "latest"


def log_tail(num_lines: int = 50, level_filter: str | None = None) -> str:
    """Return the last `num_lines` from ~/.ros/log/latest/*.log, optionally filtered."""
    log_dir = _log_dir()
    if not log_dir.exists():
        return f"No ROS log directory found at {log_dir}. Run a node first?"

    lines: list[str] = []
    for log_file in sorted(log_dir.glob("*.log")):
        try:
            lines.extend(log_file.read_text(errors="replace").splitlines())
        except OSError as exc:
            lines.append(f"[skipped {log_file.name}: {exc}]")

    if not lines:
        return f"No log lines in {log_dir}."

    if level_filter:
        needle = level_filter.upper()
        lines = [ln for ln in lines if needle in ln.upper()]
        if not lines:
            return f"No lines matching level {level_filter!r} in recent logs."

    return "\n".join(lines[-num_lines:])


def service_call(service: str, service_type: str, request_json: str) -> str:
    """Call a ROS 2 service and return the response as formatted text."""
    result = _shell.run(
        ["ros2", "service", "call", service, service_type, request_json],
        timeout=10.0,
    )
    if not result.ok:
        return _error(f"ros2 service call {service}", result.stderr or result.stdout)
    return result.stdout.strip() or "(service call returned empty response)"


def param_get(node: str, param: str) -> str:
    """Read a node parameter. Returns the value as a string."""
    result = _shell.run(["ros2", "param", "get", node, param], timeout=5.0)
    if not result.ok:
        return _error(f"ros2 param get {node} {param}", result.stderr or result.stdout)
    return result.stdout.strip()


def param_set(node: str, param: str, value: str) -> str:
    """Set a node parameter. DESTRUCTIVE — gated by confirmation in the agent loop."""
    result = _shell.run(["ros2", "param", "set", node, param, value], timeout=5.0)
    if not result.ok:
        return _error(f"ros2 param set {node} {param}", result.stderr or result.stdout)
    return f"Set {node}.{param} = {value}\n{result.stdout.strip()}"


def tf_lookup(source_frame: str, target_frame: str) -> str:
    """Look up the transform from source_frame to target_frame."""
    result = _shell.run(
        ["timeout", "3", "ros2", "run", "tf2_ros", "tf2_echo", source_frame, target_frame],
        timeout=5.0,
    )
    if not result.stdout and not result.ok:
        return _error(
            f"tf2_echo {source_frame} -> {target_frame}", result.stderr
        )
    body = result.stdout.strip()
    if not body:
        return f"No transform available from {source_frame} to {target_frame}."
    return f"Transform {source_frame} -> {target_frame}:\n{body}"


SCHEMAS: list[dict[str, Any]] = [
    {
        "name": "ros_graph",
        "description": (
            "List every active ROS 2 node, topic (with publishers and subscribers), "
            "and service on the current graph. Use this first when you need to orient "
            "yourself in an unfamiliar system. Returns formatted plain text, not JSON."
        ),
        "input_schema": {"type": "object", "properties": {}},
    },
    {
        "name": "topic_echo",
        "description": (
            "Subscribe to a ROS 2 topic for a given duration and return the messages "
            "received. Use this to inspect live sensor data (odometry, IMU, laser "
            "scans, etc.). Returns summarized messages, not raw bytes. Keep duration "
            "short (<10s) for interactive use."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "topic": {
                    "type": "string",
                    "description": "Full topic name, e.g. /odom or /scan.",
                },
                "duration_sec": {
                    "type": "number",
                    "description": "Seconds to listen. Default 3.0.",
                    "default": 3.0,
                },
                "max_messages": {
                    "type": "integer",
                    "description": "Max messages to return. Default 20.",
                    "default": 20,
                },
            },
            "required": ["topic"],
        },
    },
    {
        "name": "topic_hz",
        "description": (
            "Measure the publish rate of a topic over a time window and return mean "
            "and standard-deviation hertz. Use this to diagnose dropped sensor data "
            "or overloaded publishers."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "topic": {"type": "string", "description": "Full topic name."},
                "duration_sec": {
                    "type": "number",
                    "description": "Window over which to average. Default 5.0.",
                    "default": 5.0,
                },
            },
            "required": ["topic"],
        },
    },
    {
        "name": "log_tail",
        "description": (
            "Return the most recent lines from the ROS 2 log (~/.ros/log/latest), "
            "optionally filtered by severity. Use this after a crash or unexpected "
            "behavior to find the first error line."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "num_lines": {
                    "type": "integer",
                    "description": "How many log lines to return. Default 50.",
                    "default": 50,
                },
                "level_filter": {
                    "type": "string",
                    "description": "Optional severity filter, e.g. 'ERROR' or 'WARN'.",
                },
            },
        },
    },
    {
        "name": "service_call",
        "description": (
            "Invoke a ROS 2 service and return its response. Use this to trigger "
            "named actions (enable motors, reset odom, etc.) that the graph exposes."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "service": {"type": "string", "description": "Full service name."},
                "service_type": {
                    "type": "string",
                    "description": "Fully-qualified service type, e.g. std_srvs/srv/Trigger.",
                },
                "request_json": {
                    "type": "string",
                    "description": "Request payload as a JSON string (JSON is valid YAML).",
                },
            },
            "required": ["service", "service_type", "request_json"],
        },
    },
    {
        "name": "param_get",
        "description": "Read a parameter from a named ROS 2 node and return its value.",
        "input_schema": {
            "type": "object",
            "properties": {
                "node": {"type": "string", "description": "Node name, e.g. /odometry_node."},
                "param": {"type": "string", "description": "Parameter name."},
            },
            "required": ["node", "param"],
        },
    },
    {
        "name": "param_set",
        "description": (
            "Set a parameter on a named ROS 2 node. DESTRUCTIVE — requires confirmation. "
            "Prefer fixing bugs in source + rebuild over live param_set for anything "
            "that should persist across restarts."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "node": {"type": "string", "description": "Node name."},
                "param": {"type": "string", "description": "Parameter name."},
                "value": {
                    "type": "string",
                    "description": "New value as a string; ros2 param set parses it.",
                },
            },
            "required": ["node", "param", "value"],
        },
    },
    {
        "name": "tf_lookup",
        "description": (
            "Look up the transform from source_frame to target_frame in the current tf2 tree. "
            "Returns translation and rotation (quaternion and euler) as text."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "source_frame": {"type": "string", "description": "Source tf frame."},
                "target_frame": {"type": "string", "description": "Target tf frame."},
            },
            "required": ["source_frame", "target_frame"],
        },
    },
]

TOOLS = {
    "ros_graph": ros_graph,
    "topic_echo": topic_echo,
    "topic_hz": topic_hz,
    "log_tail": log_tail,
    "service_call": service_call,
    "param_get": param_get,
    "param_set": param_set,
    "tf_lookup": tf_lookup,
}
