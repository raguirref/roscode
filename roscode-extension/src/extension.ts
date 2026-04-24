import * as vscode from "vscode";
import { NetworkProvider } from "./providers/NetworkProvider";
import { TopicProvider } from "./providers/TopicProvider";
import { NodeProvider } from "./providers/NodeProvider";
import { AgentView } from "./views/AgentView";
import { HomeView } from "./views/HomeView";
import { NodeGraphPanel } from "./panels/NodeGraphPanel";
import { TopicMonitorPanel } from "./panels/TopicMonitorPanel";
import { RosConnection } from "./ros/connection";
import { applyWorkbenchBranding } from "./branding/workbenchBrand";

export let rosConnection: RosConnection;

export async function activate(context: vscode.ExtensionContext) {
  // Auto-apply roscode theme
  const wbCfg = vscode.workspace.getConfiguration("workbench");
  if (wbCfg.get("colorTheme") !== "roscode dark") {
    await wbCfg.update("colorTheme", "roscode dark", vscode.ConfigurationTarget.Global);
  }

  // Inject roscode workbench branding (CSS into workbench.html)
  applyWorkbenchBranding(context).catch((e) =>
    console.error("roscode: branding failed", e)
  );

  rosConnection = new RosConnection();

  // Providers
  const networkProvider = new NetworkProvider(context, rosConnection);
  const topicProvider   = new TopicProvider(rosConnection);
  const nodeProvider    = new NodeProvider(rosConnection);

  // Views
  const homeView  = new HomeView(context, rosConnection);
  const agentView = new AgentView(context, rosConnection);

  context.subscriptions.push(
    vscode.window.registerTreeDataProvider("roscode.network", networkProvider),
    vscode.window.registerTreeDataProvider("roscode.topics",  topicProvider),
    vscode.window.registerTreeDataProvider("roscode.nodes",   nodeProvider),
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
    )
  );

  // Initial state contexts
  vscode.commands.executeCommand("setContext", "roscode.connected", false);
  vscode.commands.executeCommand("setContext", "roscode.scanning", false);
  vscode.commands.executeCommand("setContext", "roscode.robotCount", 0);

  // Auto-scan on activation
  networkProvider.refresh();
}

export function deactivate() {
  rosConnection?.disconnect();
}
