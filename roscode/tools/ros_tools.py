"""ROS 2 runtime tool wrappers.

Each tool shells out to the `ros2` CLI via subprocess and returns a formatted
str. Scaffold only — bodies raise NotImplementedError. Task 3 in the brief
fleshes them out. Schemas here are final; edit the function bodies without
touching the schemas to avoid breaking Opus tool-selection.
"""

from __future__ import annotations

from typing import Any


def ros_graph() -> str:
    """Return a formatted listing of active nodes, topics, and services."""
    raise NotImplementedError("ros_graph — implement via `ros2 node/topic/service list`")


def topic_echo(topic: str, duration_sec: float = 3.0, max_messages: int = 20) -> str:
    """Subscribe to `topic` for `duration_sec` seconds, return up to N messages."""
    raise NotImplementedError("topic_echo — implement via `timeout {d} ros2 topic echo`")


def topic_hz(topic: str, duration_sec: float = 5.0) -> str:
    """Measure publish rate of `topic` over `duration_sec` seconds."""
    raise NotImplementedError("topic_hz — implement via `ros2 topic hz`")


def log_tail(num_lines: int = 50, level_filter: str | None = None) -> str:
    """Return the last `num_lines` from /rosout, optionally filtered by level."""
    raise NotImplementedError("log_tail — read ~/.ros/log/latest/ or echo /rosout")


def service_call(service: str, service_type: str, request_json: str) -> str:
    """Call a ROS 2 service and return the response as formatted text."""
    raise NotImplementedError("service_call — implement via `ros2 service call`")


def param_get(node: str, param: str) -> str:
    """Read a node parameter. Returns the value as a string."""
    raise NotImplementedError("param_get — implement via `ros2 param get`")


def param_set(node: str, param: str, value: str) -> str:
    """Set a node parameter. DESTRUCTIVE — gated by confirmation."""
    raise NotImplementedError("param_set — implement via `ros2 param set`")


def tf_lookup(source_frame: str, target_frame: str) -> str:
    """Look up the transform from `source_frame` to `target_frame`."""
    raise NotImplementedError("tf_lookup — implement via `ros2 run tf2_ros tf2_echo`")


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
            "Return the most recent lines from the ROS 2 log (/rosout or the on-disk "
            "log directory), optionally filtered by severity. Use this after a crash "
            "or unexpected behavior to find the first error line."
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
                    "description": "Request payload as a JSON string.",
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
                    "description": "New value as a string; the wrapper parses ints/floats/bools.",
                },
            },
            "required": ["node", "param", "value"],
        },
    },
    {
        "name": "tf_lookup",
        "description": (
            "Look up the transform from source_frame to target_frame in the current tf2 tree. "
            "Returns translation (x, y, z) and rotation (as quaternion + euler) as text."
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
