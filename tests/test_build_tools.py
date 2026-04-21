"""Tests for roscode.tools.build_tools — writes, colcon, lifecycle, scaffold."""

from __future__ import annotations

import pytest

from roscode.tools import build_tools


# ---------------------------------------------------------------------------
# write_source_file
# ---------------------------------------------------------------------------


def test_write_source_file_writes_new_file(workspace):
    out = build_tools.write_source_file("src/pkg/new.py", "a = 1\nb = 2\n")
    assert "Wrote 2 line(s) to src/pkg/new.py" in out
    assert (workspace / "src" / "pkg" / "new.py").read_text() == "a = 1\nb = 2\n"


def test_write_source_file_overwrites(workspace):
    target = workspace / "src" / "pkg" / "x.py"
    target.parent.mkdir(parents=True)
    target.write_text("old\n")
    build_tools.write_source_file("src/pkg/x.py", "new\n")
    assert target.read_text() == "new\n"


def test_write_source_file_rejects_outside(workspace):
    out = build_tools.write_source_file("../escape.py", "x = 1")
    assert out.startswith("Error:")
    assert "outside workspace" in out


# ---------------------------------------------------------------------------
# workspace_build
# ---------------------------------------------------------------------------


def test_workspace_build_success(workspace, fake_shell, shell_result):
    fake = fake_shell(
        scripts={
            ("colcon", "build"): [
                shell_result(stdout="Starting >>> pkg\nFinished <<< pkg\n", returncode=0)
            ]
        },
    )
    out = build_tools.workspace_build()
    assert "Build succeeded" in out
    assert "Finished <<< pkg" in out
    assert fake.calls[-1][:2] == ["colcon", "build"]
    assert "--symlink-install" in fake.calls[-1]


def test_workspace_build_with_package_adds_select(workspace, fake_shell, shell_result):
    fake = fake_shell(
        scripts={("colcon", "build"): [shell_result(stdout="ok\n", returncode=0)]},
    )
    build_tools.workspace_build(package="simple_odometry")
    cmd = fake.calls[-1]
    assert "--packages-select" in cmd
    assert "simple_odometry" in cmd


def test_workspace_build_fails_nonzero(workspace, fake_shell, shell_result):
    fake_shell(
        scripts={
            ("colcon", "build"): [
                shell_result(stdout="CMake Error: foo\n", stderr="bar\n", returncode=1)
            ]
        },
    )
    out = build_tools.workspace_build()
    assert "Build FAILED" in out
    assert "CMake Error: foo" in out


def test_workspace_build_timeout(workspace, fake_shell, shell_result):
    fake_shell(
        scripts={("colcon", "build"): [shell_result(stdout="", stderr="slow\n", returncode=124)]},
    )
    out = build_tools.workspace_build()
    assert "timed out" in out


def test_workspace_build_tails_30_lines(workspace, fake_shell, shell_result):
    stdout = "\n".join(f"line {i}" for i in range(1, 101)) + "\n"
    fake_shell(scripts={("colcon", "build"): [shell_result(stdout=stdout, returncode=0)]})
    out = build_tools.workspace_build()
    assert "line 100" in out
    assert "line 71" in out   # last 30 lines: 71-100
    assert "line 70" not in out


# ---------------------------------------------------------------------------
# node_spawn / node_kill
# ---------------------------------------------------------------------------


class _FakeProc:
    def __init__(self, pid: int = 424242) -> None:
        self.pid = pid
        self.returncode = None
        self.terminated = False
        self.killed = False

    def poll(self):
        return self.returncode

    def terminate(self):
        self.terminated = True
        self.returncode = -15

    def kill(self):
        self.killed = True
        self.returncode = -9

    def wait(self, timeout=None):  # noqa: ARG002
        return self.returncode


@pytest.fixture
def fake_popen(monkeypatch):
    """Replace build_tools._popen with a factory that yields _FakeProc instances."""
    created: list[_FakeProc] = []

    def factory(cmd):
        proc = _FakeProc(pid=10000 + len(created))
        created.append(proc)
        return proc

    monkeypatch.setattr(build_tools, "_popen", factory)
    monkeypatch.setattr(build_tools, "_SPAWNED", {})
    return created


def test_node_spawn_stores_pid(workspace, fake_popen):
    out = build_tools.node_spawn("simple_odometry", "odometry_node")
    assert "Spawned odometry_node (pid 10000)" in out
    assert "odometry_node" in build_tools._SPAWNED


def test_node_spawn_custom_name(workspace, fake_popen):
    out = build_tools.node_spawn("pkg", "exe", node_name="my_node")
    assert "Spawned my_node" in out
    assert "my_node" in build_tools._SPAWNED


def test_node_spawn_rejects_duplicate(workspace, fake_popen):
    build_tools.node_spawn("pkg", "exe")
    out = build_tools.node_spawn("pkg", "exe")
    assert out.startswith("Error:")
    assert "already running" in out


def test_node_kill_terminates_stored_proc(workspace, fake_popen):
    build_tools.node_spawn("pkg", "exe")
    proc = build_tools._SPAWNED["exe"]
    out = build_tools.node_kill("exe")
    assert "Killed exe" in out
    assert proc.terminated is True
    assert "exe" not in build_tools._SPAWNED


def test_node_kill_unknown(workspace, fake_popen):
    out = build_tools.node_kill("nobody")
    assert out.startswith("Error:")
    assert "was not spawned" in out


def test_node_kill_already_exited(workspace, fake_popen):
    build_tools.node_spawn("pkg", "exe")
    build_tools._SPAWNED["exe"].returncode = 0
    out = build_tools.node_kill("exe")
    assert "had already exited" in out


# ---------------------------------------------------------------------------
# package_scaffold
# ---------------------------------------------------------------------------


def test_package_scaffold_writes_canonical_layout(workspace):
    out = build_tools.package_scaffold("safety_stop", "safety_node", "watch /scan for close obstacles")
    assert "Scaffolded package 'safety_stop'" in out

    pkg_root = workspace / "src" / "safety_stop"
    for rel in [
        "package.xml",
        "setup.py",
        "setup.cfg",
        "resource/safety_stop",
        "safety_stop/__init__.py",
        "safety_stop/safety_node.py",
    ]:
        assert (pkg_root / rel).exists(), rel

    package_xml = (pkg_root / "package.xml").read_text()
    assert "<name>safety_stop</name>" in package_xml
    assert "watch /scan for close obstacles" in package_xml

    setup_py = (pkg_root / "setup.py").read_text()
    assert "'safety_node = safety_stop.safety_node:main'" in setup_py
    assert "entry_points={" in setup_py  # single brace survives .format

    node_py = (pkg_root / "safety_stop" / "safety_node.py").read_text()
    assert "class SafetyNode(Node):" in node_py
    assert "super().__init__('safety_node')" in node_py


def test_package_scaffold_rejects_existing(workspace):
    (workspace / "src" / "safety_stop").mkdir(parents=True)
    out = build_tools.package_scaffold("safety_stop", "safety_node", "...")
    assert out.startswith("Error:")
    assert "already exists" in out


def test_package_scaffold_rejects_invalid_identifier(workspace):
    out = build_tools.package_scaffold("safety-stop", "safety_node", "...")
    assert out.startswith("Error:")
    assert "not a valid Python identifier" in out
