"""Tests for roscode.tools.analysis_tools — static AST-based code analysis."""

from __future__ import annotations

import textwrap

import pytest

from roscode.tools import analysis_tools


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture
def ros_workspace(workspace):
    """Create a minimal ROS 2 workspace with one package containing a real node."""
    pkg_dir = workspace / "src" / "simple_odometry"
    module_dir = pkg_dir / "simple_odometry"
    module_dir.mkdir(parents=True)

    (pkg_dir / "package.xml").write_text(textwrap.dedent("""\
        <?xml version="1.0"?>
        <package format="3">
          <name>simple_odometry</name>
          <version>0.0.0</version>
          <description>test pkg</description>
          <maintainer email="a@b.com">dev</maintainer>
          <license>MIT</license>
          <depend>rclpy</depend>
          <depend>sensor_msgs</depend>
          <depend>nav_msgs</depend>
          <export><build_type>ament_python</build_type></export>
        </package>
    """))
    (module_dir / "__init__.py").write_text("")
    (module_dir / "odometry_node.py").write_text(textwrap.dedent("""\
        import rclpy
        from rclpy.node import Node
        from sensor_msgs.msg import Imu
        from nav_msgs.msg import Odometry

        class OdometryNode(Node):
            def __init__(self):
                super().__init__('odometry_node')
                self._sub = self.create_subscription(Imu, '/imu', self._cb, 10)
                self._pub = self.create_publisher(Odometry, '/odom', 10)
                self.declare_parameter('yaw_bias', 0.05)
                self._timer = self.create_timer(0.05, self._publish)  # 20 Hz

            def _cb(self, msg): pass
            def _publish(self): pass
    """))
    (module_dir / "fake_imu.py").write_text(textwrap.dedent("""\
        import rclpy
        from rclpy.node import Node
        from sensor_msgs.msg import Imu

        class FakeImu(Node):
            def __init__(self):
                super().__init__('fake_imu')
                self._pub = self.create_publisher(Imu, '/imu', 10)
                self._timer = self.create_timer(0.05, self._publish)

            def _publish(self): pass
    """))
    return workspace


# ---------------------------------------------------------------------------
# workspace_map
# ---------------------------------------------------------------------------

def test_workspace_map_empty(workspace):
    out = analysis_tools.workspace_map()
    assert "empty" in out.lower() or "no packages" in out.lower()


def test_workspace_map_lists_package(ros_workspace):
    out = analysis_tools.workspace_map()
    assert "simple_odometry" in out


def test_workspace_map_shows_node_classes(ros_workspace):
    out = analysis_tools.workspace_map()
    assert "OdometryNode" in out
    assert "FakeImu" in out


def test_workspace_map_shows_publishers(ros_workspace):
    out = analysis_tools.workspace_map()
    assert "/odom" in out
    assert "/imu" in out


def test_workspace_map_shows_subscriber(ros_workspace):
    out = analysis_tools.workspace_map()
    # OdometryNode subscribes to /imu
    assert "sub" in out


def test_workspace_map_shows_parameter(ros_workspace):
    out = analysis_tools.workspace_map()
    assert "yaw_bias" in out
    assert "0.05" in out


def test_workspace_map_shows_timer_hz(ros_workspace):
    out = analysis_tools.workspace_map()
    assert "20.0 Hz" in out


def test_workspace_map_shows_topic_graph(ros_workspace):
    out = analysis_tools.workspace_map()
    assert "DATA FLOW GRAPH" in out
    # FakeImu publishes /imu, OdometryNode subscribes
    assert "/imu" in out


def test_workspace_map_topic_graph_connects_nodes(ros_workspace):
    out = analysis_tools.workspace_map()
    # Topic graph renders as two lines: "    /imu" then "      Pub ──▶ Sub"
    lines = out.splitlines()
    for i, ln in enumerate(lines):
        if "/imu" in ln and i + 1 < len(lines):
            flow = lines[i + 1]
            if "──▶" in flow:
                assert "FakeImu" in flow, f"Expected FakeImu in flow line: {flow!r}"
                assert "OdometryNode" in flow, f"Expected OdometryNode in flow line: {flow!r}"
                return
    pytest.fail("No data-flow line for /imu found in workspace_map output")


def test_workspace_map_shows_deps(ros_workspace):
    out = analysis_tools.workspace_map()
    assert "sensor_msgs" in out or "nav_msgs" in out


def test_workspace_map_no_src(tmp_path, monkeypatch):
    from roscode.tools._state import set_workspace
    set_workspace(tmp_path)
    out = analysis_tools.workspace_map()
    assert out.startswith("Error:")


def test_workspace_map_ignores_init_and_setup(ros_workspace):
    # __init__.py and setup.py must not produce false node entries
    out = analysis_tools.workspace_map()
    # No ":: (no Node subclass)" lines from __init__.py
    assert "__init__" not in out


# ---------------------------------------------------------------------------
# code_search
# ---------------------------------------------------------------------------

def test_code_search_finds_publisher(ros_workspace):
    out = analysis_tools.code_search("/odom", search_type="publisher")
    assert "create_publisher" in out or "/odom" in out
    assert "odometry_node.py" in out


def test_code_search_finds_subscriber(ros_workspace):
    out = analysis_tools.code_search("/imu", search_type="subscriber")
    assert "create_subscription" in out or "/imu" in out


def test_code_search_finds_parameter(ros_workspace):
    out = analysis_tools.code_search("yaw_bias", search_type="parameter")
    assert "yaw_bias" in out
    assert "odometry_node.py" in out


def test_code_search_free_text(ros_workspace):
    out = analysis_tools.code_search("OdometryNode")
    assert "odometry_node.py" in out


def test_code_search_no_match(ros_workspace):
    out = analysis_tools.code_search("NONEXISTENT_SYMBOL_XYZ")
    assert "No matches" in out


def test_code_search_import_type(ros_workspace):
    out = analysis_tools.code_search("sensor_msgs", search_type="import")
    assert "sensor_msgs" in out


def test_code_search_limits_output(ros_workspace):
    # Should not crash or return absurdly long output
    out = analysis_tools.code_search("self")
    assert len(out) < 50_000


# ---------------------------------------------------------------------------
# _analyze_file internals
# ---------------------------------------------------------------------------

def test_analyze_file_syntax_error(tmp_path):
    broken = tmp_path / "broken.py"
    broken.write_text("def (: pass\n")
    result = analysis_tools._analyze_file(broken)
    assert result == {}


def test_analyze_file_dynamic_topic(tmp_path):
    f = tmp_path / "dynamic.py"
    f.write_text(textwrap.dedent("""\
        from rclpy.node import Node
        class D(Node):
            def __init__(self):
                super().__init__('d')
                topic = '/dyn'
                self.create_publisher(int, topic, 10)
    """))
    result = analysis_tools._analyze_file(f)
    # topic is a variable, not a string literal — should be <dynamic>
    assert any(t == "<dynamic>" for t, _ in result["publishers"])


def test_analyze_file_service(tmp_path):
    f = tmp_path / "srv.py"
    f.write_text(textwrap.dedent("""\
        from rclpy.node import Node
        from std_srvs.srv import Trigger
        class S(Node):
            def __init__(self):
                super().__init__('s')
                self.create_service(Trigger, '/reset', self.cb)
            def cb(self, req, resp): return resp
    """))
    result = analysis_tools._analyze_file(f)
    assert ("/reset", "Trigger") in result["services"]
