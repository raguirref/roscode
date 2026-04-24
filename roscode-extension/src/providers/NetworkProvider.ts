import * as vscode from "vscode";
import { discoverRosHosts } from "../ros/discovery";
import type { RobotInfo, RosConnection } from "../ros/connection";

type RobotsListener = (count: number, scanning: boolean) => void;

export class NetworkProvider implements vscode.TreeDataProvider<vscode.TreeItem> {
  private _onChange = new vscode.EventEmitter<vscode.TreeItem | undefined | void>();
  readonly onDidChangeTreeData = this._onChange.event;

  private _robots: RobotInfo[] = [];
  private _scanning = false;
  private _listeners: RobotsListener[] = [];

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly ros: RosConnection
  ) {
    ros.onStatusChange(() => this._onChange.fire());
  }

  onRobotsChanged(cb: RobotsListener) { this._listeners.push(cb); }
  fireChange() { this._onChange.fire(); }

  private notify() {
    for (const l of this._listeners) l(this._robots.length, this._scanning);
  }

  refresh(): void {
    if (this._scanning) return;
    this._scanning = true;
    this._robots = [];
    this._onChange.fire();
    this.notify();

    const timeout = vscode.workspace
      .getConfiguration("roscode")
      .get<number>("networkScanTimeout", 4000);

    discoverRosHosts((robot) => {
      if (!this._robots.find((r) => r.ip === robot.ip)) {
        this._robots.push(robot);
        this._onChange.fire();
        this.notify();
      }
    }, timeout).finally(() => {
      this._scanning = false;
      this._onChange.fire();
      this.notify();
    });
  }

  getTreeItem(el: vscode.TreeItem): vscode.TreeItem { return el; }

  getChildren(): vscode.TreeItem[] {
    const items: vscode.TreeItem[] = [];
    if (this._scanning) items.push(new ScanningItem());
    for (const r of this._robots) items.push(new RobotItem(r, this.ros));
    return items;
  }
}

class RobotItem extends vscode.TreeItem {
  readonly robot: RobotInfo;
  constructor(robot: RobotInfo, ros: RosConnection) {
    const isConnected = ros.robot?.ip === robot.ip;
    const label = robot.hostname !== robot.ip ? robot.hostname : robot.ip;
    super(label, vscode.TreeItemCollapsibleState.None);
    this.robot = robot;
    this.description = `${robot.ip} · ${robot.rosVersion === "ros1" ? "ROS 1" : "ROS 2"}`;
    if (isConnected) {
      this.contextValue = "robot-connected";
      this.iconPath = new vscode.ThemeIcon("circle-filled", new vscode.ThemeColor("charts.green"));
      this.tooltip = new vscode.MarkdownString(
        `**${label}** ✓ connected\n\n\`${robot.ip}\`\n\n` +
          (robot.rosVersion === "ros1"
            ? `ROS_MASTER_URI: http://${robot.ip}:${robot.masterPort}`
            : `ROS_DOMAIN_ID: ${robot.domainId ?? 0}`)
      );
    } else {
      this.contextValue = "robot-disconnected";
      this.iconPath = new vscode.ThemeIcon("vm");
      this.tooltip = new vscode.MarkdownString(
        `**${label}**\n\n\`${robot.ip}\`\n\n_Click to connect_`
      );
      this.command = {
        command: "roscode.connectRobot",
        title: "Connect",
        arguments: [this],
      };
    }
  }
}

class ScanningItem extends vscode.TreeItem {
  constructor() {
    super("Scanning LAN…", vscode.TreeItemCollapsibleState.None);
    this.iconPath = new vscode.ThemeIcon("loading~spin");
    this.description = "port 11311 / DDS";
  }
}
