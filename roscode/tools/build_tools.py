"""Destructive tools: source writes, colcon build, node lifecycle, package scaffolding.

Every tool in this module is gated by the confirmation prompt in `agent.py`
via the DESTRUCTIVE_TOOLS set.
"""

from __future__ import annotations

import subprocess
from typing import Any

from roscode.tools import _shell
from roscode.tools._state import get_workspace, resolve_inside_workspace


def _line_count(content: str) -> int:
    if not content:
        return 0
    return content.count("\n") + (0 if content.endswith("\n") else 1)


def write_source_file(file_path: str, content: str) -> str:
    """Write `content` to `file_path`. DESTRUCTIVE — diff preview + confirm in agent loop."""
    try:
        path = resolve_inside_workspace(file_path)
    except ValueError as exc:
        return f"Error: {exc}"

    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding="utf-8")
    rel = path.relative_to(get_workspace()).as_posix()
    return f"Wrote {_line_count(content)} line(s) to {rel}"


def workspace_build(package: str | None = None) -> str:
    """Run `colcon build --symlink-install`. DESTRUCTIVE. 120s timeout."""
    cmd = ["colcon", "build", "--symlink-install"]
    if package:
        cmd += ["--packages-select", package]

    workspace = get_workspace()
    result = _shell.run(cmd, timeout=120.0, cwd=str(workspace))

    combined = "\n".join(filter(None, [result.stdout.strip(), result.stderr.strip()]))
    tail = "\n".join(combined.splitlines()[-30:])
    header = f"$ {' '.join(cmd)}   (cwd={workspace.as_posix()})"

    if result.returncode == 0:
        return f"{header}\n{tail}\n\nBuild succeeded."
    if result.returncode == 124:
        return f"{header}\n{tail}\n\nBuild FAILED: timed out after 120s."
    return f"{header}\n{tail}\n\nBuild FAILED (exit {result.returncode})."


class _ContainerNode:
    """Duck-type for subprocess.Popen when the node runs inside a container.

    ``node_spawn`` stores one of these in ``_SPAWNED`` so that ``node_kill``
    can call ``proc.terminate()`` without knowing whether the node is local
    or inside Docker/Podman.
    """

    def __init__(self, cmd: list[str]) -> None:
        self._cmd_str = " ".join(cmd)
        self.pid: int = -1          # real pid is inside the container
        self.returncode: int | None = None

    def poll(self) -> int | None:
        return self.returncode

    def terminate(self) -> None:
        from roscode import container
        container.kill_background(self._cmd_str)
        self.returncode = 0

    def kill(self) -> None:
        self.terminate()

    def wait(self, timeout: float | None = None) -> int:
        return self.returncode or 0


def _popen(cmd: list[str]) -> subprocess.Popen | _ContainerNode:
    """Dependency-injection seam for tests — override via monkeypatch.

    In container mode, spawns the process inside the container and returns
    a ``_ContainerNode`` handle that supports the same interface as Popen.
    """
    from roscode import container
    if container.is_needed():
        container.spawn_background(cmd)
        return _ContainerNode(cmd)
    return subprocess.Popen(
        cmd,
        stdin=subprocess.DEVNULL,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )


_SPAWNED: dict[str, subprocess.Popen | _ContainerNode] = {}


def node_spawn(package: str, executable: str, node_name: str | None = None) -> str:
    """Spawn a node in the background via `ros2 run`. DESTRUCTIVE."""
    name = node_name or executable
    existing = _SPAWNED.get(name)
    if existing is not None and existing.poll() is None:
        return f"Error: node {name!r} is already running (pid {existing.pid})"

    try:
        proc = _popen(["ros2", "run", package, executable])
    except FileNotFoundError:
        return "Error: ros2 not found on PATH (have you sourced /opt/ros/humble/setup.bash?)"

    _SPAWNED[name] = proc
    pid_str = str(proc.pid) if proc.pid != -1 else "inside container"
    return f"Spawned {name} (pid {pid_str})"


def node_kill(node_name: str) -> str:
    """Send SIGTERM to a previously-spawned node. DESTRUCTIVE."""
    proc = _SPAWNED.get(node_name)
    if proc is None:
        return f"Error: node {node_name!r} was not spawned by roscode"

    if proc.poll() is not None:
        _SPAWNED.pop(node_name, None)
        return f"Node {node_name} had already exited (rc {proc.returncode})"

    proc.terminate()
    try:
        proc.wait(timeout=5)
    except subprocess.TimeoutExpired:
        proc.kill()
        try:
            proc.wait(timeout=2)
        except subprocess.TimeoutExpired:
            return f"Error: could not kill {node_name} (pid {proc.pid})"

    _SPAWNED.pop(node_name, None)
    return f"Killed {node_name}"


def ros_launch(package: str, launch_file: str, args: list[str] | None = None) -> str:
    """Run a ROS 2 launch file in the background. DESTRUCTIVE."""
    key = f"{package}/{launch_file}"
    existing = _SPAWNED.get(key)
    if existing is not None and existing.poll() is None:
        return f"Error: launch {key!r} is already running"

    cmd = ["ros2", "launch", package, launch_file] + (args or [])
    try:
        proc = _popen(cmd)
    except FileNotFoundError:
        return "Error: ros2 not found on PATH (have you sourced /opt/ros/humble/setup.bash?)"

    _SPAWNED[key] = proc
    pid_str = str(proc.pid) if proc.pid != -1 else "inside container"
    return f"Launched {key} (pid {pid_str})"


_PACKAGE_XML = """<?xml version="1.0"?>
<?xml-model href="http://download.ros.org/schema/package_format3.xsd" schematypens="http://www.w3.org/2001/XMLSchema"?>
<package format="3">
  <name>{pkg}</name>
  <version>0.0.0</version>
  <description>{description}</description>
  <maintainer email="noreply@example.com">roscode agent</maintainer>
  <license>MIT</license>
  <depend>rclpy</depend>
  <test_depend>ament_copyright</test_depend>
  <test_depend>ament_flake8</test_depend>
  <test_depend>ament_pep257</test_depend>
  <test_depend>python3-pytest</test_depend>
  <export>
    <build_type>ament_python</build_type>
  </export>
</package>
"""

_SETUP_PY = """from setuptools import find_packages, setup

package_name = '{pkg}'

setup(
    name=package_name,
    version='0.0.0',
    packages=find_packages(exclude=['test']),
    data_files=[
        ('share/ament_index/resource_index/packages',
            ['resource/' + package_name]),
        ('share/' + package_name, ['package.xml']),
    ],
    install_requires=['setuptools'],
    zip_safe=True,
    maintainer='roscode agent',
    maintainer_email='noreply@example.com',
    description='{description}',
    license='MIT',
    tests_require=['pytest'],
    entry_points={{
        'console_scripts': [
            '{node} = {pkg}.{node}:main',
        ],
    }},
)
"""

_SETUP_CFG = """[develop]
script_dir=$base/lib/{pkg}
[install]
install_scripts=$base/lib/{pkg}
"""

_NODE_TEMPLATE = '''"""{description}"""

import rclpy
from rclpy.node import Node


class {cls}(Node):
    def __init__(self) -> None:
        super().__init__('{node}')
        self.get_logger().info('{node} started')


def main(args=None) -> None:
    rclpy.init(args=args)
    node = {cls}()
    try:
        rclpy.spin(node)
    except KeyboardInterrupt:
        pass
    finally:
        node.destroy_node()
        rclpy.shutdown()


if __name__ == '__main__':
    main()
'''


def _to_class_name(snake: str) -> str:
    return "".join(part.capitalize() or "_" for part in snake.split("_"))


def package_scaffold(package_name: str, node_name: str, description: str) -> str:
    """Create a minimal ament_python ROS 2 package. DESTRUCTIVE."""
    if not package_name.isidentifier():
        return f"Error: package_name {package_name!r} is not a valid Python identifier"
    if not node_name.isidentifier():
        return f"Error: node_name {node_name!r} is not a valid Python identifier"

    workspace = get_workspace()
    src = workspace / "src"
    if not src.exists():
        return f"Error: No src/ directory under {workspace.as_posix()}"

    pkg_root = src / package_name
    if pkg_root.exists():
        return f"Error: Package directory already exists: {pkg_root.as_posix()}"

    cls = _to_class_name(node_name)
    created: list[str] = []

    def _write(relpath: str, body: str) -> None:
        target = pkg_root / relpath
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(body, encoding="utf-8")
        created.append(target.relative_to(workspace).as_posix())

    _write("package.xml", _PACKAGE_XML.format(pkg=package_name, description=description))
    # setup.py uses .format so {pkg}/{node} substitute; the literal `{{` are
    # doubled once in the template, then once more here, for final single `{`.
    _write(
        "setup.py",
        _SETUP_PY.format(pkg=package_name, node=node_name, description=description),
    )
    _write("setup.cfg", _SETUP_CFG.format(pkg=package_name))
    _write(f"resource/{package_name}", "")
    _write(f"{package_name}/__init__.py", "")
    _write(
        f"{package_name}/{node_name}.py",
        _NODE_TEMPLATE.format(cls=cls, node=node_name, description=description),
    )

    listing = "\n".join(f"  {p}" for p in created)
    return f"Scaffolded package {package_name!r}:\n{listing}"


SCHEMAS: list[dict[str, Any]] = [
    {
        "name": "write_source_file",
        "description": (
            "Write new contents to a source file inside the workspace. DESTRUCTIVE — "
            "the user is shown a unified diff and must confirm before the write happens. "
            "The target must resolve inside the workspace; anything outside is rejected."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "file_path": {
                    "type": "string",
                    "description": "Path inside the workspace (relative or absolute).",
                },
                "content": {
                    "type": "string",
                    "description": "Full new file contents (not a patch).",
                },
            },
            "required": ["file_path", "content"],
        },
    },
    {
        "name": "workspace_build",
        "description": (
            "Run `colcon build --symlink-install` against the workspace, optionally "
            "restricted to a single package. DESTRUCTIVE because it mutates build/, "
            "install/, log/. Returns the last ~30 lines of colcon output plus a "
            "'Build succeeded' or 'Build FAILED' marker. Has a 120-second timeout."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "package": {
                    "type": "string",
                    "description": "Optional package name. Omit to build the whole workspace.",
                },
            },
        },
    },
    {
        "name": "node_spawn",
        "description": (
            "Spawn a ROS 2 node in the background via `ros2 run {package} {executable}`. "
            "DESTRUCTIVE. The pid is tracked so node_kill can stop it later. Use this "
            "after a successful build to bring a new or rebuilt node online."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "package": {"type": "string", "description": "Package name."},
                "executable": {
                    "type": "string",
                    "description": "Executable/entry-point name from setup.py.",
                },
                "node_name": {
                    "type": "string",
                    "description": "Optional node name; defaults to the executable name.",
                },
            },
            "required": ["package", "executable"],
        },
    },
    {
        "name": "node_kill",
        "description": (
            "Send SIGTERM to a previously-spawned node and wait for it to exit. "
            "DESTRUCTIVE. Use this before respawning after a rebuild."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "node_name": {
                    "type": "string",
                    "description": "Node name you passed to node_spawn.",
                },
            },
            "required": ["node_name"],
        },
    },
    {
        "name": "package_scaffold",
        "description": (
            "Create a new empty ROS 2 Python (ament_python) package under src/ with "
            "one node stub. DESTRUCTIVE because it creates files on disk. Use this "
            "when the user asks you to add a new node and no suitable package exists."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "package_name": {
                    "type": "string",
                    "description": "Package name, e.g. 'safety_stop'. Must be a valid Python identifier.",
                },
                "node_name": {
                    "type": "string",
                    "description": "Node/executable stub to create, e.g. 'safety_node'.",
                },
                "description": {
                    "type": "string",
                    "description": "One-line description that goes into package.xml.",
                },
            },
            "required": ["package_name", "node_name", "description"],
        },
    },
    {
        "name": "ros_launch",
        "description": (
            "Run a ROS 2 launch file in the background via `ros2 launch`. DESTRUCTIVE — "
            "starts one or more nodes and changes the live graph. Use this to bring up a "
            "full robot stack, sensor suite, or any launch-file-based system. The process "
            "is tracked so node_kill can stop it later (use the '<package>/<launch_file>' key)."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "package": {
                    "type": "string",
                    "description": "Package that contains the launch file.",
                },
                "launch_file": {
                    "type": "string",
                    "description": "Launch file name, e.g. 'robot.launch.py' or 'bringup.launch.xml'.",
                },
                "args": {
                    "type": "array",
                    "items": {"type": "string"},
                    "description": "Optional launch arguments, e.g. ['use_sim_time:=true', 'robot_name:=r1'].",
                },
            },
            "required": ["package", "launch_file"],
        },
    },
]

TOOLS = {
    "write_source_file": write_source_file,
    "workspace_build": workspace_build,
    "node_spawn": node_spawn,
    "node_kill": node_kill,
    "package_scaffold": package_scaffold,
    "ros_launch": ros_launch,
}
