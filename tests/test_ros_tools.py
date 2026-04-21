"""Tests for roscode.tools.ros_tools — mocks _shell.run, no live ROS graph required."""

from __future__ import annotations

import pytest

from roscode.tools import ros_tools


def test_ros_graph_formats_three_sections(fake_shell, shell_result):
    fake_shell(
        scripts={
            ("ros2", "node", "list"): [shell_result(stdout="/odometry_node\n/fake_imu\n")],
            ("ros2", "topic", "list", "-t"): [
                shell_result(stdout="/odom [nav_msgs/msg/Odometry]\n/imu [sensor_msgs/msg/Imu]\n")
            ],
            ("ros2", "service", "list"): [shell_result(stdout="/odometry_node/set_parameters\n")],
        }
    )
    out = ros_tools.ros_graph()
    assert "NODES:" in out
    assert "/odometry_node" in out
    assert "TOPICS:" in out
    assert "/odom [nav_msgs/msg/Odometry]" in out
    assert "SERVICES:" in out
    assert "/odometry_node/set_parameters" in out


def test_ros_graph_bubbles_node_list_error(fake_shell, shell_result):
    fake_shell(
        scripts={
            ("ros2", "node", "list"): [
                shell_result(stderr="roscore not running", returncode=1)
            ],
        },
        default=shell_result(),
    )
    out = ros_tools.ros_graph()
    assert out.startswith("Error:")
    assert "roscore not running" in out


def test_topic_echo_parses_and_caps_messages(fake_shell, shell_result):
    stream = "pose.x: 1.0\n---\npose.x: 2.0\n---\npose.x: 3.0\n"
    fake_shell(
        scripts={("timeout",): [shell_result(stdout=stream, returncode=124)]},
    )
    out = ros_tools.topic_echo("/odom", duration_sec=1.0, max_messages=2)
    assert "Got 2 message(s) on /odom" in out
    assert "[msg 1/2]" in out
    assert "pose.x: 1.0" in out
    assert "pose.x: 2.0" in out
    assert "pose.x: 3.0" not in out


def test_topic_echo_empty_stream(fake_shell, shell_result):
    fake_shell(scripts={("timeout",): [shell_result(stdout="", returncode=124)]})
    out = ros_tools.topic_echo("/odom")
    assert "No messages received on /odom" in out


def test_topic_hz_extracts_average_rate(fake_shell, shell_result):
    stdout = (
        "average rate: 19.803\n"
        "  min: 0.049s max: 0.052s std dev: 0.00069s window: 200\n"
    )
    fake_shell(scripts={("timeout",): [shell_result(stdout=stdout, returncode=124)]})
    out = ros_tools.topic_hz("/odom", duration_sec=5.0)
    assert "/odom" in out
    assert "mean 19.80 Hz" in out
    assert "std 0.0007s" in out


def test_topic_hz_no_rate_note(fake_shell, shell_result):
    fake_shell(scripts={("timeout",): [shell_result(stdout="no hz data\n", returncode=124)]})
    out = ros_tools.topic_hz("/odom")
    assert "Could not measure rate" in out


def test_log_tail_reads_and_tails(monkeypatch, tmp_path):
    log_a = tmp_path / "a.log"
    log_a.write_text("\n".join(f"line {i}" for i in range(1, 11)))
    monkeypatch.setattr(ros_tools, "_log_dir", lambda: tmp_path)
    out = ros_tools.log_tail(num_lines=3)
    assert out.splitlines() == ["line 8", "line 9", "line 10"]


def test_log_tail_filters_by_level(monkeypatch, tmp_path):
    (tmp_path / "x.log").write_text(
        "[INFO] starting\n[WARN] slow disk\n[ERROR] crash\n[INFO] retry\n"
    )
    monkeypatch.setattr(ros_tools, "_log_dir", lambda: tmp_path)
    out = ros_tools.log_tail(num_lines=10, level_filter="ERROR")
    assert out == "[ERROR] crash"


def test_log_tail_missing_dir(monkeypatch, tmp_path):
    missing = tmp_path / "does_not_exist"
    monkeypatch.setattr(ros_tools, "_log_dir", lambda: missing)
    out = ros_tools.log_tail()
    assert "No ROS log directory" in out


def test_service_call_happy(fake_shell, shell_result):
    fake_shell(scripts={("ros2", "service", "call"): [shell_result(stdout="response: success=True\n")]})
    out = ros_tools.service_call("/reset", "std_srvs/srv/Trigger", "{}")
    assert "success=True" in out


def test_service_call_error(fake_shell, shell_result):
    fake_shell(
        scripts={
            ("ros2", "service", "call"): [shell_result(stderr="service unavailable", returncode=1)]
        }
    )
    out = ros_tools.service_call("/reset", "std_srvs/srv/Trigger", "{}")
    assert out.startswith("Error:")
    assert "service unavailable" in out


def test_param_get_happy(fake_shell, shell_result):
    fake_shell(scripts={("ros2", "param", "get"): [shell_result(stdout="Double value is: 0.05\n")]})
    out = ros_tools.param_get("/odometry_node", "yaw_bias")
    assert "0.05" in out


def test_param_set_happy(fake_shell, shell_result):
    fake_shell(scripts={("ros2", "param", "set"): [shell_result(stdout="Set parameter successful\n")]})
    out = ros_tools.param_set("/odometry_node", "yaw_bias", "0.0")
    assert "Set /odometry_node.yaw_bias = 0.0" in out
    assert "Set parameter successful" in out


def test_tf_lookup_formats_output(fake_shell, shell_result):
    stdout = "At time 1234567.0\n- Translation: [1.0, 2.0, 0.0]\n- Rotation: in Quaternion [0, 0, 0, 1]\n"
    fake_shell(scripts={("timeout",): [shell_result(stdout=stdout, returncode=124)]})
    out = ros_tools.tf_lookup("map", "base_link")
    assert "map -> base_link" in out
    assert "Translation: [1.0, 2.0, 0.0]" in out


@pytest.mark.parametrize(
    "schema_name",
    [
        "ros_graph", "topic_echo", "topic_hz", "log_tail",
        "service_call", "param_get", "param_set", "tf_lookup",
    ],
)
def test_ros_tools_schemas_present(schema_name):
    names = {s["name"] for s in ros_tools.SCHEMAS}
    assert schema_name in names
    assert schema_name in ros_tools.TOOLS
