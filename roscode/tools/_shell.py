"""Thin subprocess wrapper used by every tool. Centralised so tests can mock one place."""

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
    """Run `cmd` and return a ShellResult. Always captures stdout+stderr as text.

    On timeout, returns a ShellResult with returncode=124 (matches POSIX `timeout`),
    empty stdout, and a synthetic stderr. Callers never see a TimeoutExpired so
    error-to-string formatting can stay in the tool wrappers.
    """
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
