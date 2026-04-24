import * as fs from "fs";
import * as path from "path";
import { execFile, exec } from "child_process";
import { promisify } from "util";
import type { RosConnection } from "../ros/connection";
import type Anthropic from "@anthropic-ai/sdk";

const execAsync = promisify(exec);
const execFileAsync = promisify(execFile);

export interface ToolDisplay {
  label: string;
  icon: "pulse" | "graph" | "file" | "terminal" | "build" | "radio" | "default";
}

export function toolDisplayMeta(name: string): ToolDisplay {
  switch (name) {
    case "list_topics":      return { label: "List topics",       icon: "pulse" };
    case "echo_topic":       return { label: "Echo topic",        icon: "radio" };
    case "topic_hz":         return { label: "Topic Hz",          icon: "pulse" };
    case "list_nodes":       return { label: "List nodes",        icon: "graph" };
    case "get_node_graph":   return { label: "Inspect graph",     icon: "graph" };
    case "param_get":        return { label: "Get parameter",     icon: "file" };
    case "param_set":        return { label: "Set parameter",     icon: "terminal" };
    case "service_call":     return { label: "Call service",      icon: "radio" };
    case "read_file":        return { label: "Read file",         icon: "file" };
    case "write_file":       return { label: "Write file",        icon: "file" };
    case "package_scaffold": return { label: "Scaffold package",  icon: "build" };
    case "shell":            return { label: "Run shell",         icon: "terminal" };
    case "colcon_build":     return { label: "colcon build",      icon: "build" };
    default:                 return { label: name,                icon: "default" };
  }
}

export function getAgentTools(): Anthropic.Tool[] {
  return [
    {
      name: "list_topics",
      description: "List all active ROS topics with their message types.",
      input_schema: { type: "object", properties: {}, required: [] },
    },
    {
      name: "echo_topic",
      description: "Get the latest message from a ROS topic (one message).",
      input_schema: {
        type: "object",
        properties: { topic: { type: "string", description: "Topic name e.g. /cmd_vel" } },
        required: ["topic"],
      },
    },
    {
      name: "list_nodes",
      description: "List all running ROS nodes.",
      input_schema: { type: "object", properties: {}, required: [] },
    },
    {
      name: "read_file",
      description: "Read a source file from the workspace.",
      input_schema: {
        type: "object",
        properties: { path: { type: "string", description: "Relative path inside workspace" } },
        required: ["path"],
      },
    },
    {
      name: "write_file",
      description: "Write or overwrite a source file in the workspace.",
      input_schema: {
        type: "object",
        properties: {
          path: { type: "string" },
          content: { type: "string" },
        },
        required: ["path", "content"],
      },
    },
    {
      name: "shell",
      description: "Run a shell command in the workspace directory. Avoid long-running commands.",
      input_schema: {
        type: "object",
        properties: { command: { type: "string" } },
        required: ["command"],
      },
    },
    {
      name: "colcon_build",
      description: "Build the ROS 2 workspace with colcon. Pass optional package name to build only that package.",
      input_schema: {
        type: "object",
        properties: { package: { type: "string", description: "Optional package name" } },
        required: [],
      },
    },
    {
      name: "get_node_graph",
      description: "Get the ROS node/topic graph showing publisher/subscriber relationships.",
      input_schema: { type: "object", properties: {}, required: [] },
    },
    {
      name: "topic_hz",
      description: "Measure the publish rate (Hz) of a ROS topic over ~3 seconds.",
      input_schema: {
        type: "object",
        properties: { topic: { type: "string", description: "Topic name e.g. /scan" } },
        required: ["topic"],
      },
    },
    {
      name: "param_get",
      description: "Get a parameter value from a running ROS 2 node.",
      input_schema: {
        type: "object",
        properties: {
          node: { type: "string", description: "Node name e.g. /odometry_node" },
          param: { type: "string", description: "Parameter name e.g. yaw_bias" },
        },
        required: ["node", "param"],
      },
    },
    {
      name: "param_set",
      description: "Set a parameter on a running ROS 2 node. DESTRUCTIVE — requires confirmation.",
      input_schema: {
        type: "object",
        properties: {
          node:  { type: "string", description: "Node name e.g. /odometry_node" },
          param: { type: "string", description: "Parameter name" },
          value: { type: "string", description: "New value (string representation)" },
        },
        required: ["node", "param", "value"],
      },
    },
    {
      name: "service_call",
      description: "Call a ROS 2 service once and return the response.",
      input_schema: {
        type: "object",
        properties: {
          service:     { type: "string", description: "Service name e.g. /reset_odom" },
          service_type:{ type: "string", description: "Service type e.g. std_srvs/srv/Trigger" },
          args:        { type: "string", description: "Request args as YAML string e.g. '{}'" },
        },
        required: ["service", "service_type"],
      },
    },
    {
      name: "package_scaffold",
      description: "Scaffold a new ament_python ROS 2 package in workspace/src/. DESTRUCTIVE — requires confirmation.",
      input_schema: {
        type: "object",
        properties: {
          package_name: { type: "string", description: "Snake_case package name" },
          description:  { type: "string", description: "One-line package description" },
        },
        required: ["package_name"],
      },
    },
  ];
}

export async function dispatchTool(
  name: string,
  input: Record<string, unknown>,
  ros: RosConnection,
  workspacePath: string
): Promise<string> {
  try {
    switch (name) {
      case "list_topics": {
        const topics = await ros.listTopics();
        if (topics.length === 0) return "No topics found (is ROS running and connected?)";
        return topics.map((t) => `${t.name}  [${t.type}]`).join("\n");
      }

      case "echo_topic": {
        const topicName = String(input.topic);
        return await new Promise((resolve) => {
          let data = "";
          const stop = ros.echoTopic(topicName, (chunk) => { data += chunk; });
          setTimeout(() => { stop(); resolve(data.slice(0, 1000) || "(no data)"); }, 2000);
        });
      }

      case "list_nodes": {
        const nodes = await ros.listNodes();
        return nodes.length ? nodes.join("\n") : "No nodes found";
      }

      case "read_file": {
        const filePath = sanitizePath(String(input.path), workspacePath);
        if (!filePath) return "Error: path outside workspace";
        return fs.existsSync(filePath)
          ? fs.readFileSync(filePath, "utf8").slice(0, 8000)
          : "File not found";
      }

      case "write_file": {
        const filePath = sanitizePath(String(input.path), workspacePath);
        if (!filePath) return "Error: path outside workspace";
        fs.mkdirSync(path.dirname(filePath), { recursive: true });
        fs.writeFileSync(filePath, String(input.content), "utf8");
        return `Written ${filePath}`;
      }

      case "shell": {
        const { stdout, stderr } = await execAsync(String(input.command), {
          cwd: workspacePath || process.cwd(),
          timeout: 30_000,
        });
        return (stdout + stderr).slice(0, 3000);
      }

      case "colcon_build": {
        const pkgArg = input.package ? `--packages-select ${input.package}` : "";
        const { stdout, stderr } = await execAsync(
          `colcon build ${pkgArg} --symlink-install`,
          { cwd: workspacePath, timeout: 180_000 }
        );
        return (stdout + stderr).slice(0, 3000);
      }

      case "get_node_graph": {
        const { nodes, edges } = await ros.getGraphData();
        if (nodes.length === 0) return "No graph data (not connected or no nodes running)";
        const summary = nodes.map((n) => {
          const pubs = edges.filter((e) => e.source === n.id).map((e) => e.target);
          const subs = edges.filter((e) => e.target === n.id).map((e) => e.source);
          return `${n.id}\n  publishes: ${pubs.join(", ") || "none"}\n  subscribes: ${subs.join(", ") || "none"}`;
        });
        return summary.join("\n\n");
      }

      case "topic_hz": {
        const topicName = String(input.topic);
        const { stdout, stderr } = await execAsync(
          `timeout 3 ros2 topic hz ${topicName} --window 10`,
          { cwd: workspacePath || process.cwd(), timeout: 5_000 }
        ).catch((e) => ({ stdout: e.stdout || "", stderr: e.stderr || e.message }));
        return (stdout + stderr).trim().slice(0, 1000) || "(no data — is the topic publishing?)";
      }

      case "param_get": {
        const nodeName  = String(input.node);
        const paramName = String(input.param);
        const { stdout, stderr } = await execAsync(
          `ros2 param get ${nodeName} ${paramName}`,
          { cwd: workspacePath || process.cwd(), timeout: 8_000 }
        );
        return (stdout + stderr).trim().slice(0, 1000);
      }

      case "param_set": {
        const nodeName  = String(input.node);
        const paramName = String(input.param);
        const value     = String(input.value);
        const { stdout, stderr } = await execAsync(
          `ros2 param set ${nodeName} ${paramName} ${value}`,
          { cwd: workspacePath || process.cwd(), timeout: 8_000 }
        );
        return (stdout + stderr).trim().slice(0, 1000);
      }

      case "service_call": {
        const svc  = String(input.service);
        const type = String(input.service_type);
        const args = input.args ? String(input.args) : "{}";
        const { stdout, stderr } = await execAsync(
          `ros2 service call ${svc} ${type} '${args}'`,
          { cwd: workspacePath || process.cwd(), timeout: 10_000 }
        );
        return (stdout + stderr).trim().slice(0, 1000);
      }

      case "package_scaffold": {
        const pkgName = String(input.package_name).replace(/[^a-z0-9_]/gi, "_");
        const desc    = String(input.description ?? "ROS 2 package created by roscode agent");
        if (!workspacePath) return "Error: no workspace open";
        const pkgDir  = path.join(workspacePath, "src", pkgName);
        if (fs.existsSync(pkgDir)) return `Error: package "${pkgName}" already exists`;

        fs.mkdirSync(path.join(pkgDir, pkgName),    { recursive: true });
        fs.mkdirSync(path.join(pkgDir, "launch"),   { recursive: true });
        fs.mkdirSync(path.join(pkgDir, "resource"), { recursive: true });

        fs.writeFileSync(path.join(pkgDir, "resource", pkgName), "");
        fs.writeFileSync(path.join(pkgDir, pkgName, "__init__.py"), "");
        fs.writeFileSync(path.join(pkgDir, "package.xml"), scaffoldPackageXml(pkgName, desc));
        fs.writeFileSync(path.join(pkgDir, "setup.py"),    scaffoldSetupPy(pkgName, desc));
        fs.writeFileSync(path.join(pkgDir, "setup.cfg"),   scaffoldSetupCfg(pkgName));
        fs.writeFileSync(path.join(pkgDir, pkgName, `${pkgName}_node.py`), scaffoldNode(pkgName));
        return `Scaffolded package "${pkgName}" at src/${pkgName}/. Run colcon_build to compile.`;
      }

      default:
        return `Unknown tool: ${name}`;
    }
  } catch (e: any) {
    return `Error: ${e.message ?? String(e)}`;
  }
}

function scaffoldPackageXml(pkg: string, desc: string): string {
  return `<?xml version="1.0"?>
<package format="3">
  <name>${pkg}</name>
  <version>0.0.1</version>
  <description>${desc}</description>
  <maintainer email="user@example.com">Developer</maintainer>
  <license>Apache-2.0</license>
  <exec_depend>rclpy</exec_depend>
  <exec_depend>std_msgs</exec_depend>
  <buildtool_depend>ament_python</buildtool_depend>
  <export><build_type>ament_python</build_type></export>
</package>
`;
}

function scaffoldSetupPy(pkg: string, desc: string): string {
  return `from setuptools import setup
setup(
    name='${pkg}', version='0.0.1',
    packages=['${pkg}'],
    data_files=[
        ('share/ament_index/resource_index/packages', ['resource/${pkg}']),
        ('share/${pkg}', ['package.xml']),
    ],
    install_requires=['setuptools'],
    description='${desc}',
    entry_points={'console_scripts': ['${pkg}_node = ${pkg}.${pkg}_node:main']},
)
`;
}

function scaffoldSetupCfg(pkg: string): string {
  return `[develop]\nscript_dir=$base/lib/${pkg}\n[install]\ninstall_scripts=$base/lib/${pkg}\n`;
}

function scaffoldNode(pkg: string): string {
  const cls = pkg.split("_").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join("");
  return `import rclpy
from rclpy.node import Node
from std_msgs.msg import String


class ${cls}(Node):
    def __init__(self):
        super().__init__('${pkg}')
        self.pub = self.create_publisher(String, '/${pkg}/out', 10)
        self.create_timer(1.0, self.tick)
        self.get_logger().info('${pkg} ready')

    def tick(self):
        self.pub.publish(String(data='hello from ${pkg}'))


def main(args=None):
    rclpy.init(args=args)
    node = ${cls}()
    rclpy.spin(node)
    node.destroy_node()
    rclpy.shutdown()
`;
}

function sanitizePath(inputPath: string, workspacePath: string): string | null {
  if (!workspacePath) return null;
  const resolved = path.resolve(workspacePath, inputPath);
  return resolved.startsWith(workspacePath) ? resolved : null;
}
