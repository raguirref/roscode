"""Transparent ROS 2 container backend.

When ``ros2`` is not on PATH (macOS / Windows), roscode automatically starts a
ROS 2 Humble Docker or Podman container, mounts the active workspace, and
routes every shell command through ``docker exec`` / ``podman exec``.

Usage (in agent.py)::

    from roscode import container
    container.ensure_running(workspace_path)   # no-op if ros2 is local
    # … all _shell.run() calls now route transparently …
    # atexit handler calls container.stop() automatically

Set ``ROSCODE_NO_CONTAINER=1`` to force native-only mode (used in tests and
on machines where ros2 is installed locally but Docker is also present).
"""

from __future__ import annotations

import atexit
import os
import shlex
import shutil
import subprocess
import threading
from pathlib import Path

# ---------------------------------------------------------------------------
# Module-level state
# ---------------------------------------------------------------------------

_IMAGE = "ros:humble-ros-base"
_CONTAINER = "roscode-ros"

_runtime: str | None = None        # "docker" | "podman"
_host_workspace: Path | None = None
_lock = threading.Lock()
_started = False
_force_native = False              # set by CLI --no-container


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def disable() -> None:
    """Force native mode — skip container even when ros2 is absent."""
    global _force_native
    _force_native = True


def detect_runtime() -> str | None:
    """Return ``'docker'`` or ``'podman'`` if found on PATH, else ``None``."""
    for rt in ("docker", "podman"):
        if shutil.which(rt):
            return rt
    return None


def is_needed() -> bool:
    """True when ros2 is absent locally but a container runtime is available.

    Returns False when:
    - ``ROSCODE_NO_CONTAINER=1`` is set, or
    - ``disable()`` was called, or
    - ``ros2`` is already on PATH (native ROS install).
    """
    if os.environ.get("ROSCODE_NO_CONTAINER") or _force_native:
        return False
    if shutil.which("ros2"):
        return False
    return detect_runtime() is not None


def ensure_running(workspace_path: Path) -> None:
    """Start the ROS 2 container if not already running.

    Safe to call multiple times — idempotent. Registers ``stop()`` via
    ``atexit`` so the container is always cleaned up on process exit.

    Raises ``RuntimeError`` if no container runtime can be found.
    """
    global _runtime, _host_workspace, _started

    if not is_needed():
        return

    with _lock:
        if _started:
            return

        rt = detect_runtime()
        if rt is None:
            raise RuntimeError(
                "ros2 is not on PATH and neither Docker nor Podman was found.\n"
                "Install Docker Desktop: https://docs.docker.com/get-docker/"
            )

        _runtime = rt
        _host_workspace = workspace_path.resolve()
        _start_container(rt, _host_workspace)
        atexit.register(stop)
        _started = True


def stop() -> None:
    """Stop and remove the managed container. Called automatically via atexit."""
    global _started
    if not _started or _runtime is None:
        return
    subprocess.run([_runtime, "rm", "-f", _CONTAINER], capture_output=True)
    _started = False


def _ros_preamble() -> str:
    """Shell preamble that sources ROS and the workspace install overlay (if built)."""
    return (
        "source /opt/ros/humble/setup.bash"
        " && { [ -f /workspace/install/setup.bash ]"
        " && source /workspace/install/setup.bash || true; }"
    )


def exec_cmd(
    cmd: list[str],
    *,
    timeout: float = 10.0,
    cwd: str | None = None,
) -> "ShellResult":  # noqa: F821 — forward ref resolved at call time
    """Execute *cmd* inside the managed container and return a ShellResult."""
    from roscode.tools._shell import ShellResult  # avoid circular import at module level

    if _runtime is None or _host_workspace is None:
        return ShellResult(
            returncode=1,
            stdout="",
            stderr="Container not started — call ensure_running() first.",
        )

    container_cwd = _translate_cwd(cwd)
    ros_cmd = _ros_preamble() + " && " + " ".join(shlex.quote(c) for c in cmd)

    exec_args = [
        _runtime, "exec",
        "-w", container_cwd,
        _CONTAINER,
        "bash", "-c", ros_cmd,
    ]

    try:
        proc = subprocess.run(
            exec_args,
            timeout=timeout,
            capture_output=True,
            text=True,
        )
    except subprocess.TimeoutExpired as exc:
        return ShellResult(
            returncode=124,
            stdout=(
                exc.stdout.decode()
                if isinstance(exc.stdout, bytes)
                else (exc.stdout or "")
            ),
            stderr=f"[timeout after {timeout}s running {' '.join(cmd)}]",
        )
    except FileNotFoundError as exc:
        return ShellResult(
            returncode=127,
            stdout="",
            stderr=f"[command not found: {exc.filename}]",
        )

    return ShellResult(
        returncode=proc.returncode,
        stdout=proc.stdout,
        stderr=proc.stderr,
    )


def spawn_background(cmd: list[str]) -> None:
    """Start *cmd* as a detached background process inside the container."""
    if _runtime is None:
        raise RuntimeError("Container not started.")

    ros_cmd = _ros_preamble() + " && " + " ".join(shlex.quote(c) for c in cmd)
    subprocess.run(
        [_runtime, "exec", "-d", _CONTAINER, "bash", "-c", ros_cmd],
        capture_output=True,
    )


def spawn_gui_background(cmd: list[str]) -> None:
    """Start a GUI tool as a detached process inside the container with DISPLAY forwarded.

    On Linux desktops and Lima VMs (Mac + XQuartz), the GUI window appears on
    the host display. On Docker Desktop for Mac without X11 forwarding the
    process starts but cannot open a window — users should install XQuartz and
    set DISPLAY, or use native ROS with ``--no-container``.
    """
    import os

    if _runtime is None:
        raise RuntimeError("Container not started — call ensure_running() first.")

    display = os.environ.get("DISPLAY", ":0")
    ros_cmd = _ros_preamble() + " && " + " ".join(shlex.quote(c) for c in cmd)
    subprocess.run(
        [
            _runtime, "exec", "-d",
            "-e", f"DISPLAY={display}",
            _CONTAINER,
            "bash", "-c", ros_cmd,
        ],
        capture_output=True,
    )


def kill_background(pattern: str) -> "ShellResult":  # noqa: F821
    """Kill background processes inside the container matching *pattern*."""
    return exec_cmd(["pkill", "-f", pattern], timeout=5.0)


# ---------------------------------------------------------------------------
# Internals
# ---------------------------------------------------------------------------

def _start_container(runtime: str, workspace_path: Path) -> None:
    """Start (or reuse) the ROS 2 Humble container."""
    # Reuse if already running (e.g. from a previous roscode call in same session)
    check = subprocess.run(
        [runtime, "inspect", "--format", "{{.State.Running}}", _CONTAINER],
        capture_output=True,
        text=True,
    )
    if check.returncode == 0 and check.stdout.strip() == "true":
        return

    # Remove any stopped container with the same name before creating a new one
    subprocess.run([runtime, "rm", "-f", _CONTAINER], capture_output=True)

    # Ensure ~/.ros exists so the volume mount doesn't fail
    ros_log = Path.home() / ".ros"
    ros_log.mkdir(parents=True, exist_ok=True)

    try:
        subprocess.run(
            [
                runtime, "run", "--detach",
                "--name", _CONTAINER,
                # Workspace bind-mount (writable — write_source_file writes here on host)
                "--volume", f"{workspace_path}:/workspace",
                # Share ROS log dir so log_tail's host-side filesystem reads work
                "--volume", f"{ros_log}:/root/.ros",
                # Stable ROS domain to avoid collisions with other DDS traffic
                "--env", "ROS_DOMAIN_ID=42",
                _IMAGE,
                "tail", "-f", "/dev/null",  # keep the container alive
            ],
            check=True,
            capture_output=True,
        )
    except subprocess.CalledProcessError as exc:
        stderr = exc.stderr.decode(errors="replace") if exc.stderr else ""
        raise RuntimeError(
            f"Failed to start ROS 2 container (exit {exc.returncode}).\n"
            f"{stderr.strip()}\n"
            f"Ensure {runtime} is running and can pull '{_IMAGE}' from the internet."
        ) from exc


def _translate_cwd(cwd: str | None) -> str:
    """Map a host-side *cwd* to the equivalent path inside the container.

    Any path that falls inside the workspace maps to ``/workspace/...``.
    Anything else (or None) defaults to ``/workspace``.
    """
    if cwd is None or _host_workspace is None:
        return "/workspace"
    try:
        rel = Path(cwd).resolve().relative_to(_host_workspace)
        parts = rel.as_posix()
        return f"/workspace/{parts}" if parts != "." else "/workspace"
    except ValueError:
        return "/workspace"
