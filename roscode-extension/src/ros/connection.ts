import { EventEmitter } from "events";
import { execFile, spawn, ChildProcess } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

export interface RobotInfo {
  ip: string;
  hostname: string;
  rosVersion: "ros1" | "ros2";
  masterPort?: number;
  domainId?: number;
  topics?: string[];
  nodes?: string[];
}

export type ConnectionStatus = "disconnected" | "connecting" | "connected" | "error";

export class RosConnection extends EventEmitter {
  private _status: ConnectionStatus = "disconnected";
  private _robot: RobotInfo | null = null;
  private _processes: ChildProcess[] = [];
  private _env: NodeJS.ProcessEnv = { ...process.env };

  get status(): ConnectionStatus { return this._status; }
  get connectedHost(): string { return this._robot?.hostname ?? this._robot?.ip ?? ""; }
  get robot(): RobotInfo | null { return this._robot; }

  onStatusChange(cb: (s: ConnectionStatus) => void) {
    this.on("statusChange", cb);
  }

  private setStatus(s: ConnectionStatus) {
    this._status = s;
    this.emit("statusChange", s);
  }

  async connect(robot: RobotInfo): Promise<void> {
    this.setStatus("connecting");
    this._robot = robot;

    if (robot.rosVersion === "ros1") {
      this._env["ROS_MASTER_URI"] = `http://${robot.ip}:${robot.masterPort ?? 11311}`;
      this._env["ROS_IP"] = await getLocalIp();
    } else {
      this._env["ROS_DOMAIN_ID"] = String(robot.domainId ?? 0);
    }

    // Verify connection by listing topics
    try {
      await this.listTopics();
      this.setStatus("connected");
    } catch {
      this.setStatus("error");
      throw new Error(`Cannot reach ROS master at ${robot.ip}`);
    }
  }

  disconnect() {
    this._robot = null;
    this._env = { ...process.env };
    this._processes.forEach((p) => p.kill());
    this._processes = [];
    this.setStatus("disconnected");
  }

  async listTopics(): Promise<Array<{ name: string; type: string }>> {
    if (!this._robot) return [];
    try {
      if (this._robot.rosVersion === "ros1") {
        const { stdout } = await execFileAsync("rostopic", ["list", "-v"], {
          env: this._env,
          timeout: 5000,
        });
        return parseRos1TopicList(stdout);
      } else {
        const { stdout } = await execFileAsync("ros2", ["topic", "list", "-t"], {
          env: this._env,
          timeout: 5000,
        });
        return parseRos2TopicList(stdout);
      }
    } catch {
      return [];
    }
  }

  async listNodes(): Promise<string[]> {
    if (!this._robot) return [];
    try {
      if (this._robot.rosVersion === "ros1") {
        const { stdout } = await execFileAsync("rosnode", ["list"], {
          env: this._env,
          timeout: 5000,
        });
        return stdout.trim().split("\n").filter(Boolean);
      } else {
        const { stdout } = await execFileAsync("ros2", ["node", "list"], {
          env: this._env,
          timeout: 5000,
        });
        return stdout.trim().split("\n").filter(Boolean);
      }
    } catch {
      return [];
    }
  }

  async getGraphData(): Promise<{ nodes: GraphNode[]; edges: GraphEdge[] }> {
    if (!this._robot) return { nodes: [], edges: [] };
    try {
      if (this._robot.rosVersion === "ros2") {
        const { stdout } = await execFileAsync(
          "ros2", ["node", "list"],
          { env: this._env, timeout: 5000 }
        );
        const nodeNames = stdout.trim().split("\n").filter(Boolean);
        const nodes: GraphNode[] = [];
        const edges: GraphEdge[] = [];
        const topicSet = new Set<string>();

        for (const nodeName of nodeNames.slice(0, 20)) {
          nodes.push({ id: nodeName, kind: "node", label: nodeName.split("/").pop()! });
          try {
            const { stdout: info } = await execFileAsync(
              "ros2", ["node", "info", nodeName],
              { env: this._env, timeout: 3000 }
            );
            const pubs = parseRos2NodeInfo(info, "Publishers");
            const subs = parseRos2NodeInfo(info, "Subscribers");
            for (const t of pubs) {
              if (!topicSet.has(t)) { topicSet.add(t); nodes.push({ id: t, kind: "topic", label: t.split("/").pop()! }); }
              edges.push({ source: nodeName, target: t });
            }
            for (const t of subs) {
              if (!topicSet.has(t)) { topicSet.add(t); nodes.push({ id: t, kind: "topic", label: t.split("/").pop()! }); }
              edges.push({ source: t, target: nodeName });
            }
          } catch {}
        }
        return { nodes, edges };
      }
      return { nodes: [], edges: [] };
    } catch {
      return { nodes: [], edges: [] };
    }
  }

  echoTopic(topicName: string, onData: (data: string) => void): () => void {
    const cmd = this._robot?.rosVersion === "ros1" ? "rostopic" : "ros2";
    const args = this._robot?.rosVersion === "ros1"
      ? ["echo", topicName]
      : ["topic", "echo", "--once", "--no-arr", topicName];

    const proc = spawn(cmd, args, { env: this._env });
    this._processes.push(proc);

    proc.stdout.on("data", (d) => onData(d.toString()));

    return () => {
      proc.kill();
      this._processes = this._processes.filter((p) => p !== proc);
    };
  }

  async listParams(nodeName?: string): Promise<Array<{node: string; param: string}>> {
    if (!this._robot || this._robot.rosVersion !== "ros2") return [];
    try {
      const args = nodeName ? ["param", "list", nodeName] : ["param", "list"];
      const { stdout } = await execFileAsync("ros2", args, { env: this._env, timeout: 8000 });
      const results: Array<{node: string; param: string}> = [];
      let cur = nodeName ?? "";
      for (const line of stdout.split("\n")) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        if (line.startsWith("/") && line.endsWith(":")) { cur = line.slice(0, -1); continue; }
        if (trimmed && cur) results.push({ node: cur, param: trimmed });
      }
      return results;
    } catch { return []; }
  }

  async getParam(nodeName: string, paramName: string): Promise<string> {
    if (!this._robot || this._robot.rosVersion !== "ros2") return "Not connected";
    try {
      const { stdout } = await execFileAsync("ros2", ["param", "get", nodeName, paramName],
        { env: this._env, timeout: 5000 });
      return stdout.trim();
    } catch (e: any) { return `Error: ${e.message}`; }
  }

  async setParam(nodeName: string, paramName: string, value: string): Promise<string> {
    if (!this._robot || this._robot.rosVersion !== "ros2") return "Not connected";
    try {
      const { stdout } = await execFileAsync("ros2", ["param", "set", nodeName, paramName, value],
        { env: this._env, timeout: 5000 });
      return stdout.trim() || "Parameter set successfully";
    } catch (e: any) { return `Error: ${e.message}`; }
  }

  async echoTopicOnce(topicName: string): Promise<string> {
    if (!this._robot) return "";
    try {
      const cmd = this._robot.rosVersion === "ros1" ? "rostopic" : "ros2";
      const args = this._robot.rosVersion === "ros1"
        ? ["echo", "-n", "1", topicName]
        : ["topic", "echo", "--once", topicName];
      const { stdout } = await execFileAsync(cmd, args, { env: this._env, timeout: 8000 });
      return stdout.trim();
    } catch (e: any) { return `Error: ${e.message}`; }
  }

  async runLaunchFile(filePath: string): Promise<void> {
    const isRos2Launch = filePath.endsWith(".py") || filePath.endsWith(".yaml");
    const cmd = isRos2Launch ? "ros2" : "roslaunch";
    const args = isRos2Launch ? ["launch", filePath] : [filePath];
    const proc = spawn(cmd, args, { env: this._env, detached: false });
    this._processes.push(proc);
    proc.on("exit", () => {
      this._processes = this._processes.filter((p) => p !== proc);
    });
  }
}

export interface GraphNode { id: string; kind: "node" | "topic"; label: string; }
export interface GraphEdge { source: string; target: string; }

async function getLocalIp(): Promise<string> {
  const { stdout } = await execFileAsync("ipconfig", ["getifaddr", "en0"]).catch(
    () => execFileAsync("hostname", ["-I"])
  );
  return stdout.trim().split(" ")[0];
}

function parseRos1TopicList(output: string): Array<{ name: string; type: string }> {
  const results: Array<{ name: string; type: string }> = [];
  for (const line of output.split("\n")) {
    const m = line.match(/^\s*(\S+)\s+\[(\S+)\]/);
    if (m) results.push({ name: m[1], type: m[2] });
  }
  return results;
}

function parseRos2TopicList(output: string): Array<{ name: string; type: string }> {
  return output
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const [name, type] = line.split("\t");
      return { name: name?.trim() ?? line, type: type?.trim() ?? "" };
    });
}

function parseRos2NodeInfo(info: string, section: string): string[] {
  const results: string[] = [];
  let inSection = false;
  for (const line of info.split("\n")) {
    if (line.includes(section + ":")) { inSection = true; continue; }
    if (inSection) {
      if (line.match(/^\s{4}\S/) ) {
        const topic = line.trim().split(":")[0];
        if (topic.startsWith("/")) results.push(topic);
      } else if (line.match(/^\S/) || line.match(/^\s{0,2}\S/)) {
        inSection = false;
      }
    }
  }
  return results;
}
