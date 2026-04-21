"""Pytest fixtures shared across the suite."""

from __future__ import annotations

from dataclasses import dataclass

import pytest


@dataclass
class FakeShell:
    """Stand-in for roscode.tools._shell.run. Queues scripted ShellResults per-command-prefix."""

    scripts: dict[tuple[str, ...], list[object]]
    default: object | None = None
    calls: list[list[str]] = None  # type: ignore[assignment]

    def __post_init__(self) -> None:
        self.calls = []

    def __call__(self, cmd, *args, **kwargs):  # noqa: ANN001, ANN002, ANN003
        self.calls.append(list(cmd))
        for prefix, queue in self.scripts.items():
            if tuple(cmd[: len(prefix)]) == prefix and queue:
                return queue.pop(0)
        if self.default is not None:
            return self.default
        raise AssertionError(
            f"FakeShell: no script matched cmd={cmd!r} and no default set"
        )


@pytest.fixture
def shell_result():
    """Factory for ShellResult objects, avoids importing in every test."""
    from roscode.tools._shell import ShellResult

    def _make(stdout: str = "", stderr: str = "", returncode: int = 0) -> ShellResult:
        return ShellResult(returncode=returncode, stdout=stdout, stderr=stderr)

    return _make


@pytest.fixture
def fake_shell(monkeypatch, shell_result):
    """Patch roscode.tools._shell.run with a FakeShell the test can program."""
    from roscode.tools import _shell

    def install(scripts=None, default=None):
        scripts = scripts or {}
        fake = FakeShell(scripts=scripts, default=default)
        monkeypatch.setattr(_shell, "run", fake)
        return fake

    return install


@pytest.fixture
def workspace(tmp_path):
    """Point roscode.tools.get_workspace() at a tmp dir and yield the Path.

    Creates workspace/src/ automatically since most fs/build tests need it.
    """
    from roscode.tools._state import set_workspace

    set_workspace(tmp_path)
    (tmp_path / "src").mkdir(exist_ok=True)
    return tmp_path.resolve()
