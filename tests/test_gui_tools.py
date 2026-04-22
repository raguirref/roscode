"""Tests for roscode.tools.gui_tools — RViz2 and rqt launchers."""

from __future__ import annotations

import pytest

from roscode.tools import gui_tools


# ---------------------------------------------------------------------------
# Schema sanity
# ---------------------------------------------------------------------------

def test_gui_schemas_present():
    names = {s["name"] for s in gui_tools.SCHEMAS}
    assert names == {"open_rviz", "open_rqt_plot", "open_rqt_multiplot"}


def test_gui_tools_map_complete():
    for schema in gui_tools.SCHEMAS:
        assert schema["name"] in gui_tools.TOOLS


# ---------------------------------------------------------------------------
# No-display behaviour (native mode)
# ---------------------------------------------------------------------------

def test_open_rviz_no_display(monkeypatch):
    monkeypatch.delenv("DISPLAY", raising=False)
    monkeypatch.delenv("WAYLAND_DISPLAY", raising=False)
    # Ensure container backend is disabled
    import roscode.container as container
    monkeypatch.setattr(container, "is_needed", lambda: False)

    out = gui_tools.open_rviz()
    assert "No display" in out or "Error" in out or "not on PATH" in out


def test_open_rqt_plot_no_display(monkeypatch):
    monkeypatch.delenv("DISPLAY", raising=False)
    monkeypatch.delenv("WAYLAND_DISPLAY", raising=False)
    import roscode.container as container
    monkeypatch.setattr(container, "is_needed", lambda: False)

    out = gui_tools.open_rqt_plot()
    assert "No display" in out or "Error" in out or "not on PATH" in out


def test_open_rqt_multiplot_no_display(monkeypatch):
    monkeypatch.delenv("DISPLAY", raising=False)
    monkeypatch.delenv("WAYLAND_DISPLAY", raising=False)
    import roscode.container as container
    monkeypatch.setattr(container, "is_needed", lambda: False)

    out = gui_tools.open_rqt_multiplot()
    assert "No display" in out or "Error" in out or "not on PATH" in out


# ---------------------------------------------------------------------------
# Container mode — spawn_gui_background is called
# ---------------------------------------------------------------------------

def test_open_rviz_container_mode(monkeypatch):
    import roscode.container as container
    monkeypatch.setattr(container, "is_needed", lambda: True)
    spawned: list[list[str]] = []
    monkeypatch.setattr(container, "spawn_gui_background", lambda cmd: spawned.append(cmd))

    out = gui_tools.open_rviz()
    assert "rviz2" in out.lower() or len(spawned) == 1
    assert spawned and spawned[0][0] == "rviz2"


def test_open_rviz_container_mode_with_config(monkeypatch):
    import roscode.container as container
    monkeypatch.setattr(container, "is_needed", lambda: True)
    spawned: list[list[str]] = []
    monkeypatch.setattr(container, "spawn_gui_background", lambda cmd: spawned.append(cmd))

    gui_tools.open_rviz(config_file="/tmp/my.rviz")
    assert spawned[0] == ["rviz2", "-d", "/tmp/my.rviz"]


def test_open_rqt_plot_container_with_topics(monkeypatch):
    import roscode.container as container
    monkeypatch.setattr(container, "is_needed", lambda: True)
    spawned: list[list[str]] = []
    monkeypatch.setattr(container, "spawn_gui_background", lambda cmd: spawned.append(cmd))

    gui_tools.open_rqt_plot(topics=["/odom/pose/pose/orientation/z"])
    assert spawned[0] == ["rqt_plot", "/odom/pose/pose/orientation/z"]


def test_open_rqt_multiplot_container(monkeypatch):
    import roscode.container as container
    monkeypatch.setattr(container, "is_needed", lambda: True)
    spawned: list[list[str]] = []
    monkeypatch.setattr(container, "spawn_gui_background", lambda cmd: spawned.append(cmd))

    gui_tools.open_rqt_multiplot()
    assert spawned[0][0] == "rqt_multiplot"


def test_container_runtime_error_propagates(monkeypatch):
    import roscode.container as container
    monkeypatch.setattr(container, "is_needed", lambda: True)
    monkeypatch.setattr(
        container,
        "spawn_gui_background",
        lambda cmd: (_ for _ in ()).throw(RuntimeError("container not started")),
    )
    out = gui_tools.open_rviz()
    assert "Error" in out and "container" in out.lower()
