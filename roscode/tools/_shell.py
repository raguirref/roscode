"""Thin subprocess wrapper used by every tool. Centralised so tests can mock one place.

When ``roscode.container.is_needed()`` returns True (no local ros2, but Docker/Podman
is available), ``run()`` transparently routes commands through the managed container
instead of the local subprocess — no changes needed in individual tool modules.
"""

from __future__ import annotations

import subprocess
from dataclasses import dataclass


@dataclass(frozen=True)
class ShellResult:
    returncode: int
    stdout: str
    stderr: str

    @property
    def ok(self) -> bool:
        return self.returncode == 0


def run(
    cmd: list[str],
    *,
    timeout: float = 10.0,
    cwd: str | None = None,
    check: bool = False,
) -> ShellResult:
    """Run *cmd* and return a ShellResult. Always captures stdout+stderr as text.

    If a ROS 2 container is active (macOS/Windows without native ros2), the
    command is forwarded to the container via ``docker exec`` / ``podman exec``.

    On timeout, returns returncode=124 (matches POSIX ``timeout`` convention).
    Callers never see a ``TimeoutExpired`` exception.
    """
    # Lazy import avoids circular dependency (container imports ShellResult from here)
    from roscode import container as _container  # noqa: PLC0415

    if _container.is_needed():
        return _container.exec_cmd(cmd, timeout=timeout, cwd=cwd)

    # --- Native path ---
    try:
        proc = subprocess.run(
            cmd,
            timeout=timeout,
            capture_output=True,
            text=True,
            cwd=cwd,
            check=check,
        )
    except subprocess.TimeoutExpired as exc:
        return ShellResult(
            returncode=124,
            stdout=(exc.stdout.decode() if isinstance(exc.stdout, bytes) else (exc.stdout or "")),
            stderr=f"[timeout after {timeout}s running {' '.join(cmd)}]",
        )
    except FileNotFoundError as exc:
        return ShellResult(returncode=127, stdout="", stderr=f"[command not found: {exc.filename}]")

    return ShellResult(returncode=proc.returncode, stdout=proc.stdout, stderr=proc.stderr)
