"""Read-only GUI visualization tools: RViz2 and rqt.

These tools open display windows and do NOT modify workspace files or the ROS
graph — no confirmation gate is required.

Requirements (not bundled in ros:humble-ros-base — install once per container):
  apt-get install -y ros-humble-rviz2 ros-humble-rqt ros-humble-rqt-plot \\
                     ros-humble-rqt-multiplot
"""

from __future__ import annotations

import os
import subprocess
from typing import Any

from roscode.tools import _shell

_APT_HINTS: dict[str, str] = {
    "rviz2":          "ros-humble-rviz2",
    "rqt_plot":       "ros-humble-rqt-plot",
    "rqt_multiplot":  "ros-humble-rqt-multiplot",
}


def _has_display() -> bool:
    return bool(os.environ.get("DISPLAY") or os.environ.get("WAYLAND_DISPLAY"))


def _spawn(cmd: list[str]) -> str:
    """Launch a GUI process in the background, routing via container when needed."""
    from roscode import container

    exe = cmd[0]
    hint = _APT_HINTS.get(exe, f"ros-humble-{exe.replace('_', '-')}")

    if container.is_needed():
        try:
            container.spawn_gui_background(cmd)
            return (
                f"Launched {exe} inside the container (DISPLAY forwarded). "
                f"A window should appear on your desktop. "
                f"If nothing opens, ensure {hint} is installed and DISPLAY is set:\n"
                f"  apt-get install -y {hint}"
            )
        except RuntimeError as exc:
            return f"Error: {exc}"

    # Native mode — need a display
    if not _has_display():
        return (
            f"No display detected ($DISPLAY is not set). "
            f"Run roscode in a desktop session or with X11 forwarding (ssh -X)."
        )

    avail = _shell.run(["which", exe], timeout=3.0)
    if not avail.ok:
        return (
            f"Error: {exe!r} is not on PATH. Install it with:\n"
            f"  sudo apt-get install -y {hint}"
        )

    subprocess.Popen(
        cmd,
        stdin=subprocess.DEVNULL,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        env={**os.environ},
    )
    return f"Launched {exe}. The window should appear on your display."


def open_rviz(config_file: str | None = None) -> str:
    """Open RViz2. Loads optional .rviz config file."""
    cmd = ["rviz2"]
    if config_file:
        cmd += ["-d", config_file]
    return _spawn(cmd)


def open_rqt_plot(topics: list[str] | None = None) -> str:
    """Open rqt_plot. Pre-loads optional topic field paths (e.g. /odom/twist/twist/angular/z)."""
    cmd = ["rqt_plot"]
    if topics:
        cmd += list(topics)
    return _spawn(cmd)


def open_rqt_multiplot() -> str:
    """Open rqt_multiplot for configurable multi-panel time-series visualization."""
    return _spawn(["rqt_multiplot"])


SCHEMAS: list[dict[str, Any]] = [
    {
        "name": "open_rviz",
        "description": (
            "Launch RViz2 as a background visualization window so the user can inspect "
            "the TF tree, sensor overlays, costmaps, and robot model. Optionally load "
            "a saved .rviz config file. Not destructive — no confirmation required. "
            "Requires ros-humble-rviz2 (apt-get install -y ros-humble-rviz2)."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "config_file": {
                    "type": "string",
                    "description": "Absolute path to a .rviz config file. Omit for default empty view.",
                },
            },
        },
    },
    {
        "name": "open_rqt_plot",
        "description": (
            "Launch rqt_plot to display one or more ROS 2 topic fields as live "
            "time-series graphs. Pass field paths like '/odom/twist/twist/angular/z'. "
            "Ideal for visualising drift, oscillation, or sensor noise. Not destructive. "
            "Requires ros-humble-rqt-plot."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "topics": {
                    "type": "array",
                    "items": {"type": "string"},
                    "description": (
                        "List of topic field paths to plot, "
                        "e.g. ['/odom/twist/twist/angular/z', '/imu/angular_velocity/z']. "
                        "Omit to open rqt_plot empty so the user can add topics manually."
                    ),
                },
            },
        },
    },
    {
        "name": "open_rqt_multiplot",
        "description": (
            "Launch rqt_multiplot for a configurable multi-panel time-series view. "
            "Better than rqt_plot when you need several signals in separate panels. "
            "Not destructive. Requires ros-humble-rqt-multiplot."
        ),
        "input_schema": {"type": "object", "properties": {}},
    },
]

TOOLS = {
    "open_rviz":          open_rviz,
    "open_rqt_plot":      open_rqt_plot,
    "open_rqt_multiplot": open_rqt_multiplot,
}
