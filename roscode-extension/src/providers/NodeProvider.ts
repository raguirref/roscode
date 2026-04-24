import * as vscode from "vscode";
import type { RosConnection } from "../ros/connection";

export class NodeProvider implements vscode.TreeDataProvider<vscode.TreeItem> {
  private _onChange = new vscode.EventEmitter<void>();
  readonly onDidChangeTreeData = this._onChange.event;

  private _nodes: string[] = [];
  private _filter = "";

  constructor(private readonly ros: RosConnection) {}

  refresh(): void {
    this.ros.listNodes().then((nodes) => {
      this._nodes = nodes.sort();
      this._onChange.fire();
    });
  }

  async search(): Promise<void> {
    if (!this.ros.robot) {
      vscode.window.showInformationMessage("Connect to a robot first to search nodes.");
      return;
    }
    const pick = await vscode.window.showQuickPick(
      (this._nodes.length === 0
        ? await this.ros.listNodes().then((ns) => { this._nodes = ns.sort(); return ns; })
        : this._nodes
      ).map((n) => ({
        label: n,
        description: n.split("/")[1] || "",
        node: n,
      })),
      { placeHolder: "Search running ROS nodes…", matchOnDescription: true }
    );
    if (pick) {
      this._filter = pick.node;
      this._onChange.fire();
    }
  }

  clearFilter(): void {
    this._filter = "";
    this._onChange.fire();
  }

  getTreeItem(el: vscode.TreeItem): vscode.TreeItem { return el; }

  getChildren(): vscode.TreeItem[] {
    if (!this.ros.robot) return [];
    if (this._nodes.length === 0) {
      return [hint("No nodes running")];
    }

    const filtered = this._filter
      ? this._nodes.filter((n) => n.toLowerCase().includes(this._filter.toLowerCase()))
      : this._nodes;

    if (filtered.length === 0) return [hint(`No match for "${this._filter}"`)];

    const items: vscode.TreeItem[] = [];
    if (this._filter) {
      const clear = new vscode.TreeItem(`Filter: ${this._filter}`, vscode.TreeItemCollapsibleState.None);
      clear.iconPath = new vscode.ThemeIcon("filter-filled");
      clear.description = "× clear";
      clear.command = { command: "roscode.clearNodeFilter", title: "Clear filter" };
      items.push(clear);
    }
    for (const n of filtered) {
      const item = new vscode.TreeItem(n.split("/").pop() || n, vscode.TreeItemCollapsibleState.None);
      item.description = n.substring(0, n.length - (n.split("/").pop() || "").length).replace(/\/$/, "") || "/";
      item.iconPath = new vscode.ThemeIcon("circle-filled", new vscode.ThemeColor("charts.blue"));
      item.tooltip = n;
      item.contextValue = "node";
      items.push(item);
    }
    return items;
  }
}

function hint(msg: string): vscode.TreeItem {
  const it = new vscode.TreeItem(msg, vscode.TreeItemCollapsibleState.None);
  it.iconPath = new vscode.ThemeIcon("info");
  return it;
}
