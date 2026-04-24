import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";

export type RobotType = "diff-drive" | "empty" | "ackermann" | "manipulator";

export async function scaffoldProject(projectName: string, robotType: RobotType, parentDir?: string): Promise<void> {
  let parentFsPath = parentDir;
  if (!parentFsPath) {
    const parentUris = await vscode.window.showOpenDialog({
      canSelectFolders: true,
      canSelectFiles: false,
      canSelectMany: false,
      openLabel: "Create project here",
      title: "Choose a parent folder for your roscode project",
    });
    if (!parentUris || parentUris.length === 0) return;
    parentFsPath = parentUris[0].fsPath;
  }

  const pkg = toPkgName(projectName);
  const projectDir = path.join(parentFsPath, projectName);

  if (fs.existsSync(projectDir)) {
    const choice = await vscode.window.showWarningMessage(
      `Folder "${projectName}" already exists.`,
      { modal: true },
      "Overwrite"
    );
    if (choice !== "Overwrite") return;
  }

  try {
    writeWorkspace(projectDir, pkg, projectName, robotType);
  } catch (e: any) {
    vscode.window.showErrorMessage(`Scaffold failed: ${e.message}`);
    return;
  }

  await vscode.commands.executeCommand("vscode.openFolder", vscode.Uri.file(projectDir));
}

// ── helpers ──────────────────────────────────────────────────────────────────

function toPkgName(name: string): string {
  const s = name.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^[0-9]/, "p$&").replace(/_$/, "");
  return s || "my_robot";
}

function writeWorkspace(dir: string, pkg: string, displayName: string, robotType: RobotType): void {
  fs.mkdirSync(path.join(dir, ".roscode"), { recursive: true });
  fs.mkdirSync(path.join(dir, "src", pkg), { recursive: true });
  fs.mkdirSync(path.join(dir, "src", pkg, pkg), { recursive: true });
  fs.mkdirSync(path.join(dir, "src", pkg, "launch"), { recursive: true });
  fs.mkdirSync(path.join(dir, "src", pkg, "resource"), { recursive: true });

  fs.mkdirSync(path.join(dir, "runtime"), { recursive: true });

  // .roscode/config.json
  write(path.join(dir, ".roscode", "config.json"), JSON.stringify({
    name: displayName,
    package: pkg,
    robotType,
    rclpyVersion: "humble",
    created: new Date().toISOString(),
  }, null, 2));

  // Package manifest + build files
  write(path.join(dir, "src", pkg, "package.xml"), packageXml(pkg));
  write(path.join(dir, "src", pkg, "setup.py"), setupPy(pkg));
  write(path.join(dir, "src", pkg, "setup.cfg"), setupCfg(pkg));
  write(path.join(dir, "src", pkg, pkg, "__init__.py"), "");
  write(path.join(dir, "src", pkg, "resource", pkg), "");
  write(path.join(dir, "src", pkg, "launch", "launch.py"), launchPy(pkg));

  write(path.join(dir, "runtime", "docker-compose.yml"), dockerCompose(pkg));

  // Main node — content depends on robot type
  const nodeContent =
    robotType === "diff-drive" ? diffDriveNode(pkg) :
    robotType === "ackermann"  ? ackermannNode(pkg) :
    robotType === "manipulator"? manipulatorNode(pkg) :
    emptyNode(pkg);

  write(path.join(dir, "src", pkg, pkg, `${pkg}_node.py`), nodeContent);
}

function write(p: string, content: string): void {
  fs.writeFileSync(p, content, "utf8");
}

// ── templates ────────────────────────────────────────────────────────────────

function packageXml(pkg: string): string {
  const deps = pkg.includes("diff") || pkg.includes("drive")
    ? "<exec_depend>geometry_msgs</exec_depend>\n  <exec_depend>nav_msgs</exec_depend>\n  <exec_depend>sensor_msgs</exec_depend>"
    : "<exec_depend>std_msgs</exec_depend>";
  return `<?xml version="1.0"?>
<?xml-model href="http://download.ros.org/schema/package_format3.xsd" schematypens="http://www.w3.org/2001/XMLSchema"?>
<package format="3">
  <name>${pkg}</name>
  <version>0.0.1</version>
  <description>ROS 2 package — created with roscode studio</description>
  <maintainer email="user@example.com">Developer</maintainer>
  <license>Apache-2.0</license>
  <exec_depend>rclpy</exec_depend>
  ${deps}
  <buildtool_depend>ament_python</buildtool_depend>
  <test_depend>ament_copyright</test_depend>
  <test_depend>ament_flake8</test_depend>
  <test_depend>ament_pep257</test_depend>
  <export>
    <build_type>ament_python</build_type>
  </export>
</package>
`;
}

function setupPy(pkg: string): string {
  return `from setuptools import setup

setup(
    name='${pkg}',
    version='0.0.1',
    packages=['${pkg}'],
    data_files=[
        ('share/ament_index/resource_index/packages', ['resource/${pkg}']),
        ('share/${pkg}', ['package.xml']),
        ('share/${pkg}/launch', ['launch/launch.py']),
    ],
    install_requires=['setuptools'],
    zip_safe=True,
    maintainer='Developer',
    maintainer_email='user@example.com',
    description='ROS 2 package created with roscode studio',
    license='Apache-2.0',
    entry_points={
        'console_scripts': [
            '${pkg}_node = ${pkg}.${pkg}_node:main',
        ],
    },
)
`;
}

function setupCfg(pkg: string): string {
  return `[develop]
script_dir=$base/lib/${pkg}
[install]
install_scripts=$base/lib/${pkg}
`;
}

function launchPy(pkg: string): string {
  return `from launch import LaunchDescription
from launch_ros.actions import Node


def generate_launch_description():
    return LaunchDescription([
        Node(
            package='${pkg}',
            executable='${pkg}_node',
            name='${pkg}',
            output='screen',
            parameters=[],
        ),
    ])
`;
}

function diffDriveNode(pkg: string): string {
  return `import math
import rclpy
from rclpy.node import Node
from geometry_msgs.msg import Twist
from nav_msgs.msg import Odometry


class DiffDriveController(Node):
    """Minimal differential-drive odometry node.

    Subscribes to /cmd_vel and integrates velocity to publish /odom.
    Replace the kinematics in cmd_cb with your actual encoder readings.
    """

    def __init__(self):
        super().__init__('${pkg}')
        self.sub = self.create_subscription(Twist, '/cmd_vel', self._cmd_cb, 10)
        self.pub = self.create_publisher(Odometry, '/odom', 10)

        # Wheel geometry — tune these for your robot
        self.declare_parameter('wheel_base', 0.3)          # metres
        self.declare_parameter('publish_rate', 10.0)       # Hz

        self._x = 0.0
        self._y = 0.0
        self._theta = 0.0
        self._vx = 0.0
        self._wz = 0.0

        rate = self.get_parameter('publish_rate').value
        self._dt = 1.0 / rate
        self.create_timer(self._dt, self._publish_odom)
        self.get_logger().info('${pkg} started — listening on /cmd_vel')

    def _cmd_cb(self, msg: Twist):
        self._vx = msg.linear.x
        self._wz = msg.angular.z
        # Integrate position
        self._x     += self._vx * math.cos(self._theta) * self._dt
        self._y     += self._vx * math.sin(self._theta) * self._dt
        self._theta += self._wz * self._dt

    def _publish_odom(self):
        odom = Odometry()
        odom.header.stamp = self.get_clock().now().to_msg()
        odom.header.frame_id = 'odom'
        odom.child_frame_id = 'base_link'
        odom.pose.pose.position.x = self._x
        odom.pose.pose.position.y = self._y
        # Yaw → quaternion (z-axis rotation only)
        odom.pose.pose.orientation.z = math.sin(self._theta / 2.0)
        odom.pose.pose.orientation.w = math.cos(self._theta / 2.0)
        odom.twist.twist.linear.x  = self._vx
        odom.twist.twist.angular.z = self._wz
        self.pub.publish(odom)


def main(args=None):
    rclpy.init(args=args)
    node = DiffDriveController()
    rclpy.spin(node)
    node.destroy_node()
    rclpy.shutdown()
`;
}

function emptyNode(pkg: string): string {
  return `import rclpy
from rclpy.node import Node
from std_msgs.msg import String


class ${toCamel(pkg)}(Node):
    def __init__(self):
        super().__init__('${pkg}')
        self.pub = self.create_publisher(String, '/${pkg}/hello', 10)
        self.create_timer(1.0, self._tick)
        self.get_logger().info('${pkg} started')

    def _tick(self):
        msg = String()
        msg.data = 'hello from ${pkg}'
        self.pub.publish(msg)


def main(args=None):
    rclpy.init(args=args)
    node = ${toCamel(pkg)}()
    rclpy.spin(node)
    node.destroy_node()
    rclpy.shutdown()
`;
}

function ackermannNode(pkg: string): string {
  return `# Ackermann steering template — implement your steering geometry here
import rclpy
from rclpy.node import Node
from std_msgs.msg import String


class ${toCamel(pkg)}(Node):
    def __init__(self):
        super().__init__('${pkg}')
        self.get_logger().info('${pkg} (ackermann) started — implement steering geometry')

    # TODO: subscribe to /ackermann_cmd (ackermann_msgs/AckermannDrive)
    # TODO: publish /cmd_vel (geometry_msgs/Twist) or motor commands


def main(args=None):
    rclpy.init(args=args)
    node = ${toCamel(pkg)}()
    rclpy.spin(node)
    node.destroy_node()
    rclpy.shutdown()
`;
}

function manipulatorNode(pkg: string): string {
  return `# Manipulator template — implement your joint control here
import rclpy
from rclpy.node import Node
from sensor_msgs.msg import JointState


class ${toCamel(pkg)}(Node):
    def __init__(self):
        super().__init__('${pkg}')
        self.pub = self.create_publisher(JointState, '/joint_states', 10)
        self.get_logger().info('${pkg} (manipulator) started — implement joint control')

    # TODO: subscribe to trajectory or goal topics
    # TODO: publish joint states at your control rate


def main(args=None):
    rclpy.init(args=args)
    node = ${toCamel(pkg)}()
    rclpy.spin(node)
    node.destroy_node()
    rclpy.shutdown()
`;
}

function dockerCompose(pkg: string): string {
  return `# roscode runtime — ROS 2 Humble in Docker
# Usage: docker compose up -d   (roscode "Start ROS" button does this automatically)
services:
  ros:
    image: ros:humble
    network_mode: host
    environment:
      - ROS_DOMAIN_ID=0
    volumes:
      - ../src:/workspace/src:ro
      - ros-logs:/root/.ros
    working_dir: /workspace
    command: >
      bash -c "
        source /opt/ros/humble/setup.bash &&
        colcon build --symlink-install 2>&1 | tail -5 &&
        source install/setup.bash &&
        ros2 daemon start &&
        echo 'ROS 2 ready — domain 0' &&
        tail -f /dev/null
      "
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "bash", "-c", "source /opt/ros/humble/setup.bash && ros2 topic list"]
      interval: 5s
      timeout: 5s
      retries: 6
      start_period: 20s

volumes:
  ros-logs:
`;
}

function toCamel(pkg: string): string {
  return pkg.split("_").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join("");
}
