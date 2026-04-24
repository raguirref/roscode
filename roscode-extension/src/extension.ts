import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";
import { exec } from "child_process";
import { promisify } from "util";
import { NetworkProvider } from "./providers/NetworkProvider";
import { TopicProvider } from "./providers/TopicProvider";
import { NodeProvider } from "./providers/NodeProvider";
import { LibraryProvider } from "./providers/LibraryProvider";
import { AgentView } from "./views/AgentView";
import { HomeView } from "./views/HomeView";
import { NodeGraphPanel } from "./panels/NodeGraphPanel";
import { TopicMonitorPanel } from "./panels/TopicMonitorPanel";
import { RosConnection, RobotInfo } from "./ros/connection";
import { applyWorkbenchBranding } from "./branding/workbenchBrand";
import { inlineAsk } from "./agent/inlineAsk";
import { StudioPanel } from "./panels/StudioPanel";
import { LauncherPanel } from "./panels/LauncherPanel";

const execAsync = promisify(exec);

export let rosConnection: RosConnection;

export async function activate(context: vscode.ExtensionContext) {
  // First-run: set sensible defaults so the app feels like roscode studio, not VSCodium
  await applyFirstRunDefaults(context);

  // Inject roscode workbench branding (CSS into workbench.html)
  applyWorkbenchBranding(context).catch((e) =>
    console.error("roscode: branding failed", e)
  );

  rosConnection = new RosConnection();

  // Providers
  const networkProvider = new NetworkProvider(context, rosConnection);
  const topicProvider   = new TopicProvider(rosConnection);
  const nodeProvider    = new NodeProvider(rosConnection);
  const libraryProvider = new LibraryProvider();

  // Views
  const homeView  = new HomeView(context, rosConnection);
  const agentView = new AgentView(context, rosConnection);

  context.subscriptions.push(
    vscode.window.registerTreeDataProvider("roscode.network", networkProvider),
    vscode.window.registerTreeDataProvider("roscode.topics",  topicProvider),
    vscode.window.registerTreeDataProvider("roscode.nodes",   nodeProvider),
    vscode.window.registerTreeDataProvider("roscode.library", libraryProvider),
    vscode.window.registerWebviewViewProvider("roscode.home",  homeView),
    vscode.window.registerWebviewViewProvider("roscode.agent", agentView)
  );

  // Wire network → home view
  networkProvider.onRobotsChanged((count, scanning) => {
    homeView.updateRobots(count, scanning);
    vscode.commands.executeCommand("setContext", "roscode.robotCount",  count);
    vscode.commands.executeCommand("setContext", "roscode.scanning",    scanning);
  });

  // Status bar
  const statusItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
  statusItem.command = "roscode.focusAgent";
  context.subscriptions.push(statusItem);
  const updateStatus = () => {
    if (rosConnection.status === "connected") {
      statusItem.text = `$(circle-filled) ROS · ${rosConnection.connectedHost}`;
      statusItem.color = "#4cc9f0";
      statusItem.tooltip = "roscode: connected";
    } else if (rosConnection.status === "connecting") {
      statusItem.text = "$(loading~spin) ROS connecting…";
      statusItem.color = undefined;
    } else {
      statusItem.text = "$(circle-outline) ROS offline";
      statusItem.color = undefined;
      statusItem.tooltip = "click to focus agent";
    }
    statusItem.show();
  };
  updateStatus();
  rosConnection.onStatusChange(() => {
    updateStatus();
    topicProvider.refresh();
    nodeProvider.refresh();
    vscode.commands.executeCommand(
      "setContext",
      "roscode.connected",
      rosConnection.status === "connected"
    );
  });

  // Commands
  context.subscriptions.push(
    vscode.commands.registerCommand("roscode.focusAgent", () =>
      vscode.commands.executeCommand("roscode.agent.focus")
    ),
    vscode.commands.registerCommand("roscode.revealAgent", () =>
      vscode.commands.executeCommand("workbench.view.extension.roscode-agent")
    ),
    vscode.commands.registerCommand("roscode.openAgent", () =>
      vscode.commands.executeCommand("workbench.view.extension.roscode-agent")
    ),
    vscode.commands.registerCommand("roscode.clearAgent", () => agentView.clear()),
    vscode.commands.registerCommand("roscode.openNodeGraph", () =>
      NodeGraphPanel.createOrShow(context, rosConnection)
    ),
    vscode.commands.registerCommand("roscode.openTopicMonitor", () =>
      TopicMonitorPanel.createOrShow(context, rosConnection)
    ),
    vscode.commands.registerCommand("roscode.discoverNetwork", () => {
      networkProvider.refresh();
    }),
    vscode.commands.registerCommand("roscode.connectRobot", async (item) => {
      await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: `Connecting to ${item.robot.hostname || item.robot.ip}…`,
        },
        async () => {
          try { await rosConnection.connect(item.robot); }
          catch (e: any) {
            vscode.window.showErrorMessage(`Connect failed: ${e.message ?? e}`);
          }
        }
      );
      networkProvider.fireChange();
    }),
    vscode.commands.registerCommand("roscode.disconnectRobot", () => {
      rosConnection.disconnect();
      networkProvider.fireChange();
    }),
    vscode.commands.registerCommand("roscode.refreshNodes", () => {
      topicProvider.refresh();
      nodeProvider.refresh();
    }),
    vscode.commands.registerCommand("roscode.searchNodes", () => nodeProvider.search()),
    vscode.commands.registerCommand("roscode.clearNodeFilter", () => nodeProvider.clearFilter()),
    vscode.commands.registerCommand("roscode.echoTopic", (item) =>
      TopicMonitorPanel.createOrShow(context, rosConnection, item?.topicName)
    ),
    vscode.commands.registerCommand("roscode.inlineAsk", () =>
      inlineAsk(context, rosConnection)
    ),
    vscode.commands.registerCommand("roscode.searchLibrary", () => libraryProvider.search()),
    vscode.commands.registerCommand("roscode.clearLibraryFilter", () => libraryProvider.clearFilter()),
    vscode.commands.registerCommand("roscode.aiSearchLibrary", () => libraryProvider.aiSearch()),
    vscode.commands.registerCommand("roscode.startRuntime", () => startRuntime(rosConnection)),
    vscode.commands.registerCommand("roscode.insertMessageType", async (msgType: string) => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        await vscode.env.clipboard.writeText(msgType);
        vscode.window.showInformationMessage(`Copied "${msgType}" to clipboard`);
        return;
      }
      await editor.edit((eb) => {
        for (const sel of editor.selections) {
          if (sel.isEmpty) eb.insert(sel.active, msgType);
          else eb.replace(sel, msgType);
        }
      });
    }),
    vscode.commands.registerCommand("roscode.openStudio", () =>
      StudioPanel.createOrShow(context, rosConnection)
    ),
    vscode.commands.registerCommand("roscode.openLauncher", () =>
      LauncherPanel.createOrShow(context)
    )
  );

  // Auto-open studio when a roscode workspace is detected
  async function checkForRoscodeProject() {
    const configs = await vscode.workspace.findFiles(".roscode/config.json", null, 1);
    if (configs.length > 0) {
      await vscode.commands.executeCommand("roscode.openStudio");
    }
  }
  vscode.workspace.onDidChangeWorkspaceFolders(checkForRoscodeProject, null, context.subscriptions);
  checkForRoscodeProject().catch(() => {});

  // Initial state contexts
  vscode.commands.executeCommand("setContext", "roscode.connected", false);
  vscode.commands.executeCommand("setContext", "roscode.scanning", false);
  vscode.commands.executeCommand("setContext", "roscode.robotCount", 0);

  // Auto-scan on activation
  networkProvider.refresh();

  // On startup: close VS Code default UI then show launcher or studio
  setTimeout(async () => {
    try { await vscode.commands.executeCommand("workbench.action.closeAllEditors"); } catch {}
    try { await vscode.commands.executeCommand("workbench.action.closeSidebar"); } catch {}
    try { await vscode.commands.executeCommand("workbench.action.closePanel"); } catch {}
    try { await vscode.commands.executeCommand("workbench.action.closeAuxiliaryBar"); } catch {}
    const hasWorkspace = (vscode.workspace.workspaceFolders?.length ?? 0) > 0;
    if (!hasWorkspace) {
      LauncherPanel.createOrShow(context);
    } else {
      await checkForRoscodeProject();
    }
  }, 600);
}

async function tryPinAgentToRight(): Promise<void> {
  // Best-effort: try several undocumented commands to move the agent to the
  // secondary (right) sidebar. If none work, show the aux bar and display a tip.
  const candidates: Array<() => Thenable<unknown>> = [
    () => vscode.commands.executeCommand("_workbench.action.moveViewToLocation", {
      viewId: "roscode.agent", location: "workbench.parts.auxiliarybar",
    }),
    () => vscode.commands.executeCommand("workbench.action.moveView", {
      from: "roscode.agent", to: "workbench.parts.auxiliarybar",
    }),
    () => vscode.commands.executeCommand("_workbench.moveViewToContainer", {
      viewId: "roscode.agent", targetId: "workbench.panel.auxiliarybar",
    }),
  ];
  let moved = false;
  for (const c of candidates) {
    try { await c(); moved = true; break; } catch {}
  }
  // Always ensure aux bar is visible so the user sees something on the right
  try {
    const isVisible = await vscode.commands.executeCommand("_getAuxiliaryBarVisibility");
    if (!isVisible) await vscode.commands.executeCommand("workbench.action.toggleAuxiliaryBar");
  } catch {
    // Fallback: just toggle (may close if already open, but harmless for first run)
    try { await vscode.commands.executeCommand("workbench.action.toggleAuxiliaryBar"); } catch {}
  }
  if (!moved) {
    vscode.window.showInformationMessage(
      "Pro tip: right-click the agent icon in the Activity Bar and choose 'Move Agent to Secondary Side Bar' for the Cursor-style layout.",
      "Got it"
    );
  }
}

async function applyFirstRunDefaults(context: vscode.ExtensionContext) {
  // Version bump: force re-apply when we add new settings
  const SETTINGS_VERSION = 3;
  if (context.globalState.get("roscode.defaultsVersion", 0) >= SETTINGS_VERSION) return;

  const updates: Array<[string, unknown, string]> = [
    ["workbench.colorTheme",             "roscode dark",        "workbench"],
    ["workbench.startupEditor",          "none",                 "workbench"],
    ["workbench.tips.enabled",           false,                  "workbench"],
    ["workbench.editor.empty.hint",      "hidden",               "workbench"],
    ["telemetry.telemetryLevel",         "off",                  "telemetry"],
    ["extensions.ignoreRecommendations", true,                   "extensions"],
    ["update.showReleaseNotes",          false,                  "update"],
    // Disable workspace trust dialog entirely
    ["security.workspace.trust.enabled", false,                  "security"],
    // Disable Git extension UI — prevents "Clone Git Repository" dialog on startup
    ["git.enabled",                      false,                  "git"],
    ["git.openRepositoryInParentFolders","never",                "git"],
    ["git.autoRepositoryDetection",      false,                  "git"],
    ["git.suggestSmartCommit",           false,                  "git"],
    // Suppress SCM empty state view in editor area
    ["scm.alwaysShowActions",            false,                  "scm"],
    ["editor.fontSize",                  13,                     "editor"],
    ["editor.lineHeight",                1.55,                   "editor"],
    ["editor.fontLigatures",             true,                   "editor"],
    ["editor.smoothScrolling",           true,                   "editor"],
    ["editor.cursorBlinking",            "smooth",               "editor"],
    ["editor.cursorSmoothCaretAnimation","on",                   "editor"],
    ["editor.minimap.enabled",           true,                   "editor"],
    ["editor.bracketPairColorization.enabled", true,             "editor"],
    ["window.titleBarStyle",             "custom",               "window"],
    ["window.commandCenter",             false,                  "window"],
    ["window.menuBarVisibility",         "classic",              "window"],
    ["breadcrumbs.enabled",              false,                  "breadcrumbs"],
  ];
  for (const [key, value, section] of updates) {
    try {
      const cfg = vscode.workspace.getConfiguration(section);
      const k = key.substring(section.length + 1);
      if (cfg.get(k) !== value) {
        await cfg.update(k, value, vscode.ConfigurationTarget.Global);
      }
    } catch {}
  }
  context.globalState.update("roscode.defaultsVersion", SETTINGS_VERSION);
}

async function startRuntime(ros: RosConnection): Promise<void> {
  const ws = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (!ws) {
    vscode.window.showWarningMessage("Open a roscode workspace folder first.");
    return;
  }

  const composeFile = path.join(ws, "runtime", "docker-compose.yml");
  if (!fs.existsSync(composeFile)) {
    const choice = await vscode.window.showWarningMessage(
      "No runtime/docker-compose.yml found. Create one from the roscode template?",
      "Create", "Cancel"
    );
    if (choice !== "Create") return;
    fs.mkdirSync(path.join(ws, "runtime"), { recursive: true });
    fs.writeFileSync(composeFile, defaultDockerCompose());
    vscode.window.showInformationMessage("Created runtime/docker-compose.yml — starting ROS…");
  }

  await vscode.window.withProgress(
    { location: vscode.ProgressLocation.Notification, title: "Starting ROS runtime…", cancellable: false },
    async (progress) => {
      try {
        progress.report({ message: "docker compose up -d…" });
        await execAsync("docker compose up -d", { cwd: path.join(ws, "runtime"), timeout: 60_000 });

        progress.report({ message: "Waiting for ROS daemon…" });
        // Poll until ros2 topic list works (up to 30s)
        let ready = false;
        for (let i = 0; i < 6; i++) {
          await delay(5000);
          try {
            await execAsync("docker compose exec ros bash -c 'source /opt/ros/humble/setup.bash && ros2 topic list'",
              { cwd: path.join(ws, "runtime"), timeout: 8_000 });
            ready = true;
            break;
          } catch { /* still starting */ }
        }

        if (!ready) {
          vscode.window.showWarningMessage("ROS container started but daemon not responding yet. Try connecting manually.");
          return;
        }

        // Connect as a local ROS2 robot
        const robot: RobotInfo = {
          ip: "127.0.0.1",
          hostname: "localhost (Docker)",
          rosVersion: "ros2",
          domainId: 0,
        };
        await ros.connect(robot);
        vscode.window.showInformationMessage("ROS 2 runtime started and connected.");
      } catch (e: any) {
        vscode.window.showErrorMessage(`Start ROS failed: ${e.message ?? e}`);
      }
    }
  );
}

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function defaultDockerCompose(): string {
  return `services:
  ros:
    image: ros:humble
    network_mode: host
    environment:
      - ROS_DOMAIN_ID=0
    command: >
      bash -c "
        source /opt/ros/humble/setup.bash &&
        ros2 daemon start &&
        echo 'ROS 2 Humble ready' &&
        tail -f /dev/null
      "
    restart: unless-stopped
`;
}


export function deactivate() {
  rosConnection?.disconnect();
}
