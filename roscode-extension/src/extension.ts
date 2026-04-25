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
import { PlotView } from "./views/PlotView";
import { GraphView } from "./views/GraphView";
import { TerminalView } from "./views/TerminalView";
import { NodeGraphPanel } from "./panels/NodeGraphPanel";
import { TopicMonitorPanel } from "./panels/TopicMonitorPanel";
import { RosConnection, RobotInfo } from "./ros/connection";
import { applyWorkbenchBranding } from "./branding/workbenchBrand";
import { inlineAsk } from "./agent/inlineAsk";
import { StudioPanel } from "./panels/StudioPanel";
import { LauncherPanel } from "./panels/LauncherPanel";
import { RoscodePagePanel, PageKind } from "./panels/RoscodePagePanel";

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
  const plotView  = new PlotView(context, rosConnection);
  const graphView = new GraphView(context, rosConnection);
  const terminalView = new TerminalView(context);

  // Tree views — using createTreeView so we get visibility hooks.
  const networkTree = vscode.window.createTreeView("roscode.network", { treeDataProvider: networkProvider });
  const topicTree   = vscode.window.createTreeView("roscode.topics",  { treeDataProvider: topicProvider });
  const nodeTree    = vscode.window.createTreeView("roscode.nodes",   { treeDataProvider: nodeProvider });
  const libraryTree = vscode.window.createTreeView("roscode.library", { treeDataProvider: libraryProvider });

  context.subscriptions.push(
    networkTree, topicTree, nodeTree, libraryTree,
    vscode.window.registerWebviewViewProvider("roscode.home",  homeView),
    vscode.window.registerWebviewViewProvider("roscode.agent", agentView),
    vscode.window.registerWebviewViewProvider("roscode.plot",  plotView),
    vscode.window.registerWebviewViewProvider("roscode.graph", graphView),
    vscode.window.registerWebviewViewProvider("roscode.terminal", terminalView)
  );

  // ═══════════════════════════════════════════════════════════
  // Activity bar → full-page router.
  // When any of the sidebar containers becomes visible, pop the
  // corresponding full-editor page and close the sidebar so users
  // see the dedicated layout — not a cramped side panel.
  // ═══════════════════════════════════════════════════════════
  const openFullPage = async (kind: PageKind) => {
    // Close sidebar first to prevent the flash where it briefly opens before hiding
    vscode.commands.executeCommand("workbench.action.closeSidebar").catch(() => {});
    await new Promise(r => setTimeout(r, 10));
    RoscodePagePanel.createOrShow(context, kind, rosConnection);
  };

  const wireTreeViewToPage = (tv: vscode.TreeView<any>, kind: PageKind) => {
    tv.onDidChangeVisibility((e) => {
      if (e.visible) openFullPage(kind);
    });
  };
  wireTreeViewToPage(networkTree, "network");
  wireTreeViewToPage(nodeTree,    "nodes");
  wireTreeViewToPage(topicTree,   "topics");
  wireTreeViewToPage(libraryTree, "library");

  // Webview views also route to full page on visibility.
  graphView.onVisibilityChange?.(() => openFullPage("graph"));
  plotView.onVisibilityChange?.(() => openFullPage("plot"));
  terminalView.onVisibilityChange?.(() => openFullPage("terminal"));
  homeView.onVisibilityChange?.(() => {
    vscode.commands.executeCommand("workbench.action.closeSidebar").catch(() => {});
    setTimeout(() => LauncherPanel.createOrShow(context), 10);
  });

  // Register explicit open commands so users can hit Ctrl+Shift+P too.
  context.subscriptions.push(
    vscode.commands.registerCommand("roscode.openNetworkPage",  () => openFullPage("network")),
    vscode.commands.registerCommand("roscode.openNodesPage",    () => openFullPage("nodes")),
    vscode.commands.registerCommand("roscode.openTopicsPage",   () => openFullPage("topics")),
    vscode.commands.registerCommand("roscode.openLibraryPage",  () => openFullPage("library")),
    vscode.commands.registerCommand("roscode.openGraphPage",    () => openFullPage("graph")),
    vscode.commands.registerCommand("roscode.openPlotPage",     () => openFullPage("plot")),
    vscode.commands.registerCommand("roscode.openTerminalPage", () => openFullPage("terminal")),
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
      statusItem.color = "#f2a83b";
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

  // Initial studio-config check handled by applyChromeForWorkspaceState below.

  // Initial state contexts
  vscode.commands.executeCommand("setContext", "roscode.connected", false);
  vscode.commands.executeCommand("setContext", "roscode.scanning", false);
  vscode.commands.executeCommand("setContext", "roscode.robotCount", 0);

  // Auto-scan on activation
  networkProvider.refresh();

  // Fase E: claudemap — notify StudioPanel when active editor changes
  vscode.window.onDidChangeActiveTextEditor((editor) => {
    if (!editor || !StudioPanel.currentPanel) return;
    const doc = editor.document;
    if (doc.uri.scheme !== "file") return;
    const filename = path.basename(doc.fileName);
    const code = doc.getText();
    StudioPanel.currentPanel.notifyActiveEditor(filename, code, doc.lineCount);
  }, null, context.subscriptions);

  // On startup: splash mode if no workspace (only launcher visible, zero IDE
  // chrome). Full IDE activates the moment a workspace folder is opened.
  setTimeout(async () => {
    try { await vscode.commands.executeCommand("workbench.action.closeAllEditors"); } catch {}
    await applyChromeForWorkspaceState(context);
  }, 500);

  // Watch for workspace changes — exit splash as soon as a folder opens.
  vscode.workspace.onDidChangeWorkspaceFolders(
    () => applyChromeForWorkspaceState(context),
    null,
    context.subscriptions
  );
}

/**
 * Enter "splash" (launcher-only, zero chrome) when there is no workspace,
 * otherwise full IDE with agent docked to the right.
 */
async function applyChromeForWorkspaceState(context: vscode.ExtensionContext) {
  const hasWorkspace = (vscode.workspace.workspaceFolders?.length ?? 0) > 0;

  if (!hasWorkspace) {
    // Splash: hide sidebar, aux, status bar, activity bar via commands.
    try { await vscode.commands.executeCommand("workbench.action.closeSidebar"); } catch {}
    try { await vscode.commands.executeCommand("workbench.action.closeAuxiliaryBar"); } catch {}
    try { await vscode.commands.executeCommand("workbench.action.closePanel"); } catch {}

    // Status bar: toggle if currently visible
    const cfg = vscode.workspace.getConfiguration();
    if (cfg.get<boolean>("workbench.statusBar.visible", true) !== false) {
      try { await cfg.update("workbench.statusBar.visible", false, vscode.ConfigurationTarget.Global); } catch {}
    }
    // Activity bar: hide
    if (cfg.get<string>("workbench.activityBar.location", "default") !== "hidden") {
      try { await cfg.update("workbench.activityBar.location", "hidden", vscode.ConfigurationTarget.Global); } catch {}
    }

    // Show the launcher full-bleed
    LauncherPanel.createOrShow(context);
  } else {
    // IDE mode: restore chrome, close launcher, dock agent right.
    LauncherPanel.hide();

    const cfg = vscode.workspace.getConfiguration();
    if (cfg.get<boolean>("workbench.statusBar.visible", true) === false) {
      try { await cfg.update("workbench.statusBar.visible", true, vscode.ConfigurationTarget.Global); } catch {}
    }
    if (cfg.get<string>("workbench.activityBar.location", "default") === "hidden") {
      try { await cfg.update("workbench.activityBar.location", "default", vscode.ConfigurationTarget.Global); } catch {}
    }

    await checkForRoscodeProjectGlobal();

    // Pin the bottom panel to the right so the agent is always a sidekick
    try { await vscode.commands.executeCommand("workbench.action.positionPanelRight"); } catch {}
    try { await vscode.commands.executeCommand("workbench.action.focusPanel"); } catch {}
    try { await vscode.commands.executeCommand("workbench.view.extension.roscode-agent"); } catch {}
    try { await vscode.commands.executeCommand("roscode.agent.focus"); } catch {}
  }
}

/** Lift the inline `checkForRoscodeProject` to module scope so splash/IDE
 * switcher can call it without closure access. */
async function checkForRoscodeProjectGlobal() {
  const configs = await vscode.workspace.findFiles(".roscode/config.json", null, 1);
  if (configs.length > 0) {
    await vscode.commands.executeCommand("roscode.openStudio");
  }
}


async function applyFirstRunDefaults(context: vscode.ExtensionContext) {
  // Version bump: force re-apply when we add new settings
  const SETTINGS_VERSION = 5;
  if (context.globalState.get("roscode.defaultsVersion", 0) >= SETTINGS_VERSION) return;

  const updates: Array<[string, unknown, string]> = [
    ["workbench.colorTheme",             "roscode dark",        "workbench"],
    ["workbench.startupEditor",          "none",                 "workbench"],
    ["workbench.tips.enabled",           false,                  "workbench"],
    ["workbench.editor.empty.hint",      "hidden",               "workbench"],
    ["workbench.welcomePage.walkthroughs.openOnInstall", false,  "workbench"],
    // Title bar — native File/Edit menu stays (user wants it); commandCenter as search
    ["window.titleBarStyle",             "custom",               "window"],
    ["window.commandCenter",             true,                   "window"],
    ["window.menuBarVisibility",         "classic",              "window"],
    ["window.title",                     "roscode/studio${separator}${rootName}${dirty}", "window"],
    // Dock the bottom panel (where AGT lives) to the RIGHT so the agent is
    // always visible as a side companion, Cursor-style.
    ["workbench.panel.defaultLocation",  "right",                "workbench"],
    ["workbench.panel.opensMaximized",   "never",                "workbench"],
    ["workbench.secondarySideBar.defaultVisibility", "visible",  "workbench"],
    // Telemetry / suggestions off
    ["telemetry.telemetryLevel",         "off",                  "telemetry"],
    ["extensions.ignoreRecommendations", true,                   "extensions"],
    ["extensions.showRecommendationsOnlyOnDemand", true,         "extensions"],
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
    // Editor niceties
    ["editor.fontSize",                  13,                     "editor"],
    ["editor.lineHeight",                1.55,                   "editor"],
    ["editor.fontLigatures",             true,                   "editor"],
    ["editor.smoothScrolling",           true,                   "editor"],
    ["editor.cursorBlinking",            "smooth",               "editor"],
    ["editor.cursorSmoothCaretAnimation","on",                   "editor"],
    ["editor.minimap.enabled",           true,                   "editor"],
    ["editor.bracketPairColorization.enabled", true,             "editor"],
    ["breadcrumbs.enabled",              false,                  "breadcrumbs"],
    // Don't show the Explorer/Search/etc. views container on startup
    ["workbench.activityBar.location",   "default",              "workbench"],
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
