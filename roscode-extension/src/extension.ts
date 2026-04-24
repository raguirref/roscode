import * as vscode from "vscode";
import { NetworkProvider } from "./providers/NetworkProvider";
import { PackageProvider } from "./providers/PackageProvider";
import { TopicProvider } from "./providers/TopicProvider";
import { NodeProvider } from "./providers/NodeProvider";
import { AgentPanel } from "./panels/AgentPanel";
import { NodeGraphPanel } from "./panels/NodeGraphPanel";
import { TopicMonitorPanel } from "./panels/TopicMonitorPanel";
import { RosConnection } from "./ros/connection";

export let rosConnection: RosConnection;

export function activate(context: vscode.ExtensionContext) {
  rosConnection = new RosConnection();

  const networkProvider = new NetworkProvider(context, rosConnection);
  const packageProvider = new PackageProvider(rosConnection);
  const topicProvider = new TopicProvider(rosConnection);
  const nodeProvider = new NodeProvider(rosConnection);

  vscode.window.registerTreeDataProvider("roscode.network", networkProvider);
  vscode.window.registerTreeDataProvider("roscode.packages", packageProvider);
  vscode.window.registerTreeDataProvider("roscode.topics", topicProvider);
  vscode.window.registerTreeDataProvider("roscode.nodes", nodeProvider);

  context.subscriptions.push(
    vscode.commands.registerCommand("roscode.openAgent", () => {
      AgentPanel.createOrShow(context, rosConnection);
    }),

    vscode.commands.registerCommand("roscode.openNodeGraph", () => {
      NodeGraphPanel.createOrShow(context, rosConnection);
    }),

    vscode.commands.registerCommand("roscode.openTopicMonitor", () => {
      TopicMonitorPanel.createOrShow(context, rosConnection);
    }),

    vscode.commands.registerCommand("roscode.discoverNetwork", () => {
      networkProvider.refresh();
      vscode.window.showInformationMessage("Scanning network for ROS instances…");
    }),

    vscode.commands.registerCommand("roscode.connectRobot", async (item) => {
      await rosConnection.connect(item.robot);
      topicProvider.refresh();
      nodeProvider.refresh();
      vscode.window.showInformationMessage(`Connected to ${item.robot.hostname} (${item.robot.ip})`);
    }),

    vscode.commands.registerCommand("roscode.runLaunchFile", async (uri?: vscode.Uri) => {
      const fileUri = uri ?? vscode.window.activeTextEditor?.document.uri;
      if (!fileUri) return;
      await rosConnection.runLaunchFile(fileUri.fsPath);
    }),

    vscode.commands.registerCommand("roscode.echoTopic", (item) => {
      TopicMonitorPanel.createOrShow(context, rosConnection, item?.topicName);
    }),

    // Open agent on startup if no workspace folder open yet
    vscode.commands.registerCommand("roscode.showWelcome", () => {
      AgentPanel.createOrShow(context, rosConnection);
    })
  );

  // Auto-open agent panel on first activation
  if (context.globalState.get("roscode.firstRun", true)) {
    context.globalState.update("roscode.firstRun", false);
    AgentPanel.createOrShow(context, rosConnection);
  }

  // Status bar item showing connection state
  const statusItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
  statusItem.command = "roscode.openAgent";
  context.subscriptions.push(statusItem);

  rosConnection.onStatusChange((s) => {
    if (s === "connected") {
      statusItem.text = "$(circle-filled) ROS";
      statusItem.tooltip = `roscode: connected to ${rosConnection.connectedHost}`;
      statusItem.backgroundColor = undefined;
      topicProvider.refresh();
      nodeProvider.refresh();
    } else if (s === "disconnected") {
      statusItem.text = "$(circle-outline) ROS offline";
      statusItem.tooltip = "roscode: no ROS connection — click to open agent";
      topicProvider.refresh();
      nodeProvider.refresh();
    } else {
      statusItem.text = "$(loading~spin) ROS…";
    }
    statusItem.show();
  });

  statusItem.text = "$(circle-outline) ROS offline";
  statusItem.show();

  // Kick off passive network scan in background
  networkProvider.refresh();
}

export function deactivate() {
  rosConnection?.disconnect();
}
