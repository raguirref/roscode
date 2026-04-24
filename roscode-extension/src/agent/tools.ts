import * as fs from "fs";
import * as path from "path";
import { execFile, exec } from "child_process";
import { promisify } from "util";
import type { RosConnection } from "../ros/connection";
import type Anthropic from "@anthropic-ai/sdk";

const execAsync = promisify(exec);
const execFileAsync = promisify(execFile);

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

      default:
        return `Unknown tool: ${name}`;
    }
  } catch (e: any) {
    return `Error: ${e.message ?? String(e)}`;
  }
}

function sanitizePath(inputPath: string, workspacePath: string): string | null {
  if (!workspacePath) return null;
  const resolved = path.resolve(workspacePath, inputPath);
  return resolved.startsWith(workspacePath) ? resolved : null;
}
