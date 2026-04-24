import * as vscode from "vscode";
import { NetworkProvider } from "./providers/NetworkProvider";
import { TopicProvider } from "./providers/TopicProvider";
import { NodeProvider } from "./providers/NodeProvider";
import { LibraryProvider } from "./providers/LibraryProvider";
import { AgentView } from "./views/AgentView";
import { HomeView } from "./views/HomeView";
import { NodeGraphPanel } from "./panels/NodeGraphPanel";
import { TopicMonitorPanel } from "./panels/TopicMonitorPanel";
import { RosConnection } from "./ros/connection";
import { applyWorkbenchBranding } from "./branding/workbenchBrand";
import { inlineAsk } from "./agent/inlineAsk";

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
    })
  );

  // Initial state contexts
  vscode.commands.executeCommand("setContext", "roscode.connected", false);
  vscode.commands.executeCommand("setContext", "roscode.scanning", false);
  vscode.commands.executeCommand("setContext", "roscode.robotCount", 0);

  // Auto-scan on activation
  networkProvider.refresh();

  // On first launch, open the agent + walkthrough, and try to pin agent to right
  if (context.globalState.get("roscode.firstLaunch", true)) {
    context.globalState.update("roscode.firstLaunch", false);
    setTimeout(async () => {
      await vscode.commands.executeCommand("workbench.view.extension.roscode-agent");
      await tryPinAgentToRight();
      await vscode.commands.executeCommand(
        "workbench.action.openWalkthrough",
        { category: "roscode.roscode#roscode.gettingStarted" },
        false
      );
    }, 800);
  } else {
    // On every launch, ensure the aux bar is open so the agent is visible
    setTimeout(() => tryPinAgentToRight().catch(() => {}), 600);
  }
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
  if (context.globalState.get("roscode.defaultsApplied", false)) return;

  const updates: Array<[string, unknown, string]> = [
    ["workbench.colorTheme",             "roscode dark",        "workbench"],
    ["workbench.startupEditor",          "none",                 "workbench"],
    ["workbench.tips.enabled",           false,                  "workbench"],
    ["workbench.editor.empty.hint",      "hidden",               "workbench"],
    ["telemetry.telemetryLevel",         "off",                  "telemetry"],
    ["extensions.ignoreRecommendations", true,                   "extensions"],
    ["update.showReleaseNotes",          false,                  "update"],
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
  context.globalState.update("roscode.defaultsApplied", true);
}

export function deactivate() {
  rosConnection?.disconnect();
}
