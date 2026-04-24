import * as vscode from "vscode";
import type { RosConnection } from "../ros/connection";

export class TopicProvider implements vscode.TreeDataProvider<vscode.TreeItem> {
  private _onChange = new vscode.EventEmitter<void>();
  readonly onDidChangeTreeData = this._onChange.event;
  private _topics: Array<{ name: string; type: string }> = [];

  constructor(private readonly ros: RosConnection) {}

  refresh(): void {
    this.ros.listTopics().then((topics) => {
      this._topics = topics.sort((a, b) => a.name.localeCompare(b.name));
      this._onChange.fire();
    });
  }

  getTreeItem(el: vscode.TreeItem): vscode.TreeItem { return el; }

  getChildren(): vscode.TreeItem[] {
    if (!this.ros.robot) return [];
    if (this._topics.length === 0) return [hint("No topics — is the node graph idle?")];
    return this._topics.map((t) => new TopicItem(t.name, t.type));
  }
}

class TopicItem extends vscode.TreeItem {
  readonly contextValue = "topic";
  readonly topicName: string;
  constructor(name: string, type: string) {
    super(name.split("/").pop() || name, vscode.TreeItemCollapsibleState.None);
    this.topicName = name;
    this.description = type.split("/").pop() || "";
    this.tooltip = new vscode.MarkdownString(`\`${name}\`\n\n${type}`);
    this.iconPath = new vscode.ThemeIcon("pulse", new vscode.ThemeColor("charts.purple"));
    this.command = { command: "roscode.echoTopic", title: "Echo", arguments: [this] };
  }
}

function hint(msg: string): vscode.TreeItem {
  const it = new vscode.TreeItem(msg, vscode.TreeItemCollapsibleState.None);
  it.iconPath = new vscode.ThemeIcon("info");
  return it;
}
