import * as vscode from "vscode";
import { discoverRosHosts } from "../ros/discovery";
import type { RobotInfo } from "../ros/connection";
import type { RosConnection } from "../ros/connection";

export class NetworkProvider implements vscode.TreeDataProvider<NetworkItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<NetworkItem | undefined | void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private _robots: RobotInfo[] = [];
  private _scanning = false;

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly ros: RosConnection
  ) {
    ros.onStatusChange(() => this._onDidChangeTreeData.fire());
  }

  refresh(): void {
    if (this._scanning) return;
    this._scanning = true;
    this._robots = [];
    this._onDidChangeTreeData.fire();

    const timeout = vscode.workspace
      .getConfiguration("roscode")
      .get<number>("networkScanTimeout", 3000);

    discoverRosHosts(
      (robot) => {
        this._robots.push(robot);
        this._onDidChangeTreeData.fire();
      },
      timeout
    ).finally(() => {
      this._scanning = false;
      this._onDidChangeTreeData.fire();
    });
  }

  getTreeItem(el: NetworkItem): vscode.TreeItem { return el; }

  getChildren(el?: NetworkItem): NetworkItem[] {
    if (!el) {
      if (this._scanning && this._robots.length === 0) {
        return [new ScanningItem()];
      }
      if (this._robots.length === 0) {
        return [new EmptyItem()];
      }
      return this._robots.map((r) => new RobotItem(r, this.ros));
    }
    return [];
  }
}

class RobotItem extends vscode.TreeItem {
  readonly contextValue = "robot";
  readonly robot: RobotInfo;

  constructor(robot: RobotInfo, ros: RosConnection) {
    const isConnected = ros.robot?.ip === robot.ip;
    super(
      robot.hostname !== robot.ip ? robot.hostname : robot.ip,
      vscode.TreeItemCollapsibleState.None
    );
    this.robot = robot;
    this.description = `${robot.ip} · ${robot.rosVersion.toUpperCase()}`;
    this.tooltip = `${robot.ip}\n${robot.rosVersion === "ros1"
      ? `ROS_MASTER_URI: http://${robot.ip}:${robot.masterPort}`
      : `ROS_DOMAIN_ID: ${robot.domainId}`}`;
    this.iconPath = new vscode.ThemeIcon(
      isConnected ? "circle-filled" : "vm",
      isConnected
        ? new vscode.ThemeColor("terminal.ansiGreen")
        : new vscode.ThemeColor("foreground")
    );
    if (!isConnected) {
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
    super("Scanning network…", vscode.TreeItemCollapsibleState.None);
    this.iconPath = new vscode.ThemeIcon("loading~spin");
  }
}

class EmptyItem extends vscode.TreeItem {
  constructor() {
    super("No ROS hosts found", vscode.TreeItemCollapsibleState.None);
    this.iconPath = new vscode.ThemeIcon("info");
    this.description = "Check network / start ROS";
  }
}
