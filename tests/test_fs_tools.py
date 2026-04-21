"""Tests for roscode.tools.fs_tools — read/list with path-safety guarantees."""

from __future__ import annotations

from roscode.tools import fs_tools


def test_read_source_file_happy(workspace):
    target = workspace / "src" / "pkg" / "mod.py"
    target.parent.mkdir(parents=True)
    target.write_text("line 1\nline 2\nline 3\n")

    out = fs_tools.read_source_file("src/pkg/mod.py")
    assert "src/pkg/mod.py" in out
    assert "(3 lines)" in out
    assert "line 1" in out
    assert "line 3" in out


def test_read_source_file_truncates_over_300_lines(workspace):
    target = workspace / "src" / "big.py"
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text("\n".join(f"l{i}" for i in range(1, 501)))

    out = fs_tools.read_source_file("src/big.py")
    assert "truncated: showing 300/500 lines" in out
    assert "l300" in out
    assert "l301" not in out


def test_read_source_file_rejects_traversal(workspace, tmp_path):
    outside = tmp_path.parent / "outside.txt"
    outside.write_text("secret")

    out = fs_tools.read_source_file("../outside.txt")
    assert out.startswith("Error:")
    assert "outside workspace" in out


def test_read_source_file_rejects_absolute_outside(workspace, tmp_path):
    outside = tmp_path.parent / "abs_outside.txt"
    outside.write_text("secret")

    out = fs_tools.read_source_file(str(outside))
    assert out.startswith("Error:")
    assert "outside workspace" in out


def test_read_source_file_missing(workspace):
    out = fs_tools.read_source_file("src/does_not_exist.py")
    assert out.startswith("Error: File not found")


def test_read_source_file_not_a_file(workspace):
    (workspace / "src" / "adir").mkdir()
    out = fs_tools.read_source_file("src/adir")
    assert out.startswith("Error: Not a file")


def test_list_workspace_collects_sources(workspace):
    (workspace / "src" / "pkg_a").mkdir()
    (workspace / "src" / "pkg_a" / "a.py").write_text("")
    (workspace / "src" / "pkg_a" / "README.md").write_text("")
    (workspace / "src" / "pkg_b").mkdir()
    (workspace / "src" / "pkg_b" / "b.cpp").write_text("")
    (workspace / "src" / "pkg_b" / "b.hpp").write_text("")

    out = fs_tools.list_workspace()
    assert "src/pkg_a/a.py" in out
    assert "src/pkg_b/b.cpp" in out
    assert "src/pkg_b/b.hpp" in out
    assert "README.md" not in out  # non-source filtered
    assert "3 source file(s)" in out


def test_list_workspace_filters_by_package(workspace):
    (workspace / "src" / "pkg_a").mkdir()
    (workspace / "src" / "pkg_a" / "a.py").write_text("")
    (workspace / "src" / "pkg_b").mkdir()
    (workspace / "src" / "pkg_b" / "b.py").write_text("")

    out = fs_tools.list_workspace(package="pkg_a")
    assert "src/pkg_a/a.py" in out
    assert "pkg_b" not in out


def test_list_workspace_no_src(tmp_path, monkeypatch):
    from roscode.tools._state import set_workspace

    set_workspace(tmp_path)
    out = fs_tools.list_workspace()
    assert out.startswith("Error: No src/")


def test_list_workspace_unknown_package(workspace):
    out = fs_tools.list_workspace(package="does_not_exist")
    assert out.startswith("Error: Package 'does_not_exist' not found")


def test_list_workspace_empty_src(workspace):
    out = fs_tools.list_workspace()
    assert "No source files" in out
