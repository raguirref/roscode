import * as vscode from "vscode";
import type { RosConnection } from "../ros/connection";

export class TopicProvider implements vscode.TreeDataProvider<TopicItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;
  private _topics: Array<{ name: string; type: string }> = [];

  constructor(private readonly ros: RosConnection) {}

  refresh(): void {
    this.ros.listTopics().then((topics) => {
      this._topics = topics;
      this._onDidChangeTreeData.fire();
    });
  }

  getTreeItem(el: TopicItem): vscode.TreeItem { return el; }

  getChildren(): TopicItem[] {
    if (!this.ros.robot) return [new HintItem("Connect to a robot first")];
    if (this._topics.length === 0) return [new HintItem("No topics — is ROS running?")];
    return this._topics.map((t) => new TopicItem(t.name, t.type));
  }
}

class TopicItem extends vscode.TreeItem {
  readonly contextValue = "topic";
  readonly topicName: string;

  constructor(name: string, type: string) {
    super(name, vscode.TreeItemCollapsibleState.None);
    this.topicName = name;
    this.description = type.split("/").pop();
    this.tooltip = type;
    this.iconPath = new vscode.ThemeIcon("pulse");
    this.command = { command: "roscode.echoTopic", title: "Echo", arguments: [this] };
  }
}

class HintItem extends vscode.TreeItem {
  constructor(msg: string) {
    super(msg, vscode.TreeItemCollapsibleState.None);
    this.iconPath = new vscode.ThemeIcon("info");
  }
}
