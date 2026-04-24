import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";
import Anthropic from "@anthropic-ai/sdk";
import type { RosConnection } from "../ros/connection";
import { getAgentTools, dispatchTool, toolDisplayMeta } from "../agent/tools";

const DESTRUCTIVE_TOOLS = new Set(["write_file", "shell", "colcon_build", "param_set", "package_scaffold"]);

// Curated ROS 2 package registry (Fase D)
const REGISTRY = [
  { id:"nav2",              name:"Nav2 Stack",              category:"Navigation",   description:"Complete navigation system. Path planning, costmaps, recovery behaviors, SLAM integration.", repo:"https://github.com/ros-navigation/navigation2",           stars:2400, install:"sudo apt install ros-humble-navigation2",               tags:["navigation","slam","planning"] },
  { id:"moveit2",           name:"MoveIt 2",                category:"Manipulators", description:"Motion planning for robotic arms. Supports 6DOF/7DOF, collision avoidance, trajectory execution.", repo:"https://github.com/moveit/moveit2",                       stars:1800, install:"sudo apt install ros-humble-moveit",                    tags:["manipulation","planning","arm"] },
  { id:"slam_toolbox",      name:"SLAM Toolbox",            category:"Navigation",   description:"2D SLAM for mobile robots. Lifelong mapping, localization, continuous SLAM.", repo:"https://github.com/SteveMacenski/slam_toolbox",          stars:1400, install:"sudo apt install ros-humble-slam-toolbox",              tags:["slam","mapping","localization"] },
  { id:"ros2_control",      name:"ros2_control",            category:"Control",      description:"Real-time control framework. Hardware abstraction, controller manager, diff-drive, joint trajectory.", repo:"https://github.com/ros-controls/ros2_control",            stars:1100, install:"sudo apt install ros-humble-ros2-control",              tags:["control","hardware","real-time"] },
  { id:"cartographer",      name:"Cartographer ROS",        category:"Navigation",   description:"Google's real-time SLAM. 2D and 3D LIDAR, IMU fusion, loop closure.", repo:"https://github.com/cartographer-project/cartographer_ros",stars:1300, install:"sudo apt install ros-humble-cartographer-ros",          tags:["slam","lidar","google"] },
  { id:"micro_ros",         name:"micro-ROS",               category:"Embedded",     description:"ROS 2 for microcontrollers. Arduino, ESP32, STM32. Bridge to full ROS 2 ecosystem.", repo:"https://github.com/micro-ROS/micro_ros_arduino",         stars:1200, install:"pip install micro-ros-agent",                           tags:["microcontroller","arduino","esp32"] },
  { id:"rosbridge",         name:"ROSBridge Suite",         category:"Utilities",    description:"WebSocket bridge between ROS and any client (browser, Unity, Python).", repo:"https://github.com/RobotWebTools/rosbridge_suite",       stars:800,  install:"sudo apt install ros-humble-rosbridge-suite",           tags:["websocket","bridge","web"] },
  { id:"gazebo_ros",        name:"Gazebo ROS2",             category:"Simulation",   description:"Gazebo integration for ROS 2. Physics simulation, sensor plugins, URDF loading.", repo:"https://github.com/ros-simulation/gazebo_ros_pkgs",      stars:900,  install:"sudo apt install ros-humble-gazebo-ros-pkgs",           tags:["simulation","physics","gazebo"] },
  { id:"foxglove_bridge",   name:"Foxglove Bridge",         category:"Visualization",description:"WebSocket bridge to Foxglove Studio for real-time visualization.", repo:"https://github.com/foxglove/ros-foxglove-bridge",        stars:500,  install:"sudo apt install ros-humble-foxglove-bridge",           tags:["visualization","foxglove","websocket"] },
  { id:"teleop_twist",      name:"Teleop Twist Keyboard",   category:"Utilities",    description:"Keyboard teleoperation for diff-drive and holonomic robots. Publishes Twist on /cmd_vel.", repo:"https://github.com/ros-teleop/teleop_twist_keyboard",   stars:400,  install:"sudo apt install ros-humble-teleop-twist-keyboard",     tags:["teleop","keyboard","mobile"] },
  { id:"tf2",               name:"TF2",                     category:"Utilities",    description:"Transform library. Track coordinate frames over time, transform data between frames.", repo:"https://github.com/ros2/geometry2",                       stars:350,  install:"sudo apt install ros-humble-tf2-ros",                   tags:["transforms","frames","geometry"] },
  { id:"depth_image_proc",  name:"Depth Image Proc",        category:"Sensors",      description:"Processing for depth cameras (RealSense, Kinect). Point clouds, disparity, registered color.", repo:"https://github.com/ros-perception/image_pipeline",       stars:450,  install:"sudo apt install ros-humble-depth-image-proc",          tags:["camera","depth","pointcloud"] },
  { id:"rplidar",           name:"RPLidar Driver",          category:"Sensors",      description:"Driver for Slamtec RPLidar A1/A2/A3/S1/S2. Publishes LaserScan on /scan.", repo:"https://github.com/Slamtec/rplidar_ros",                 stars:700,  install:"sudo apt install ros-humble-rplidar-ros",               tags:["lidar","laser","slamtec"] },
  { id:"imu_tools",         name:"IMU Tools",               category:"Sensors",      description:"IMU data processing. Madgwick/Mahony filters, complementary filter, visualization.", repo:"https://github.com/ccny-ros-pkg/imu_tools",              stars:600,  install:"sudo apt install ros-humble-imu-tools",                 tags:["imu","filter","orientation"] },
  { id:"robot_localization",name:"Robot Localization",      category:"Navigation",   description:"EKF and UKF state estimation. Fuses odometry, IMU, GPS. Outputs /odom and /map transforms.", repo:"https://github.com/cra-ros-pkg/robot_localization",      stars:1000, install:"sudo apt install ros-humble-robot-localization",        tags:["ekf","localization","sensor-fusion"] },
  { id:"behaviortree_cpp",  name:"BehaviorTree.CPP",        category:"Control",      description:"Behavior Trees for robotics. Used by Nav2. GUI editor Groot2 compatible.", repo:"https://github.com/BehaviorTree/BehaviorTree.CPP",       stars:2200, install:"sudo apt install ros-humble-behaviortree-cpp-v3",      tags:["behavior-tree","nav2","planning"] },
  { id:"realsense2",        name:"Intel RealSense ROS2",    category:"Sensors",      description:"Official Intel RealSense driver. D435, D455, L515, T265 support.", repo:"https://github.com/IntelRealSense/realsense-ros",        stars:1500, install:"sudo apt install ros-humble-realsense2-camera",        tags:["realsense","depth","intel"] },
  { id:"twist_mux",         name:"Twist Mux",               category:"Control",      description:"Multiplexer for Twist commands. Priority-based selection from teleop, navigation, safety.", repo:"https://github.com/ros-teleop/twist_mux",               stars:200,  install:"sudo apt install ros-humble-twist-mux",                 tags:["control","teleop","mux"] },
  { id:"joint_state_pub",   name:"Joint State Publisher",   category:"Visualization",description:"Publishes joint states from URDF. GUI slider for manual joint control. Essential for RViz.", repo:"https://github.com/ros/joint_state_publisher",           stars:300,  install:"sudo apt install ros-humble-joint-state-publisher-gui", tags:["urdf","joints","rviz"] },
  { id:"diagnostics",       name:"ROS 2 Diagnostics",       category:"Utilities",    description:"Hardware diagnostics framework. Monitor CPU, battery, hardware health. Aggregator and analyzer.", repo:"https://github.com/ros/diagnostics",                      stars:250,  install:"sudo apt install ros-humble-diagnostics",               tags:["diagnostics","health","monitoring"] },
];

function nonce() {
  let n = "";
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  for (let i = 0; i < 32; i++) n += chars[Math.floor(Math.random() * chars.length)];
  return n;
}

function studioSystemPrompt(ros: RosConnection, ws: string): string {
  return `You are the roscode agent — an AI assistant embedded in roscode studio, a ROS 2 IDE.
Workspace: ${ws || "(none)"}
ROS status: ${ros.status}${ros.connectedHost ? ` (${ros.connectedHost})` : ""}
Be concise. When suggesting code changes, always show the diff. Ask for confirmation before destructive actions.`;
}

export class StudioPanel {
  public static currentPanel: StudioPanel | undefined;
  private static readonly viewType = "roscode.studio";

  private readonly _panel: vscode.WebviewPanel;
  private readonly _context: vscode.ExtensionContext;
  private readonly _ros: RosConnection;
  private _disposables: vscode.Disposable[] = [];

  private _client: Anthropic | undefined;
  private _messages: Anthropic.MessageParam[] = [];
  private _running = false;
  private _confirmPending = new Map<string, (ok: boolean) => void>();

  static createOrShow(context: vscode.ExtensionContext, ros: RosConnection): StudioPanel {
    if (StudioPanel.currentPanel) {
      StudioPanel.currentPanel._panel.reveal(vscode.ViewColumn.One);
      return StudioPanel.currentPanel;
    }
    const panel = vscode.window.createWebviewPanel(
      StudioPanel.viewType,
      "roscode studio",
      { viewColumn: vscode.ViewColumn.One, preserveFocus: false },
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [context.extensionUri],
      }
    );
    StudioPanel.currentPanel = new StudioPanel(panel, context, ros);
    return StudioPanel.currentPanel;
  }

  private constructor(panel: vscode.WebviewPanel, context: vscode.ExtensionContext, ros: RosConnection) {
    this._panel = panel;
    this._context = context;
    this._ros = ros;

    this._panel.webview.html = this._html();
    this._panel.webview.onDidReceiveMessage((m) => this._handle(m), null, this._disposables);
    this._panel.onDidDispose(() => this._dispose(), null, this._disposables);

    ros.onStatusChange(() => {
      this._post({ type: "rosStatus", status: ros.status, host: ros.connectedHost });
    });

    vscode.workspace.onDidChangeWorkspaceFolders(() => this._sendFiles(), null, this._disposables);
  }

  private _post(msg: object) { this._panel.webview.postMessage(msg); }

  private async _handle(msg: any) {
    switch (msg.type) {
      case "ready":
        this._post({ type: "rosStatus", status: this._ros.status, host: this._ros.connectedHost });
        this._post({ type: "library", packages: REGISTRY });
        this._sendFiles();
        break;
      case "agentSend":
        if (!this._running) await this._runAgent(msg.text);
        break;
      case "agentClear":
        this._clearAgent();
        break;
      case "toolConfirm":
        this._confirmPending.get(msg.id)?.(true);
        this._confirmPending.delete(msg.id);
        break;
      case "toolReject":
        this._confirmPending.get(msg.id)?.(false);
        this._confirmPending.delete(msg.id);
        break;
      case "startRuntime":
        vscode.commands.executeCommand("roscode.startRuntime");
        break;
      case "openFile":
        if (msg.path) vscode.window.showTextDocument(vscode.Uri.file(msg.path));
        break;
      case "installPackage":
        if (msg.cmd) {
          await vscode.env.clipboard.writeText(msg.cmd);
          vscode.window.showInformationMessage(`Copied: ${msg.cmd}`);
        }
        break;
      case "openExternal":
        if (msg.url) vscode.env.openExternal(vscode.Uri.parse(msg.url));
        break;
      case "aiSearch":
        await this._aiSearchPackages(msg.query);
        break;
      case "launchTool":
        await this._launchTool(msg.tool);
        break;
    }
  }

  private _clearAgent() {
    this._messages = [];
    for (const r of this._confirmPending.values()) r(false);
    this._confirmPending.clear();
    this._post({ type: "agentReset" });
  }

  private _sendFiles() {
    const ws = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!ws) { this._post({ type: "files", root: "", items: [] }); return; }
    try {
      const items = this._listFiles(ws, 0);
      this._post({ type: "files", root: path.basename(ws), items });
    } catch {}
  }

  private _listFiles(dir: string, depth: number): any[] {
    if (depth > 2) return [];
    const IGNORE = new Set(["node_modules", ".git", "__pycache__", "build", "install", "log", ".vscode"]);
    try {
      return fs.readdirSync(dir)
        .filter((n) => !IGNORE.has(n) && !n.startsWith("."))
        .slice(0, 40)
        .map((name) => {
          const full = path.join(dir, name);
          let isDir = false;
          try { isDir = fs.statSync(full).isDirectory(); } catch {}
          return {
            name, path: full, isDir,
            children: isDir && depth < 2 ? this._listFiles(full, depth + 1) : [],
          };
        });
    } catch { return []; }
  }

  private async _runAgent(userText: string) {
    this._running = true;
    const apiKey =
      vscode.workspace.getConfiguration("roscode").get<string>("anthropicApiKey") ||
      process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      this._post({ type: "agentNeedKey" });
      this._running = false;
      return;
    }
    if (!this._client) this._client = new Anthropic({ apiKey });
    const model = vscode.workspace.getConfiguration("roscode").get<string>("model", "claude-opus-4-7");
    const ws = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? "";

    this._messages.push({ role: "user", content: userText });
    this._post({ type: "agentThinking" });

    try {
      let loop = true;
      while (loop) {
        const res = await this._client.messages.create({
          model, max_tokens: 4096,
          system: studioSystemPrompt(this._ros, ws),
          tools: getAgentTools(),
          messages: this._messages,
        });
        this._messages.push({ role: "assistant", content: res.content });

        for (const blk of res.content) {
          if (blk.type === "text" && blk.text) this._post({ type: "agentText", text: blk.text });

          if (blk.type === "tool_use") {
            const meta = toolDisplayMeta(blk.name);
            const isDestructive = DESTRUCTIVE_TOOLS.has(blk.name);
            this._post({ type: "agentTool", id: blk.id, name: blk.name, input: blk.input, meta, needsConfirm: isDestructive });

            if (isDestructive) {
              const confirmed = await new Promise<boolean>((r) => { this._confirmPending.set(blk.id, r); });
              if (!confirmed) {
                this._post({ type: "agentToolRejected", id: blk.id });
                this._messages.push({ role: "user", content: [{ type: "tool_result", tool_use_id: blk.id, content: "User rejected this action." }] });
                continue;
              }
              this._post({ type: "agentToolConfirmed", id: blk.id });
            }

            const result = await dispatchTool(blk.name, blk.input as any, this._ros, ws);
            this._post({ type: "agentToolResult", id: blk.id, result });
            this._messages.push({ role: "user", content: [{ type: "tool_result", tool_use_id: blk.id, content: result }] });
          }
        }
        loop = res.stop_reason === "tool_use";
      }
    } catch (e: any) {
      this._post({ type: "agentError", text: String(e?.message ?? e) });
    } finally {
      this._post({ type: "agentDone" });
      this._running = false;
    }
  }

  private async _aiSearchPackages(query: string) {
    const apiKey =
      vscode.workspace.getConfiguration("roscode").get<string>("anthropicApiKey") ||
      process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      this._post({ type: "aiSearchResult", error: "Set ANTHROPIC_API_KEY to use AI search" });
      return;
    }
    const client = new Anthropic({ apiKey });
    try {
      const res = await client.messages.create({
        model: "claude-haiku-4-5-20251001", max_tokens: 1024,
        system: 'You are a ROS 2 expert. Suggest 3-5 ROS 2 packages for what the user describes. Return JSON array only: [{"name":"...","description":"...","repo":"https://github.com/...","install":"sudo apt install ros-humble-...","category":"..."}]',
        messages: [{ role: "user", content: query }],
      });
      const text = res.content[0].type === "text" ? res.content[0].text : "[]";
      const match = text.match(/\[[\s\S]*\]/);
      const results = match ? JSON.parse(match[0]) : [];
      this._post({ type: "aiSearchResult", results });
    } catch (e: any) {
      this._post({ type: "aiSearchResult", error: String(e?.message ?? e) });
    }
  }

  private async _launchTool(tool: string) {
    switch (tool) {
      case "foxglove":
        vscode.env.openExternal(vscode.Uri.parse("https://app.foxglove.dev"));
        break;
      case "terminal":
        vscode.commands.executeCommand("workbench.action.terminal.new");
        break;
      case "rviz":
        vscode.window.showInformationMessage("Launch RViz2: docker exec -it ros bash -c 'source /opt/ros/humble/setup.bash && rviz2'");
        break;
    }
  }

  private _dispose() {
    StudioPanel.currentPanel = undefined;
    this._panel.dispose();
    for (const r of this._confirmPending.values()) r(false);
    while (this._disposables.length) {
      const d = this._disposables.pop();
      if (d) d.dispose();
    }
  }

  private _html(): string {
    const n = nonce();
    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta http-equiv="Content-Security-Policy"
  content="default-src 'none';
           style-src 'nonce-${n}';
           script-src 'nonce-${n}';
           img-src data:;
           font-src data:;">
<style nonce="${n}">
:root{
  --bg:#0d1117; --bg1:#010409; --bg2:#161b22; --bg3:#21262d;
  --fg:#e6edf3; --fg2:#8b949e; --fg3:#484f58;
  --border:#30363d; --border2:#21262d;
  --accent:#4cc9f0; --accent-dim:rgba(76,201,240,.15);
  --green:#3fb950; --green-dim:rgba(63,185,80,.15);
  --red:#f85149;   --red-dim:rgba(248,81,73,.15);
  --yellow:#e3b341;
  --purple:#a371f7; --orange:#f78166; --amber:#ffa657;
  --cat-nav:var(--accent); --cat-man:var(--purple); --cat-sen:var(--orange);
  --cat-sim:var(--green);  --cat-ctl:var(--yellow);  --cat-utl:var(--fg3);
  --cat-emb:var(--amber);  --cat-vis:#56d364;
}
*{box-sizing:border-box;margin:0;padding:0;-webkit-font-smoothing:antialiased}
html,body{height:100%;overflow:hidden;background:var(--bg);color:var(--fg);
  font-family:'Inter',-apple-system,BlinkMacSystemFont,system-ui,sans-serif;font-size:12px}
button{cursor:pointer;font-family:inherit}

/* ── TOP BAR ───────────────────────────────────────────── */
#top{
  height:40px;background:var(--bg1);border-bottom:1px solid var(--border2);
  display:flex;align-items:center;padding:0 14px;gap:10px;flex-shrink:0;
  -webkit-app-region:drag;
}
#top *{-webkit-app-region:no-drag}
.wordmark{display:flex;align-items:baseline;gap:1px;font-weight:700;font-size:13px;letter-spacing:-.3px}
.wordmark .ros{color:var(--accent)}.wordmark .stud{color:var(--fg3);font-weight:400}
#ros-pill{
  margin-left:auto;display:flex;align-items:center;gap:6px;
  padding:4px 10px;border-radius:20px;border:1px solid var(--border);
  background:var(--bg2);font-size:11px;color:var(--fg2);font-weight:500;
}
#ros-pill .dot{width:6px;height:6px;border-radius:50%;background:var(--fg3);flex-shrink:0}
#ros-pill.online{background:rgba(63,185,80,.08);border-color:rgba(63,185,80,.3);color:var(--green)}
#ros-pill.online .dot{background:var(--green);box-shadow:0 0 5px var(--green)}
#ros-pill.connecting{border-color:rgba(227,179,65,.3);color:var(--yellow)}
#ros-pill.connecting .dot{background:var(--yellow)}
#btn-start{
  padding:5px 12px;border-radius:6px;border:none;
  background:var(--accent);color:#0d1117;font-size:11.5px;font-weight:600;
}
#btn-start:hover{background:#7de8f7}
#btn-start:disabled{opacity:.4;cursor:default}
.btn-ghost{
  padding:5px 9px;border-radius:6px;border:1px solid var(--border);
  background:transparent;color:var(--fg2);font-size:12px;
}
.btn-ghost:hover{border-color:var(--accent);color:var(--accent)}

/* Tools dropdown */
#tools-wrap{position:relative}
#tools-menu{
  display:none;position:absolute;top:calc(100% + 6px);right:0;
  background:var(--bg2);border:1px solid var(--border);border-radius:8px;
  min-width:200px;z-index:100;overflow:hidden;
  box-shadow:0 8px 24px rgba(0,0,0,.4);
}
#tools-menu.open{display:block}
#tools-menu button{
  display:flex;align-items:center;gap:10px;width:100%;padding:9px 14px;
  border:none;background:transparent;color:var(--fg);font-size:12px;text-align:left;
}
#tools-menu button:hover{background:var(--bg3)}
#tools-menu button .ti{font-size:14px;width:18px;text-align:center}

/* ── CONTENT AREA ──────────────────────────────────────── */
#content{display:flex;flex:1;min-height:0}

/* ── PANELS ────────────────────────────────────────────── */
.panel{display:flex;flex-direction:column;background:var(--bg);border-right:1px solid var(--border2);overflow:hidden;flex-shrink:0}
.panel.right{border-right:none;border-left:1px solid var(--border2)}
#lpanel{width:240px}
#rpanel{width:320px}
.panel.collapsed#lpanel{width:36px}
.panel.collapsed#rpanel{width:36px}

.panel-tabs{display:flex;border-bottom:1px solid var(--border2);height:34px;flex-shrink:0;background:var(--bg1)}
.panel-tabs button{
  flex:1;border:none;background:transparent;color:var(--fg2);
  font-size:11px;font-weight:500;padding:0 4px;border-bottom:2px solid transparent;
  display:flex;align-items:center;justify-content:center;gap:4px;
}
.panel-tabs button.active{color:var(--fg);border-bottom-color:var(--accent)}
.panel-tabs button:hover:not(.active){color:var(--fg)}
.panel.collapsed .panel-tabs{flex-direction:column;height:auto;border-bottom:none;border-right:1px solid var(--border2)}
.panel.collapsed .panel-tabs button{flex:none;height:36px;width:36px;border-bottom:none;border-right:2px solid transparent}
.panel.collapsed .panel-tabs button.active{border-right-color:var(--accent)}
.panel.collapsed .panel-tabs button .tab-label{display:none}
.panel-body{flex:1;overflow:hidden;display:flex;flex-direction:column}
.panel.collapsed .panel-body{display:none}

.tab-pane{display:none;flex:1;overflow:hidden;flex-direction:column}
.tab-pane.active{display:flex}

/* Collapse toggle */
.collapse-btn{
  margin-left:auto;width:28px;height:28px;border:none;background:transparent;
  color:var(--fg3);font-size:14px;display:flex;align-items:center;justify-content:center;border-radius:4px;
}
.collapse-btn:hover{color:var(--fg);background:var(--bg2)}

/* ── RESIZE HANDLES ────────────────────────────────────── */
.resizer{width:4px;background:transparent;cursor:col-resize;flex-shrink:0;transition:background 150ms}
.resizer:hover,.resizer.dragging{background:var(--accent)}

/* ── GRAPH CENTER ──────────────────────────────────────── */
#graph-center{flex:1;position:relative;background:var(--bg);overflow:hidden}
#cy-container{width:100%;height:100%;position:relative}
#cy-svg{width:100%;height:100%;position:absolute;top:0;left:0}

/* Offline overlay */
#graph-overlay{
  position:absolute;inset:0;display:flex;flex-direction:column;
  align-items:center;justify-content:center;gap:14px;background:var(--bg);
  pointer-events:all;
}
#graph-overlay.hidden{display:none}
.overlay-icon{font-size:40px;opacity:.3}
.overlay-title{font-size:14px;font-weight:600;color:var(--fg2)}
.overlay-sub{font-size:12px;color:var(--fg3)}
.overlay-btn{
  padding:7px 18px;border-radius:6px;border:1px solid var(--border);
  background:var(--bg2);color:var(--fg);font-size:12px;margin-top:4px;
}
.overlay-btn:hover{border-color:var(--accent);color:var(--accent)}

/* ── BOTTOM BAR ────────────────────────────────────────── */
#bottom{
  height:32px;border-top:1px solid var(--border2);background:var(--bg1);
  display:flex;align-items:center;padding:0 12px;gap:10px;flex-shrink:0;color:var(--fg3);font-size:11px;
}
#bottom button{
  display:flex;align-items:center;gap:5px;border:none;background:transparent;
  color:var(--fg3);font-size:11px;padding:3px 7px;border-radius:4px;
}
#bottom button:hover{color:var(--fg);background:var(--bg2)}

/* ── FILES TAB ─────────────────────────────────────────── */
#files-pane{padding:6px 0;overflow-y:auto}
.file-item{display:flex;align-items:center;gap:5px;padding:3px 10px;cursor:pointer;font-size:11.5px;color:var(--fg2);border-radius:0;white-space:nowrap;overflow:hidden}
.file-item:hover{background:var(--bg2);color:var(--fg)}
.file-item .fi{font-size:10px;color:var(--fg3);flex-shrink:0;width:10px}
.file-item .fname{overflow:hidden;text-overflow:ellipsis}
.file-section{padding:6px 10px 2px;font-size:10px;font-weight:600;color:var(--fg3);letter-spacing:.05em;text-transform:uppercase}
.no-ws{padding:16px 12px;color:var(--fg3);font-size:11.5px;text-align:center;line-height:1.5}

/* ── LIBRARY TAB ───────────────────────────────────────── */
#lib-pane{display:flex;flex-direction:column;overflow:hidden}
#lib-search-row{display:flex;gap:6px;padding:8px;flex-shrink:0}
#lib-search{
  flex:1;background:var(--bg2);border:1px solid var(--border);border-radius:6px;
  padding:5px 9px;color:var(--fg);font-family:inherit;font-size:11.5px;outline:none;
}
#lib-search:focus{border-color:var(--accent)}
#lib-search::placeholder{color:var(--fg3)}
#btn-ai-search{
  padding:5px 8px;border-radius:6px;border:1px solid var(--border);
  background:transparent;color:var(--fg2);font-size:12px;
}
#btn-ai-search:hover{border-color:#e040fb;color:#e040fb}
#lib-cats{display:flex;flex-wrap:wrap;gap:4px;padding:0 8px 6px;flex-shrink:0}
.cat-chip{
  padding:3px 8px;border-radius:12px;border:1px solid var(--border);
  background:transparent;color:var(--fg2);font-size:10.5px;cursor:pointer;
}
.cat-chip:hover{border-color:var(--accent);color:var(--accent)}
.cat-chip.active{background:var(--accent);border-color:var(--accent);color:#0d1117}
#lib-list{flex:1;overflow-y:auto;padding:4px 8px 8px}
.pkg-card{
  border-radius:6px;border:1px solid var(--border2);
  margin-bottom:6px;padding:10px;background:var(--bg);
  border-left-width:3px;
}
.pkg-card .pkg-top{display:flex;align-items:flex-start;justify-content:space-between;gap:6px}
.pkg-card .pkg-name{font-size:12px;font-weight:600;color:var(--fg)}
.pkg-card .pkg-stars{font-size:10.5px;color:var(--fg3);flex-shrink:0}
.pkg-card .pkg-desc{font-size:11px;color:var(--fg2);margin:4px 0 7px;line-height:1.4}
.pkg-card .pkg-actions{display:flex;gap:5px}
.pkg-card .btn-install{
  flex:1;padding:4px 8px;border-radius:4px;border:1px solid var(--border);
  background:var(--bg2);color:var(--fg2);font-size:10.5px;
}
.pkg-card .btn-install:hover{border-color:var(--accent);color:var(--accent)}
.pkg-card .btn-repo{
  padding:4px 7px;border-radius:4px;border:1px solid var(--border);
  background:transparent;color:var(--fg3);font-size:11px;
}
.pkg-card .btn-repo:hover{color:var(--fg)}
.ai-badge{
  display:inline-block;font-size:9.5px;padding:1px 5px;border-radius:3px;
  background:rgba(224,64,251,.15);border:1px solid rgba(224,64,251,.3);color:#e040fb;margin-left:4px;
}

/* AI search result panel */
#ai-search-panel{display:none;flex-direction:column;gap:0}
#ai-search-panel.visible{display:flex}
#ai-search-input{background:var(--bg2);border:1px solid var(--border);border-radius:6px;
  padding:6px 10px;color:var(--fg);font-family:inherit;font-size:11.5px;
  resize:none;outline:none;min-height:50px;margin:8px;
}
#ai-search-input:focus{border-color:var(--accent)}
#ai-search-input::placeholder{color:var(--fg3)}
#ai-search-go{margin:0 8px 8px;padding:6px;border-radius:6px;border:none;
  background:var(--accent);color:#0d1117;font-size:11.5px;font-weight:600}
#ai-search-go:hover{background:#7de8f7}
#ai-search-go:disabled{opacity:.4;cursor:default}

/* ── AGENT TAB ─────────────────────────────────────────── */
#agent-pane{display:flex;flex-direction:column;overflow:hidden}
#agent-feed{flex:1;overflow-y:auto;padding:10px 10px 4px;display:flex;flex-direction:column;gap:7px}
#agent-feed::-webkit-scrollbar{width:4px}
#agent-feed::-webkit-scrollbar-thumb{background:var(--border);border-radius:2px}
.a-msg{max-width:100%;line-height:1.5}
.a-msg.user{align-self:flex-end;background:var(--bg2);padding:6px 10px;border-radius:10px 10px 3px 10px;max-width:88%;font-size:12px}
.a-msg.ai{align-self:flex-start;white-space:pre-wrap;font-size:12px;padding:2px 0 4px;max-width:96%}
.a-msg.ai code{background:var(--bg2);padding:1px 4px;border-radius:3px;font-family:ui-monospace,monospace;font-size:11px;color:var(--accent)}
.a-tool{
  background:var(--bg2);border:1px solid var(--border2);border-radius:6px;
  padding:7px 9px;font-size:11px;display:flex;flex-direction:column;gap:3px;
}
.a-tool.destructive{border-color:#2a1f0a}
.a-tool.confirmed{border-color:var(--green-dim)}
.a-tool.rejected{border-color:var(--red-dim);opacity:.6}
.a-tool .t-row{display:flex;align-items:center;gap:6px}
.a-tool .t-icon{color:var(--accent);font-size:12px;flex-shrink:0}
.a-tool .t-name{font-weight:600;font-size:11.5px}
.a-tool .t-status{margin-left:auto;font-size:10px;color:var(--fg3)}
.a-tool .t-result{font-family:ui-monospace,monospace;font-size:10.5px;color:var(--fg2);
  background:var(--bg);padding:5px 7px;border-radius:4px;max-height:80px;overflow-y:auto;white-space:pre-wrap;margin-top:3px;border:1px solid var(--border2)}
.confirm-row{display:flex;gap:5px;margin-top:4px;align-items:center}
.confirm-row .cwarn{flex:1;font-size:10px;color:var(--yellow)}
.btn-c,.btn-r{padding:3px 9px;border-radius:4px;font-size:10.5px;font-weight:600;border:1px solid;cursor:pointer;font-family:inherit}
.btn-c{background:var(--green-dim);border-color:var(--green);color:var(--green)}
.btn-c:hover{background:var(--green);color:#060809}
.btn-r{background:var(--red-dim);border-color:var(--red);color:var(--red)}
.btn-r:hover{background:var(--red);color:#060809}
.thinking{display:flex;align-items:center;gap:5px;color:var(--fg3);font-size:11px;padding:2px 0}
.td{width:4px;height:4px;border-radius:50%;background:var(--accent);animation:pulse 1.3s ease infinite}
.td:nth-child(2){animation-delay:.15s}.td:nth-child(3){animation-delay:.3s}
@keyframes pulse{0%,80%,100%{opacity:.2;transform:scale(.8)}40%{opacity:1;transform:scale(1)}}
.a-empty{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;padding:16px;text-align:center}
.a-empty .hex{font-size:24px;color:var(--accent);opacity:.5}
.a-empty p{font-size:11.5px;color:var(--fg2);line-height:1.5;max-width:200px}
.a-sug{display:flex;flex-wrap:wrap;gap:4px;justify-content:center;margin-top:4px}
.a-sg{background:var(--bg2);border:1px solid var(--border2);border-radius:12px;
  padding:3px 9px;font-size:10.5px;color:var(--fg2);cursor:pointer}
.a-sg:hover{border-color:var(--accent);color:var(--accent)}
.banner{padding:7px 10px;border-radius:5px;font-size:11px;border:1px solid}
.banner.err{background:#1f0a0a;border-color:#3a1515;color:var(--red)}
.banner.warn{background:#1a1405;border-color:#3a2c0a;color:var(--yellow)}
#agent-bar{padding:7px;border-top:1px solid var(--border2);flex-shrink:0;background:var(--bg)}
.agent-wrap{display:flex;gap:5px;align-items:flex-end;background:var(--bg2);border:1px solid var(--border);border-radius:7px;padding:5px 7px 5px 9px;transition:border-color 100ms}
.agent-wrap:focus-within{border-color:var(--accent)}
#a-inp{flex:1;background:transparent;border:none;color:var(--fg);font-family:inherit;font-size:12px;resize:none;min-height:18px;max-height:120px;outline:none;line-height:1.5}
#a-inp::placeholder{color:var(--fg3)}
#a-send{background:var(--accent);color:#0d1117;border:none;border-radius:4px;width:26px;height:26px;display:flex;align-items:center;justify-content:center;flex-shrink:0}
#a-send:hover{background:#7de8f7}
#a-send:disabled{opacity:.25;cursor:default}

/* ── TOPICS TAB ────────────────────────────────────────── */
#topics-pane{overflow-y:auto;padding:6px}
.topic-item{display:flex;align-items:center;justify-content:space-between;
  padding:5px 8px;border-radius:5px;font-size:11px;cursor:pointer;gap:8px}
.topic-item:hover{background:var(--bg2)}
.topic-item .t-name{color:var(--accent);font-family:ui-monospace,monospace;overflow:hidden;text-overflow:ellipsis}
.topic-item .t-type{color:var(--fg3);font-size:10px;flex-shrink:0}
.t-offline{padding:16px 12px;color:var(--fg3);font-size:11.5px;text-align:center;line-height:1.5}

/* ── SCROLLBARS ────────────────────────────────────────── */
::-webkit-scrollbar{width:4px;height:4px}
::-webkit-scrollbar-track{background:transparent}
::-webkit-scrollbar-thumb{background:var(--border);border-radius:2px}
::-webkit-scrollbar-thumb:hover{background:var(--accent)}
</style>
</head>
<body>
<!-- TOP BAR -->
<div id="top">
  <div class="wordmark"><span class="ros">roscode</span><span class="stud">&nbsp;studio</span></div>

  <div id="ros-pill"><span class="dot"></span><span id="ros-text">ROS: Offline</span></div>

  <button id="btn-start" onclick="startRuntime()">▶ Start Runtime</button>

  <div id="tools-wrap">
    <button class="btn-ghost" onclick="toggleTools()">⊞ Tools</button>
    <div id="tools-menu">
      <button onclick="launch('foxglove')"><span class="ti">🦊</span>Foxglove Studio</button>
      <button onclick="launch('rviz')"><span class="ti">🔵</span>RViz2 (instructions)</button>
      <button onclick="launch('terminal')"><span class="ti">🖥</span>New Terminal</button>
    </div>
  </div>

  <button class="btn-ghost" onclick="toggleEditor()" title="Toggle Editor (Cmd+E)">{ }</button>
</div>

<!-- MAIN CONTENT -->
<div id="content">

  <!-- LEFT PANEL -->
  <div class="panel" id="lpanel">
    <div class="panel-tabs">
      <button class="active" id="lt-files" onclick="lTab('files')"><span>📁</span><span class="tab-label">Files</span></button>
      <button id="lt-library" onclick="lTab('library')"><span>📦</span><span class="tab-label">Library</span></button>
      <button class="collapse-btn" onclick="collapsePanel('lpanel')" title="Collapse">‹</button>
    </div>
    <div class="panel-body">
      <!-- FILES -->
      <div class="tab-pane active" id="lp-files">
        <div id="files-pane">
          <div class="no-ws">No workspace open.<br>Open a folder to see files.</div>
        </div>
      </div>
      <!-- LIBRARY -->
      <div class="tab-pane" id="lp-library">
        <div id="lib-pane">
          <!-- AI search panel -->
          <div id="ai-search-panel">
            <textarea id="ai-search-input" placeholder="Describe what you need — e.g. 'lidar SLAM for indoor mobile robot'…"></textarea>
            <button id="ai-search-go" onclick="runAiSearch()">✨ Search with AI</button>
          </div>
          <div id="lib-search-row">
            <input id="lib-search" type="text" placeholder="Search packages…" oninput="filterLib()"/>
            <button id="btn-ai-search" onclick="toggleAiSearch()" title="AI Search">✨</button>
          </div>
          <div id="lib-cats"></div>
          <div id="lib-list"></div>
        </div>
      </div>
    </div>
  </div>

  <div class="resizer" id="lresizer"></div>

  <!-- GRAPH CENTER -->
  <div id="graph-center">
    <div id="cy-container">
      <svg id="cy-svg" xmlns="http://www.w3.org/2000/svg"></svg>
    </div>
    <div id="graph-overlay">
      <div class="overlay-icon">🤖</div>
      <div class="overlay-title">Robot offline</div>
      <div class="overlay-sub">Start runtime to see the ROS graph</div>
      <button class="overlay-btn" onclick="startRuntime()">▶ Start Runtime</button>
    </div>
  </div>

  <div class="resizer" id="rresizer"></div>

  <!-- RIGHT PANEL -->
  <div class="panel right" id="rpanel">
    <div class="panel-tabs">
      <button class="collapse-btn" onclick="collapsePanel('rpanel')" style="margin-left:0;margin-right:auto;" title="Collapse">›</button>
      <button class="active" id="rt-agent" onclick="rTab('agent')"><span>🤖</span><span class="tab-label">Agent</span></button>
      <button id="rt-topics" onclick="rTab('topics')"><span>📡</span><span class="tab-label">Topics</span></button>
    </div>
    <div class="panel-body">
      <!-- AGENT -->
      <div class="tab-pane active" id="rp-agent">
        <div id="agent-pane">
          <div id="agent-feed">
            <div class="a-empty" id="a-empty">
              <div class="hex">⬡</div>
              <p>Ask Claude to inspect your ROS graph, fix nodes, or create packages.</p>
              <div class="a-sug">
                <span class="a-sg" onclick="prefill('What topics are active?')">topics?</span>
                <span class="a-sg" onclick="prefill('Show the node graph')">graph</span>
                <span class="a-sg" onclick="prefill('Find any issues in my nodes')">find bugs</span>
                <span class="a-sg" onclick="prefill('Create a basic publisher node')">new node</span>
              </div>
            </div>
          </div>
          <div id="agent-bar">
            <div class="agent-wrap">
              <textarea id="a-inp" placeholder="Ask about your ROS system…" rows="1" oninput="autoResize(this)" onkeydown="agentKey(event)"></textarea>
              <button id="a-send" onclick="agentSend()">
                <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor"><path d="M11 6L1 1l2.5 5L1 11l10-5z"/></svg>
              </button>
            </div>
          </div>
        </div>
      </div>
      <!-- TOPICS -->
      <div class="tab-pane" id="rp-topics">
        <div id="topics-pane">
          <div class="t-offline">Connect to a robot to see active topics.</div>
        </div>
      </div>
    </div>
  </div>

</div><!-- /content -->

<!-- BOTTOM BAR -->
<div id="bottom">
  <span>roscode studio</span>
  <button onclick="vscode.postMessage({type:'launchTool',tool:'terminal'})">⌘\` Terminal</button>
  <div style="margin-left:auto;display:flex;gap:8px">
    <span id="ws-label" style="color:var(--fg3)"></span>
  </div>
</div>

<script nonce="${n}">
const vscode = acquireVsCodeApi();

// ── State ──────────────────────────────────────────────
let libPackages = [];
let libFilter = '';
let libCat = 'All';
let aiSearchVisible = false;
let rosOnline = false;
let lCollapsed = false;
let rCollapsed = false;
let agentRunning = false;
let sampleTopics = [];

// ── Message handler ─────────────────────────────────────
window.addEventListener('message', e => {
  const m = e.data;
  switch(m.type) {
    case 'rosStatus':  handleRosStatus(m); break;
    case 'library':    initLib(m.packages); break;
    case 'files':      renderFiles(m.root, m.items); break;
    case 'agentThinking': showThinking(); break;
    case 'agentText':   appendText(m.text); break;
    case 'agentTool':   appendTool(m); break;
    case 'agentToolResult': setToolResult(m.id, m.result); break;
    case 'agentToolConfirmed': setToolConfirmed(m.id); break;
    case 'agentToolRejected': setToolRejected(m.id); break;
    case 'agentDone':   agentDone(); break;
    case 'agentReset':  resetAgent(); break;
    case 'agentError':  appendError(m.text); break;
    case 'agentNeedKey':appendWarn('Set <code>ANTHROPIC_API_KEY</code> in settings to use the agent.'); break;
    case 'aiSearchResult': handleAiSearch(m); break;
  }
});

// ── ROS Status ──────────────────────────────────────────
function handleRosStatus(m) {
  const pill = document.getElementById('ros-pill');
  const txt = document.getElementById('ros-text');
  const btn = document.getElementById('btn-start');
  const overlay = document.getElementById('graph-overlay');
  rosOnline = m.status === 'connected';
  pill.className = rosOnline ? 'online' : (m.status === 'connecting' ? 'connecting' : '');
  txt.textContent = rosOnline ? 'ROS: ' + (m.host || 'Online') : m.status === 'connecting' ? 'Connecting…' : 'ROS: Offline';
  btn.disabled = rosOnline;
  btn.textContent = rosOnline ? '✓ Connected' : '▶ Start Runtime';
  if (overlay) overlay.classList.toggle('hidden', rosOnline);
  if (rosOnline) loadTopics();
}

function startRuntime() {
  vscode.postMessage({ type: 'startRuntime' });
}

// ── Graph (placeholder SVG) ─────────────────────────────
function drawPlaceholderGraph() {
  const svg = document.getElementById('cy-svg');
  if (!svg) return;
  const W = svg.clientWidth || 600, H = svg.clientHeight || 400;
  const nodes = [
    { id:'n1', label:'/robot_node',       x:.3, y:.35, color:'#4cc9f0' },
    { id:'n2', label:'/slam_node',         x:.65,.25, color:'#a371f7' },
    { id:'n3', label:'/nav2_planner',      x:.65,.65, color:'#a371f7' },
    { id:'n4', label:'/sensor_driver',     x:.15,.6,  color:'#f78166' },
  ];
  const edges = [
    { from:'n1',to:'n2' }, { from:'n1',to:'n3' }, { from:'n4',to:'n1' }, { from:'n2',to:'n3' }
  ];
  let s = '';
  edges.forEach(e => {
    const f = nodes.find(n=>n.id===e.from), t = nodes.find(n=>n.id===e.to);
    s += \`<line x1="\${f.x*W}" y1="\${f.y*H}" x2="\${t.x*W}" y2="\${t.y*H}" stroke="#21262d" stroke-width="1.5"/>\`;
  });
  nodes.forEach(n => {
    const x=n.x*W, y=n.y*H;
    s += \`<circle cx="\${x}" cy="\${y}" r="22" fill="#161b22" stroke="\${n.color}" stroke-width="1.5"/>
    <text x="\${x}" y="\${y+34}" text-anchor="middle" fill="#8b949e" font-size="10" font-family="monospace">\${n.label}</text>\`;
  });
  svg.innerHTML = s;
}

function loadTopics() {
  const pane = document.getElementById('topics-pane');
  if (!pane) return;
  sampleTopics = [
    { name:'/cmd_vel',         type:'geometry_msgs/Twist' },
    { name:'/odom',            type:'nav_msgs/Odometry' },
    { name:'/scan',            type:'sensor_msgs/LaserScan' },
    { name:'/tf',              type:'tf2_msgs/TFMessage' },
    { name:'/robot_status',    type:'std_msgs/String' },
  ];
  pane.innerHTML = sampleTopics.map(t => \`
    <div class="topic-item">
      <span class="t-name">\${t.name}</span>
      <span class="t-type">\${t.type}</span>
    </div>\`).join('');
}

// ── Files ───────────────────────────────────────────────
function renderFiles(root, items) {
  const pane = document.getElementById('files-pane');
  if (!pane) return;
  if (!root || !items.length) {
    pane.innerHTML = '<div class="no-ws">No workspace open.<br>Open a folder to see files.</div>';
    return;
  }
  const wsLabel = document.getElementById('ws-label');
  if (wsLabel) wsLabel.textContent = root;
  pane.innerHTML = '<div class="file-section">' + root + '</div>' + renderFileItems(items, 0);
}

function renderFileItems(items, depth) {
  return items.map(f => {
    const pad = 10 + depth * 12;
    const icon = f.isDir ? '▸' : '·';
    let html = \`<div class="file-item" style="padding-left:\${pad}px" onclick="\${f.isDir ? '' : 'openFile(' + JSON.stringify(f.path) + ')'}" >
      <span class="fi">\${icon}</span><span class="fname">\${f.name}</span>
    </div>\`;
    if (f.isDir && f.children.length) html += renderFileItems(f.children, depth+1);
    return html;
  }).join('');
}

function openFile(p) { vscode.postMessage({ type:'openFile', path:p }); }

// ── Library ─────────────────────────────────────────────
const CAT_COLORS = {
  Navigation:'var(--cat-nav)', Manipulators:'var(--cat-man)', Sensors:'var(--cat-sen)',
  Simulation:'var(--cat-sim)', Control:'var(--cat-ctl)', Utilities:'var(--cat-utl)',
  Embedded:'var(--cat-emb)', Visualization:'var(--cat-vis)',
};

function initLib(pkgs) {
  libPackages = pkgs;
  const cats = ['All', ...new Set(pkgs.map(p=>p.category))];
  const chips = document.getElementById('lib-cats');
  if (chips) chips.innerHTML = cats.map(c =>
    \`<button class="cat-chip\${c==='All'?' active':''}" onclick="setLibCat('\${c}')">\${c}</button>\`
  ).join('');
  renderLib();
}

function setLibCat(c) {
  libCat = c;
  document.querySelectorAll('.cat-chip').forEach(b => b.classList.toggle('active', b.textContent===c));
  renderLib();
}

function filterLib() {
  libFilter = document.getElementById('lib-search')?.value.toLowerCase() || '';
  renderLib();
}

function renderLib(extra=[]) {
  const list = document.getElementById('lib-list');
  if (!list) return;
  let pkgs = libPackages.filter(p =>
    (libCat==='All' || p.category===libCat) &&
    (!libFilter || p.name.toLowerCase().includes(libFilter) || p.description.toLowerCase().includes(libFilter) || (p.tags||[]).some(t=>t.includes(libFilter)))
  );
  const allPkgs = [...extra, ...pkgs];
  if (!allPkgs.length) { list.innerHTML = '<div style="padding:16px 8px;color:var(--fg3);font-size:11.5px;text-align:center">No packages found.</div>'; return; }
  list.innerHTML = allPkgs.map(p => {
    const col = CAT_COLORS[p.category] || 'var(--fg3)';
    const ai = p._ai ? '<span class="ai-badge">AI</span>' : '';
    const stars = p.stars ? \`\${p.stars>=1000?(p.stars/1000).toFixed(1)+'k':p.stars}⭐\` : '';
    return \`<div class="pkg-card" style="border-left-color:\${col}">
      <div class="pkg-top">
        <span class="pkg-name">\${p.name}\${ai}</span>
        <span class="pkg-stars">\${stars}</span>
      </div>
      <div class="pkg-desc">\${p.description}</div>
      <div class="pkg-actions">
        <button class="btn-install" onclick="installPkg(\${JSON.stringify(p.install)})">📋 Copy install</button>
        <button class="btn-repo" onclick="openRepo(\${JSON.stringify(p.repo)})">↗</button>
      </div>
    </div>\`;
  }).join('');
}

function installPkg(cmd) { vscode.postMessage({ type:'installPackage', cmd }); }
function openRepo(url) { vscode.postMessage({ type:'openExternal', url }); }

function toggleAiSearch() {
  aiSearchVisible = !aiSearchVisible;
  const p = document.getElementById('ai-search-panel');
  if (p) p.classList.toggle('visible', aiSearchVisible);
}

function runAiSearch() {
  const ta = document.getElementById('ai-search-input');
  const go = document.getElementById('ai-search-go');
  if (!ta || !ta.value.trim()) return;
  go.disabled = true;
  go.textContent = '⏳ Searching…';
  vscode.postMessage({ type:'aiSearch', query: ta.value.trim() });
}

function handleAiSearch(m) {
  const go = document.getElementById('ai-search-go');
  if (go) { go.disabled=false; go.textContent='✨ Search with AI'; }
  if (m.error) { appendLibNotice('⚠ ' + m.error); return; }
  const aiPkgs = (m.results||[]).map(p => ({...p, _ai:true, stars:0}));
  renderLib(aiPkgs);
  toggleAiSearch();
}

function appendLibNotice(msg) {
  const list = document.getElementById('lib-list');
  if (list) list.insertAdjacentHTML('afterbegin', \`<div style="padding:8px;color:var(--yellow);font-size:11px">\${msg}</div>\`);
}

// ── Tab switching ───────────────────────────────────────
function lTab(name) {
  ['files','library'].forEach(t => {
    document.getElementById('lt-'+t)?.classList.toggle('active', t===name);
    document.getElementById('lp-'+t)?.classList.toggle('active', t===name);
  });
}

function rTab(name) {
  ['agent','topics'].forEach(t => {
    document.getElementById('rt-'+t)?.classList.toggle('active', t===name);
    document.getElementById('rp-'+t)?.classList.toggle('active', t===name);
  });
}

// ── Panel collapse ──────────────────────────────────────
function collapsePanel(id) {
  const panel = document.getElementById(id);
  if (!panel) return;
  panel.classList.toggle('collapsed');
  const isLeft = id==='lpanel';
  const btn = panel.querySelector('.collapse-btn');
  if (btn) btn.textContent = panel.classList.contains('collapsed') ? (isLeft?'›':'‹') : (isLeft?'‹':'›');
}

// ── Resize handles ──────────────────────────────────────
function setupResizer(handle, target, side) {
  let startX, startW;
  handle.addEventListener('mousedown', e => {
    startX = e.clientX; startW = target.offsetWidth;
    document.body.style.userSelect = 'none';
    handle.classList.add('dragging');
    const move = ev => { const dx = ev.clientX - startX; const w = Math.max(160, Math.min(500, startW + (side==='l'?dx:-dx))); target.style.width = w+'px'; };
    const up = () => { document.body.style.userSelect=''; handle.classList.remove('dragging'); document.removeEventListener('mousemove',move); document.removeEventListener('mouseup',up); };
    document.addEventListener('mousemove', move);
    document.addEventListener('mouseup', up);
  });
}
setupResizer(document.getElementById('lresizer'), document.getElementById('lpanel'), 'l');
setupResizer(document.getElementById('rresizer'), document.getElementById('rpanel'), 'r');

// ── Tools menu ──────────────────────────────────────────
function toggleTools() {
  document.getElementById('tools-menu')?.classList.toggle('open');
}
document.addEventListener('click', e => {
  if (!e.target.closest('#tools-wrap')) document.getElementById('tools-menu')?.classList.remove('open');
});

function launch(tool) {
  document.getElementById('tools-menu')?.classList.remove('open');
  vscode.postMessage({ type:'launchTool', tool });
}

function toggleEditor() { vscode.postMessage({ type:'runCommand', command:'workbench.action.toggleEditorVisibility' }); }

// ── Agent chat ──────────────────────────────────────────
function autoResize(el) {
  el.style.height='auto';
  el.style.height=Math.min(el.scrollHeight,120)+'px';
}

function agentKey(e) {
  if (e.key==='Enter' && !e.shiftKey) { e.preventDefault(); agentSend(); }
}

function agentSend() {
  const inp = document.getElementById('a-inp');
  const text = inp?.value.trim();
  if (!text || agentRunning) return;
  inp.value=''; inp.style.height='auto';
  hideEmpty();
  appendUser(text);
  agentRunning=true;
  document.getElementById('a-send').disabled=true;
  vscode.postMessage({ type:'agentSend', text });
}

function prefill(text) {
  const inp = document.getElementById('a-inp');
  if (inp) { inp.value=text; inp.focus(); autoResize(inp); }
}

function hideEmpty() { document.getElementById('a-empty')?.remove(); }

function appendUser(text) {
  const feed = document.getElementById('agent-feed');
  if (!feed) return;
  feed.insertAdjacentHTML('beforeend', \`<div class="a-msg user">\${esc(text)}</div>\`);
  feed.scrollTop=feed.scrollHeight;
}

function showThinking() {
  const feed = document.getElementById('agent-feed');
  if (!feed) return;
  const el = document.createElement('div');
  el.className='thinking'; el.id='a-thinking';
  el.innerHTML='<div class="td"></div><div class="td"></div><div class="td"></div>';
  feed.appendChild(el); feed.scrollTop=feed.scrollHeight;
}

function removeThinking() { document.getElementById('a-thinking')?.remove(); }

function appendText(text) {
  removeThinking();
  const feed = document.getElementById('agent-feed');
  if (!feed) return;
  feed.insertAdjacentHTML('beforeend', \`<div class="a-msg ai">\${esc(text)}</div>\`);
  feed.scrollTop=feed.scrollHeight;
}

function appendTool(m) {
  removeThinking();
  const feed = document.getElementById('agent-feed');
  if (!feed) return;
  const destr = m.needsConfirm;
  const confirm = destr ? \`<div class="confirm-row"><span class="cwarn">⚠ requires confirmation</span>
    <button class="btn-c" onclick="confirmTool('\${m.id}')">Run</button>
    <button class="btn-r" onclick="rejectTool('\${m.id}')">Reject</button></div>\` : '';
  feed.insertAdjacentHTML('beforeend', \`<div class="a-tool\${destr?' destructive':''}" id="tool-\${m.id}">
    <div class="t-row">
      <span class="t-icon">\${m.meta?.icon||'⚙'}</span>
      <span class="t-name">\${m.meta?.label||m.name}</span>
      <span class="t-status" id="ts-\${m.id}">running…</span>
    </div>
    \${confirm}
  </div>\`);
  feed.scrollTop=feed.scrollHeight;
}

function setToolResult(id, result) {
  const card = document.getElementById('tool-'+id);
  const st = document.getElementById('ts-'+id);
  if (st) st.textContent='done';
  if (card) {
    card.querySelector('.confirm-row')?.remove();
    card.insertAdjacentHTML('beforeend', \`<div class="t-result">\${esc(String(result).slice(0,400))}</div>\`);
  }
  document.getElementById('agent-feed')?.scrollTo(0,document.getElementById('agent-feed').scrollHeight);
}

function setToolConfirmed(id) {
  const card = document.getElementById('tool-'+id);
  if (card) { card.classList.add('confirmed'); card.querySelector('.confirm-row')?.remove(); }
}

function setToolRejected(id) {
  const card = document.getElementById('tool-'+id);
  const st = document.getElementById('ts-'+id);
  if (card) { card.classList.add('rejected'); card.querySelector('.confirm-row')?.remove(); }
  if (st) st.textContent='rejected';
}

function confirmTool(id) { vscode.postMessage({type:'toolConfirm',id}); }
function rejectTool(id) { vscode.postMessage({type:'toolReject',id}); }

function agentDone() {
  agentRunning=false;
  document.getElementById('a-send').disabled=false;
}

function resetAgent() {
  const feed = document.getElementById('agent-feed');
  if (!feed) return;
  feed.innerHTML='<div class="a-empty" id="a-empty"><div class="hex">⬡</div><p>Ask Claude to inspect your ROS graph, fix nodes, or create packages.</p><div class="a-sug"><span class="a-sg" onclick="prefill(\'What topics are active?\')">topics?</span><span class="a-sg" onclick="prefill(\'Show the node graph\')">graph</span><span class="a-sg" onclick="prefill(\'Find any issues in my nodes\')">find bugs</span><span class="a-sg" onclick="prefill(\'Create a basic publisher node\')">new node</span></div></div>';
  agentRunning=false;
  document.getElementById('a-send').disabled=false;
}

function appendError(text) {
  removeThinking();
  const feed = document.getElementById('agent-feed');
  if (feed) { feed.insertAdjacentHTML('beforeend',\`<div class="banner err">\${esc(text)}</div>\`); feed.scrollTop=feed.scrollHeight; }
  agentDone();
}
function appendWarn(html) {
  const feed = document.getElementById('agent-feed');
  if (feed) { feed.insertAdjacentHTML('beforeend',\`<div class="banner warn">\${html}</div>\`); feed.scrollTop=feed.scrollHeight; }
  agentDone();
}

function esc(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ── Init ────────────────────────────────────────────────
drawPlaceholderGraph();
window.addEventListener('resize', drawPlaceholderGraph);
vscode.postMessage({ type:'ready' });
</script>
</body>
</html>`;
  }
}
