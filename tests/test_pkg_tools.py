"""Tests for roscode.tools.pkg_tools — package search, info, and install."""

from __future__ import annotations

import pytest

from roscode.tools import pkg_tools


# ---------------------------------------------------------------------------
# Schema sanity
# ---------------------------------------------------------------------------

def test_pkg_schemas_present():
    names = {s["name"] for s in pkg_tools.SCHEMAS}
    assert names == {"pkg_search", "pkg_info", "pkg_install"}


def test_pkg_tools_map_complete():
    for schema in pkg_tools.SCHEMAS:
        assert schema["name"] in pkg_tools.TOOLS


# ---------------------------------------------------------------------------
# pkg_search
# ---------------------------------------------------------------------------

def test_pkg_search_returns_installed(fake_shell, shell_result):
    fake_shell(
        scripts={
            ("ros2", "pkg", "list"): [
                shell_result(stdout="nav2_bringup\nnav2_core\nslam_toolbox\n")
            ],
            ("apt-cache", "search"): [shell_result(stdout="")],
        }
    )
    out = pkg_tools.pkg_search("nav2")
    assert "nav2_bringup" in out
    assert "nav2_core" in out
    assert "slam_toolbox" not in out  # doesn't match "nav2"


def test_pkg_search_no_installed_matches(fake_shell, shell_result):
    fake_shell(
        scripts={
            ("ros2", "pkg", "list"): [shell_result(stdout="rclpy\n")],
            ("apt-cache", "search"): [shell_result(stdout="")],
        }
    )
    out = pkg_tools.pkg_search("nav2")
    assert "No installed packages" in out


def test_pkg_search_shows_available(fake_shell, shell_result):
    fake_shell(
        scripts={
            ("ros2", "pkg", "list"): [shell_result(stdout="rclpy\n")],
            ("apt-cache", "search"): [
                shell_result(
                    stdout="ros-humble-nav2-bringup - Nav2 bringup package\n"
                )
            ],
        }
    )
    out = pkg_tools.pkg_search("nav2")
    assert "Available to install" in out
    assert "nav2_bringup" in out


def test_pkg_search_ros2_pkg_list_failure(fake_shell, shell_result):
    fake_shell(
        scripts={
            ("ros2", "pkg", "list"): [shell_result(returncode=1, stderr="not found")],
            ("apt-cache", "search"): [shell_result(stdout="")],
        }
    )
    out = pkg_tools.pkg_search("slam")
    assert "No installed packages" in out


# ---------------------------------------------------------------------------
# pkg_info
# ---------------------------------------------------------------------------

_PACKAGE_XML = """\
<?xml version="1.0"?>
<package format="3">
  <name>sensor_msgs</name>
  <version>4.2.0</version>
  <description>Sensor messages package.</description>
  <depend>rclpy</depend>
  <depend>std_msgs</depend>
</package>
"""


def test_pkg_info_installed(fake_shell, shell_result):
    fake_shell(
        scripts={
            ("ros2", "pkg", "xml"): [shell_result(stdout=_PACKAGE_XML)],
        }
    )
    out = pkg_tools.pkg_info("sensor_msgs")
    assert "sensor_msgs" in out
    assert "4.2.0" in out
    assert "Sensor messages" in out
    assert "std_msgs" in out


def test_pkg_info_not_installed_falls_back_to_apt(fake_shell, shell_result):
    fake_shell(
        scripts={
            ("ros2", "pkg", "xml"): [shell_result(returncode=1, stderr="not found")],
            ("apt-cache", "show"): [
                shell_result(
                    stdout="Package: ros-humble-sensor-msgs\nVersion: 4.2.0-1\nDescription: Sensor messages\n"
                )
            ],
        }
    )
    out = pkg_tools.pkg_info("sensor_msgs")
    assert "ros-humble-sensor-msgs" in out
    assert "Not installed" in out


def test_pkg_info_not_found_anywhere(fake_shell, shell_result):
    fake_shell(
        scripts={
            ("ros2", "pkg", "xml"): [shell_result(returncode=1, stderr="not found")],
            ("apt-cache", "show"): [shell_result(returncode=1, stdout="")],
        }
    )
    out = pkg_tools.pkg_info("nonexistent_pkg_xyz")
    assert "not found" in out.lower()


# ---------------------------------------------------------------------------
# pkg_install
# ---------------------------------------------------------------------------

def test_pkg_install_allowed_prefix_succeeds(fake_shell, shell_result):
    fake_shell(
        scripts={
            ("apt-get", "install"): [
                shell_result(stdout="Setting up ros-humble-nav2-bringup...\n")
            ],
        }
    )
    out = pkg_tools.pkg_install("ros-humble-nav2-bringup")
    assert "Installed" in out
    assert "ros-humble-nav2-bringup" in out


def test_pkg_install_python3_prefix_allowed(fake_shell, shell_result):
    fake_shell(
        scripts={
            ("apt-get", "install"): [shell_result(stdout="Setting up python3-numpy...\n")],
        }
    )
    out = pkg_tools.pkg_install("python3-numpy")
    assert "Installed" in out


def test_pkg_install_rejected_disallowed_prefix():
    out = pkg_tools.pkg_install("curl")
    assert out.startswith("Error:")
    assert "only ros-" in out.lower() or "allowed" in out.lower()


def test_pkg_install_rejected_random_package():
    out = pkg_tools.pkg_install("vim")
    assert out.startswith("Error:")


def test_pkg_install_apt_get_not_found(fake_shell, shell_result):
    fake_shell(
        scripts={
            ("apt-get", "install"): [shell_result(returncode=127, stdout="", stderr="apt-get: not found")],
        }
    )
    out = pkg_tools.pkg_install("ros-humble-nav2-bringup")
    assert "apt-get not found" in out or "container" in out.lower()


def test_pkg_install_apt_get_failure(fake_shell, shell_result):
    fake_shell(
        scripts={
            ("apt-get", "install"): [
                shell_result(
                    returncode=100,
                    stderr="E: Unable to locate package ros-humble-bogus-xyz\n",
                )
            ],
        }
    )
    out = pkg_tools.pkg_install("ros-humble-bogus-xyz")
    assert "Error" in out
    assert "failed" in out.lower() or "bogus-xyz" in out


def test_pkg_install_libopencv_prefix_allowed(fake_shell, shell_result):
    fake_shell(
        scripts={
            ("apt-get", "install"): [shell_result(stdout="Setting up libopencv-dev...\n")],
        }
    )
    out = pkg_tools.pkg_install("libopencv-dev")
    assert "Installed" in out


def test_pkg_install_source_reminder(fake_shell, shell_result):
    fake_shell(
        scripts={
            ("apt-get", "install"): [shell_result(stdout="done\n")],
        }
    )
    out = pkg_tools.pkg_install("ros-humble-robot-localization")
    assert "source" in out.lower() or "setup.bash" in out
