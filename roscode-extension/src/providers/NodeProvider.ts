import * as vscode from "vscode";
import type { RosConnection } from "../ros/connection";

export class NodeProvider implements vscode.TreeDataProvider<vscode.TreeItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;
  private _nodes: string[] = [];

  constructor(private readonly ros: RosConnection) {}

  refresh(): void {
    this.ros.listNodes().then((nodes) => {
      this._nodes = nodes;
      this._onDidChangeTreeData.fire();
    });
  }

  getTreeItem(el: vscode.TreeItem): vscode.TreeItem { return el; }

  getChildren(): vscode.TreeItem[] {
    if (!this.ros.robot) return [hint("Connect to a robot first")];
    if (this._nodes.length === 0) return [hint("No nodes running")];
    return this._nodes.map((n) => {
      const item = new vscode.TreeItem(n, vscode.TreeItemCollapsibleState.None);
      item.iconPath = new vscode.ThemeIcon("circle-outline");
      item.description = n.split("/")[1] ?? "";
      return item;
    });
  }
}

function hint(msg: string): vscode.TreeItem {
  const item = new vscode.TreeItem(msg, vscode.TreeItemCollapsibleState.None);
  item.iconPath = new vscode.ThemeIcon("info");
  return item;
}
