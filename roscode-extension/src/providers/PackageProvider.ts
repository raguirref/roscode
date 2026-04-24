import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";
import type { RosConnection } from "../ros/connection";

interface RosPackage {
  name: string;
  path: string;
  launchFiles: string[];
  version?: string;
}

export class PackageProvider implements vscode.TreeDataProvider<PackageItem | LaunchItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;
  private _packages: RosPackage[] = [];

  constructor(private readonly ros: RosConnection) {
    // Watch workspace for package.xml changes
    const watcher = vscode.workspace.createFileSystemWatcher("**/package.xml");
    watcher.onDidCreate(() => this.scan());
    watcher.onDidDelete(() => this.scan());
    this.scan();
  }

  refresh(): void { this.scan(); }

  private scan(): void {
    this._packages = [];
    const folders = vscode.workspace.workspaceFolders ?? [];
    for (const folder of folders) {
      this._packages.push(...findPackages(folder.uri.fsPath));
    }
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(el: PackageItem | LaunchItem): vscode.TreeItem { return el; }

  getChildren(el?: PackageItem | LaunchItem): Array<PackageItem | LaunchItem> {
    if (!el) {
      if (this._packages.length === 0) return [hint("Open a ROS workspace folder")];
      return this._packages.map((p) => new PackageItem(p));
    }
    if (el instanceof PackageItem && el.pkg.launchFiles.length > 0) {
      return el.pkg.launchFiles.map((f) => new LaunchItem(f, el.pkg.path));
    }
    return [];
  }
}

class PackageItem extends vscode.TreeItem {
  readonly pkg: RosPackage;
  constructor(pkg: RosPackage) {
    super(
      pkg.name,
      pkg.launchFiles.length > 0
        ? vscode.TreeItemCollapsibleState.Collapsed
        : vscode.TreeItemCollapsibleState.None
    );
    this.pkg = pkg;
    this.description = pkg.version;
    this.tooltip = pkg.path;
    this.iconPath = new vscode.ThemeIcon("package");
    this.resourceUri = vscode.Uri.file(pkg.path);
  }
}

class LaunchItem extends vscode.TreeItem {
  readonly contextValue = "launchFile";
  constructor(file: string, pkgPath: string) {
    super(path.basename(file), vscode.TreeItemCollapsibleState.None);
    this.iconPath = new vscode.ThemeIcon("play");
    this.resourceUri = vscode.Uri.file(path.join(pkgPath, file));
    this.command = {
      command: "roscode.runLaunchFile",
      title: "Run",
      arguments: [this.resourceUri],
    };
  }
}

function hint(msg: string): any {
  const item = new vscode.TreeItem(msg, vscode.TreeItemCollapsibleState.None);
  item.iconPath = new vscode.ThemeIcon("info");
  return item;
}

function findPackages(root: string, depth = 0): RosPackage[] {
  if (depth > 5) return [];
  const results: RosPackage[] = [];
  try {
    const xmlPath = path.join(root, "package.xml");
    if (fs.existsSync(xmlPath)) {
      const xml = fs.readFileSync(xmlPath, "utf8");
      const nameMatch = xml.match(/<name>([^<]+)<\/name>/);
      const versionMatch = xml.match(/<version>([^<]+)<\/version>/);
      const launchDir = path.join(root, "launch");
      const launchFiles = fs.existsSync(launchDir)
        ? fs.readdirSync(launchDir)
            .filter((f) => f.endsWith(".launch") || f.endsWith(".launch.py") || f.endsWith(".yaml"))
            .map((f) => path.join("launch", f))
        : [];
      results.push({
        name: nameMatch?.[1] ?? path.basename(root),
        path: root,
        version: versionMatch?.[1],
        launchFiles,
      });
      return results; // don't recurse into a package
    }
    const entries = fs.readdirSync(root, { withFileTypes: true });
    for (const e of entries) {
      if (e.isDirectory() && !e.name.startsWith(".") && e.name !== "node_modules" && e.name !== "build" && e.name !== "install") {
        results.push(...findPackages(path.join(root, e.name), depth + 1));
      }
    }
  } catch {}
  return results;
}
