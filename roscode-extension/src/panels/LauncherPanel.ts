import * as vscode from "vscode";
import { scaffoldProject } from "../scaffoldProject";

function nonce() {
  let n = "";
  const c = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  for (let i = 0; i < 32; i++) n += c[Math.floor(Math.random() * c.length)];
  return n;
}

export class LauncherPanel {
  public static currentPanel: LauncherPanel | undefined;
  private static readonly viewType = "roscode.launcher";

  private readonly _panel: vscode.WebviewPanel;
  private readonly _context: vscode.ExtensionContext;
  private _disposables: vscode.Disposable[] = [];

  static createOrShow(context: vscode.ExtensionContext): LauncherPanel {
    if (LauncherPanel.currentPanel) {
      LauncherPanel.currentPanel._panel.reveal(vscode.ViewColumn.One);
      return LauncherPanel.currentPanel;
    }
    const panel = vscode.window.createWebviewPanel(
      LauncherPanel.viewType,
      "roscode studio",
      { viewColumn: vscode.ViewColumn.One, preserveFocus: false },
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [context.extensionUri],
      }
    );
    LauncherPanel.currentPanel = new LauncherPanel(panel, context);
    return LauncherPanel.currentPanel;
  }

  static hide() {
    LauncherPanel.currentPanel?._panel.dispose();
  }

  private constructor(panel: vscode.WebviewPanel, context: vscode.ExtensionContext) {
    this._panel = panel;
    this._context = context;
    this._panel.webview.html = this._html();
    this._panel.webview.onDidReceiveMessage((m) => this._handle(m), null, this._disposables);
    this._panel.onDidDispose(() => this._dispose(), null, this._disposables);
    // Close VS Code's extra empty sidebar so the launcher reads as full-bleed.
    setTimeout(() => {
      vscode.commands.executeCommand("workbench.action.closeSidebar").catch(() => {});
    }, 300);
  }

  private _post(msg: object) { this._panel.webview.postMessage(msg); }

  private _sendRecents() {
    const recents: string[] = this._context.globalState.get("roscode.recentProjects", []);
    this._post({ type: "recents", items: recents });
  }

  private _addRecent(dir: string) {
    const key = "roscode.recentProjects";
    let list: string[] = this._context.globalState.get(key, []);
    list = [dir, ...list.filter((p) => p !== dir)].slice(0, 8);
    this._context.globalState.update(key, list);
  }

  private _sendApiKeyStatus() {
    const key = vscode.workspace.getConfiguration("roscode").get<string>("anthropicApiKey") ||
                process.env.ANTHROPIC_API_KEY;
    this._post({ type: "apiKeyStatus", hasKey: !!key });
  }

  private async _handle(msg: any) {
    switch (msg.type) {
      case "ready":
        this._sendRecents();
        this._sendApiKeyStatus();
        break;
      case "newProject":
        await this._newProject(msg.name, msg.robotType, msg.parentDir);
        break;
      case "openProject":
        await this._openProject();
        break;
      case "cloneRepo":
        await this._cloneRepo(msg.url);
        break;
      case "openRecent":
        if (msg.path) {
          const uri = vscode.Uri.file(msg.path);
          await vscode.commands.executeCommand("vscode.openFolder", uri);
        }
        break;
      case "chooseParent":
        await this._chooseParent();
        break;
      case "connect":
        await vscode.commands.executeCommand("roscode.discoverNetwork");
        break;
      case "startRuntime":
        await vscode.commands.executeCommand("roscode.startRuntime");
        break;
      case "openAgent":
        await vscode.commands.executeCommand("roscode.focusAgent");
        break;
      case "agentPrompt":
        await vscode.commands.executeCommand("roscode.focusAgent");
        // TODO: wire prefilled prompt — AgentView would need a message handler.
        break;
      case "openExternal":
        if (msg.url) vscode.env.openExternal(vscode.Uri.parse(msg.url));
        break;
      case "openSettings":
        vscode.commands.executeCommand("workbench.action.openSettings", "roscode.anthropicApiKey");
        break;
    }
  }

  private async _chooseParent() {
    const uris = await vscode.window.showOpenDialog({
      canSelectFolders: true, canSelectFiles: false, canSelectMany: false,
      openLabel: "Choose parent folder",
    });
    if (uris?.[0]) this._post({ type: "parentChosen", path: uris[0].fsPath });
  }

  private async _newProject(name: string, robotType: string, parentDir?: string) {
    if (!name || !robotType) return;
    let parent = parentDir;
    if (!parent) {
      const uris = await vscode.window.showOpenDialog({
        canSelectFolders: true, canSelectFiles: false, canSelectMany: false,
        openLabel: "Create project here", title: "Choose parent folder",
      });
      if (!uris?.[0]) { this._post({ type: "scaffoldCancelled" }); return; }
      parent = uris[0].fsPath;
    }
    try {
      await scaffoldProject(name, robotType as any, parent);
      this._addRecent(parent + "/" + name);
      this._post({ type: "scaffoldDone" });
    } catch (e: any) {
      vscode.window.showErrorMessage("Scaffold failed: " + (e?.message ?? e));
      this._post({ type: "scaffoldCancelled" });
    }
  }

  private async _openProject() {
    const uris = await vscode.window.showOpenDialog({
      canSelectFolders: true, canSelectFiles: false, canSelectMany: false,
      openLabel: "Open Project", title: "Open ROS 2 workspace",
    });
    if (uris?.[0]) {
      this._addRecent(uris[0].fsPath);
      await vscode.commands.executeCommand("vscode.openFolder", uris[0]);
    }
  }

  private async _cloneRepo(url: string) {
    if (!url) return;
    const uris = await vscode.window.showOpenDialog({
      canSelectFolders: true, canSelectFiles: false, canSelectMany: false,
      openLabel: "Clone here", title: "Choose clone destination",
    });
    if (!uris?.[0]) return;
    const dest = uris[0].fsPath;
    const terminal = vscode.window.createTerminal("git clone");
    terminal.show();
    terminal.sendText(`git clone ${url} "${dest}/${url.split("/").pop()?.replace(".git","")}" && echo "Clone done"`);
    vscode.window.showInformationMessage("Cloning repository in terminal…");
  }

  private _dispose() {
    LauncherPanel.currentPanel = undefined;
    this._panel.dispose();
    while (this._disposables.length) {
      const d = this._disposables.pop();
      if (d) d.dispose();
    }
  }

  private _html(): string {
    const n = nonce();
    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta http-equiv="Content-Security-Policy"
  content="default-src 'none'; style-src 'nonce-${n}' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; script-src 'nonce-${n}' 'unsafe-inline';">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" nonce="${n}" href="https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600;700&family=Geist+Mono:wght@400;500;600&display=swap">
<style nonce="${n}">
:root{
  --bg:#0a0c0b; --bg2:#0f1211; --bg3:#121615; --bg4:#181d1b;
  --fg:#e4e6e1; --fg2:#9ea39a; --fg3:#636862;
  --border:#22282660; --border2:#333b38;
  --accent:#f2a83b; --accent-dim:rgba(242,168,59,.10); --accent-line:rgba(242,168,59,.28);
  --accent-glow:rgba(242,168,59,.4);
  --accent2:#6dd3c8;
  --ok:#8bc34a; --warn:#f2c84b; --red:#e06666;
  --font-mono:'Geist Mono','JetBrains Mono',ui-monospace,monospace;
  --font-sans:'Geist','Inter',system-ui,sans-serif;
}
*{box-sizing:border-box;margin:0;padding:0;-webkit-font-smoothing:antialiased}
html,body{height:100%;overflow:hidden;background:var(--bg);color:var(--fg);font-family:var(--font-sans);font-size:13px}
button{cursor:pointer;font-family:inherit;font-size:inherit;border:none;background:none;color:inherit}

#bg-grid{position:fixed;inset:0;pointer-events:none;z-index:0;
  background-image:radial-gradient(rgba(242,168,59,.06) 1px, transparent 1px);
  background-size:22px 22px; opacity:.7}

#page{position:relative;z-index:1;display:grid;grid-template-columns:1fr 320px;gap:0;height:100%;overflow:hidden}

/* ── LEFT · main content ─── */
#main{padding:40px 48px;overflow-y:auto;display:flex;flex-direction:column;gap:30px}

/* ── TOP brand row ─── */
.top{display:flex;align-items:center;justify-content:space-between}
.brand{display:flex;align-items:center;gap:12px}
.brand-logo{width:32px;height:32px;border:1.5px solid var(--accent);border-radius:6px;display:flex;align-items:center;justify-content:center;box-shadow:0 0 12px var(--accent-glow)}
.brand-logo svg{width:18px;height:18px;color:var(--accent)}
.brand-name{font-family:var(--font-mono);font-size:15px;font-weight:600;letter-spacing:.5px;text-transform:uppercase;color:var(--fg)}
.brand-name .accent{color:var(--accent)}
.pills{display:flex;align-items:center;gap:6px}
.pill{font-family:var(--font-mono);font-size:10px;letter-spacing:.8px;text-transform:uppercase;padding:4px 9px;border:1px solid var(--border2);border-radius:3px;color:var(--fg2);display:inline-flex;align-items:center;gap:5px}
.pill.ok::before{content:"";display:inline-block;width:5px;height:5px;border-radius:50%;background:var(--ok);box-shadow:0 0 4px var(--ok)}
.pill.amber::before{content:"";display:inline-block;width:5px;height:5px;border-radius:50%;background:var(--accent)}

/* ── date + heading ─── */
.date{font-family:var(--font-mono);font-size:11px;letter-spacing:2px;color:var(--accent);text-transform:uppercase}
.heading h1{font-family:var(--font-sans);font-size:36px;font-weight:600;line-height:1.1;letter-spacing:-.5px;color:var(--fg);margin-bottom:8px}
.heading .sub{font-family:var(--font-mono);font-size:11px;color:var(--fg3);letter-spacing:.3px}
.heading .sub::before{content:"→ "}

/* ── action cards ─── */
.cards{display:grid;grid-template-columns:repeat(4,1fr);gap:10px}
.card{position:relative;padding:18px 16px;background:var(--bg2);border:1px solid var(--border);border-radius:4px;cursor:pointer;transition:all 120ms;display:flex;flex-direction:column;gap:14px;text-align:left}
.card:hover{border-color:var(--accent-line);background:var(--bg3);transform:translateY(-1px)}
.card:first-child{background:var(--accent-dim);border-color:var(--accent-line)}
.card:first-child:hover{background:rgba(242,168,59,.15)}
.card-icon{width:24px;height:24px;color:var(--accent);display:flex;align-items:center;justify-content:center}
.card-icon svg{width:100%;height:100%}
.card-num{position:absolute;top:14px;right:14px;font-family:var(--font-mono);font-size:10px;color:var(--fg3);letter-spacing:.4px}
.card-label{font-family:var(--font-mono);font-size:12px;font-weight:600;color:var(--fg);letter-spacing:.5px;text-transform:uppercase}
.card-sub{font-family:var(--font-mono);font-size:10px;color:var(--fg3);letter-spacing:.3px}

/* ── recents panel ─── */
.recents{border:1px solid var(--border);border-radius:4px;background:var(--bg2);overflow:hidden;flex:1;min-height:0;display:flex;flex-direction:column}
.recents-head{display:flex;align-items:center;justify-content:space-between;padding:10px 14px;border-bottom:1px solid var(--border);background:var(--bg)}
.recents-head .t{font-family:var(--font-mono);font-size:10px;letter-spacing:1.2px;text-transform:uppercase;color:var(--fg3)}
.recents-head .t::before{content:"// "}
.recents-head .count{font-family:var(--font-mono);font-size:10px;color:var(--fg3);letter-spacing:.4px}
.recents-cols{display:grid;grid-template-columns:26px 1.2fr 2fr 100px 60px 70px;gap:12px;padding:8px 14px;border-bottom:1px solid var(--border);background:var(--bg3)}
.recents-cols span{font-family:var(--font-mono);font-size:9.5px;text-transform:uppercase;color:var(--fg3);letter-spacing:1px}
.recents-list{overflow-y:auto;flex:1}
.r-item{display:grid;grid-template-columns:26px 1.2fr 2fr 100px 60px 70px;gap:12px;padding:10px 14px;border-bottom:1px solid var(--border);cursor:pointer;transition:background 100ms;align-items:center}
.r-item:hover{background:var(--bg3)}
.r-item:last-child{border-bottom:none}
.r-num{font-family:var(--font-mono);font-size:10.5px;color:var(--fg3);letter-spacing:.3px}
.r-name{font-family:var(--font-mono);font-size:12px;color:var(--fg);font-weight:500}
.r-path{font-family:var(--font-mono);font-size:11px;color:var(--fg3);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.r-branch{font-family:var(--font-mono);font-size:10.5px;color:var(--accent);letter-spacing:.3px}
.r-nodes{font-family:var(--font-mono);font-size:11px;color:var(--fg);text-align:right}
.r-last{font-family:var(--font-mono);font-size:10.5px;color:var(--fg3);text-align:right}
.no-recents{padding:24px 14px;text-align:center;font-family:var(--font-mono);font-size:11px;color:var(--fg3);letter-spacing:.3px}

/* ── RIGHT · robot status + agent ─── */
#side{background:var(--bg2);border-left:1px solid var(--border);padding:20px;display:flex;flex-direction:column;gap:16px;overflow-y:auto}
.side-card{border:1px solid var(--border);border-radius:4px;padding:14px;background:var(--bg);display:flex;flex-direction:column;gap:10px}
.side-head{font-family:var(--font-mono);font-size:10px;text-transform:uppercase;letter-spacing:1.2px;color:var(--fg3)}
.side-head::before{content:"// "}
.side-title{font-family:var(--font-mono);font-size:13px;font-weight:600;color:var(--fg);letter-spacing:.4px;display:flex;align-items:center;gap:8px}
.side-title::before{content:"";width:7px;height:7px;border-radius:50%;background:var(--fg3)}
.side-title.ok::before{background:var(--ok);box-shadow:0 0 6px var(--ok)}
.side-kv{display:flex;justify-content:space-between;font-family:var(--font-mono);font-size:11px;color:var(--fg2)}
.side-kv .k{color:var(--fg3)}
.side-btn-row{display:flex;gap:6px;margin-top:4px}
.side-btn{flex:1;padding:7px 10px;font-family:var(--font-mono);font-size:10px;font-weight:600;letter-spacing:.8px;text-transform:uppercase;border-radius:3px;border:1px solid var(--border2);background:transparent;color:var(--fg2);cursor:pointer;transition:all 120ms}
.side-btn:hover{border-color:var(--accent-line);color:var(--fg)}
.side-btn.primary{background:var(--accent);border-color:var(--accent);color:#1a1408}
.side-btn.primary:hover{opacity:.9;color:#1a1408}

/* agent card */
.agent-sub{font-family:var(--font-mono);font-size:10.5px;color:var(--fg2);line-height:1.55}
.suggestions{display:flex;flex-wrap:wrap;gap:6px}
.sugg{padding:5px 10px;border:1px solid var(--border2);border-radius:3px;background:transparent;font-family:var(--font-mono);font-size:10px;color:var(--fg2);cursor:pointer;letter-spacing:.2px}
.sugg:hover{border-color:var(--accent-line);color:var(--accent)}
.agent-input{margin-top:6px;position:relative}
.agent-input input{width:100%;background:var(--bg3);border:1px solid var(--border2);border-radius:3px;padding:9px 12px 9px 26px;color:var(--fg);font-family:var(--font-mono);font-size:11.5px;outline:none;transition:border-color 120ms}
.agent-input input:focus{border-color:var(--accent)}
.agent-input::before{content:">";position:absolute;left:12px;top:50%;transform:translateY(-50%);color:var(--accent);font-family:var(--font-mono);font-size:11.5px;font-weight:600}
.agent-input .k{position:absolute;right:8px;top:50%;transform:translateY(-50%);font-family:var(--font-mono);font-size:9.5px;color:var(--fg3);letter-spacing:.3px}

/* ── modals (scaffolding wizard + clone) — same as before ─── */
.modal-backdrop{display:none;position:fixed;inset:0;background:rgba(10,12,11,.92);align-items:center;justify-content:center;z-index:200}
.modal-backdrop.open{display:flex}
.modal-box{background:var(--bg3);border:1px solid var(--border2);border-radius:8px;width:520px;max-width:calc(100vw - 40px);padding:26px;display:flex;flex-direction:column;gap:18px;box-shadow:0 24px 60px rgba(0,0,0,.6)}
.modal-title{font-family:var(--font-mono);font-size:14px;font-weight:600;color:var(--fg);letter-spacing:.4px;text-transform:uppercase}
.modal-step-label{font-family:var(--font-mono);font-size:10px;font-weight:500;color:var(--accent);letter-spacing:1.5px;text-transform:uppercase}
.modal-step-label::before{content:"// "}
.step{display:none;flex-direction:column;gap:14px}
.step.active{display:flex}
.m-input{background:var(--bg2);border:1px solid var(--border2);border-radius:5px;padding:10px 13px;color:var(--fg);font-family:var(--font-mono);font-size:13px;outline:none;width:100%;transition:border-color 100ms}
.m-input:focus{border-color:var(--accent)}
.m-input::placeholder{color:var(--fg3)}
.m-error{font-family:var(--font-mono);font-size:11px;color:var(--red);min-height:16px}
.m-hint{font-family:var(--font-mono);font-size:11px;color:var(--fg3)}
.modal-actions{display:flex;gap:8px;justify-content:flex-end;margin-top:4px}
.btn-secondary{padding:8px 16px;border-radius:5px;border:1px solid var(--border2);background:transparent;color:var(--fg2);font-family:var(--font-mono);font-size:11px;font-weight:500;letter-spacing:.5px;text-transform:uppercase;cursor:pointer;transition:all 100ms}
.btn-secondary:hover{border-color:var(--fg);color:var(--fg)}
.btn-primary{padding:8px 20px;border-radius:5px;border:1px solid var(--accent);background:var(--accent);color:#1a1408;font-family:var(--font-mono);font-size:11px;font-weight:600;letter-spacing:.5px;text-transform:uppercase;cursor:pointer;transition:opacity 100ms}
.btn-primary:hover{opacity:.9}
.btn-primary:disabled{opacity:.35;cursor:default}
.robot-cards{display:grid;grid-template-columns:1fr 1fr;gap:8px}
.r-card{border:1px solid var(--border);border-radius:5px;padding:13px 11px;cursor:pointer;transition:border-color 100ms,background 100ms;display:flex;flex-direction:column;gap:5px;background:var(--bg2)}
.r-card:hover{border-color:var(--accent-line);background:var(--bg3)}
.r-card.selected{border-color:var(--accent);background:var(--accent-dim)}
.r-card.disabled{opacity:.3;cursor:not-allowed;pointer-events:none}
.r-label{font-family:var(--font-mono);font-size:9px;font-weight:500;color:var(--accent);letter-spacing:1.5px;text-transform:uppercase}
.r-card.disabled .r-label{color:var(--fg3)}
.r-cname{font-family:var(--font-mono);font-size:12px;font-weight:600;color:var(--fg);letter-spacing:.3px;text-transform:uppercase}
.r-desc{font-size:10.5px;color:var(--fg2);line-height:1.4}
.r-badge{font-family:var(--font-mono);font-size:9px;padding:2px 6px;border-radius:3px;background:transparent;border:1px solid var(--border2);color:var(--fg3);width:fit-content;margin-top:2px;letter-spacing:.5px;text-transform:uppercase}
.tree{font-family:ui-monospace,monospace;font-size:11px;color:var(--fg2);background:var(--bg2);border:1px solid var(--border);border-radius:7px;padding:10px 13px;line-height:1.8;max-height:200px;overflow-y:auto}
.tree .t-dir{color:var(--accent)}

@media (max-width: 860px) { #page { grid-template-columns: 1fr; } #side { border-left:none; border-top:1px solid var(--border); } }
</style>
</head>
<body>
<div id="bg-grid"></div>

<div id="page">
  <!-- ═══ Left · main ═══ -->
  <div id="main">
    <div class="top">
      <div class="brand">
        <div class="brand-logo">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="3" y="3" width="18" height="18" rx="3"/>
            <circle cx="12" cy="12" r="2.4" fill="currentColor"/>
          </svg>
        </div>
        <div class="brand-name">ROSCODE<span class="accent">/</span>STUDIO</div>
      </div>
      <div class="pills">
        <span class="pill ok">SYS READY</span>
        <span class="pill">ROS 2 · JAZZY</span>
        <span class="pill">v0.1.0</span>
      </div>
    </div>

    <div class="date" id="date-line">// LOADING DATE…</div>

    <div class="heading">
      <h1>what are we building today?</h1>
      <div class="sub">pick a recent workspace or boot a new session</div>
    </div>

    <div class="cards">
      <button type="button" class="card" id="btn-new">
        <div class="card-num">01</div>
        <div class="card-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
        </div>
        <div class="card-label">NEW PROJECT</div>
        <div class="card-sub">ros 2 template</div>
      </button>
      <button type="button" class="card" id="btn-open">
        <div class="card-num">02</div>
        <div class="card-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M3 6a2 2 0 012-2h4l2 2h8a2 2 0 012 2v10a2 2 0 01-2 2H5a2 2 0 01-2-2V6z"/>
          </svg>
        </div>
        <div class="card-label">OPEN WS</div>
        <div class="card-sub">from disk</div>
      </button>
      <button type="button" class="card" id="btn-clone">
        <div class="card-num">03</div>
        <div class="card-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="6" cy="5" r="2"/><circle cx="18" cy="5" r="2"/><circle cx="6" cy="19" r="2"/>
            <line x1="6" y1="7" x2="6" y2="17"/>
            <path d="M8 5h8M6 17c0-3 3-4 5-4h5"/>
          </svg>
        </div>
        <div class="card-label">CLONE REPO</div>
        <div class="card-sub">git / github</div>
      </button>
      <button type="button" class="card" id="btn-connect">
        <div class="card-num">04</div>
        <div class="card-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="4" y="7" width="16" height="10" rx="2"/>
            <line x1="8" y1="12" x2="16" y2="12"/><line x1="12" y1="9.5" x2="12" y2="14.5"/>
          </svg>
        </div>
        <div class="card-label">CONNECT</div>
        <div class="card-sub">remote · ssh</div>
      </button>
    </div>

    <div class="recents">
      <div class="recents-head">
        <div class="t">RECENT WORKSPACES</div>
        <div class="count" id="rcount">00 total</div>
      </div>
      <div class="recents-cols">
        <span>#</span><span>WORKSPACE</span><span>PATH</span><span>BRANCH</span><span>NODES</span><span>LAST</span>
      </div>
      <div class="recents-list" id="recents-list">
        <div class="no-recents">// NO RECENT WORKSPACES · open one to get started</div>
      </div>
    </div>
  </div>

  <!-- ═══ Right · robot + agent ═══ -->
  <div id="side">
    <div class="side-card">
      <div class="side-head">ROBOT STATUS</div>
      <div class="side-title" id="robot-title">NO ROBOT LINKED</div>
      <div class="side-kv"><span class="k">domain:</span><span id="dom-val">0</span></div>
      <div class="side-kv"><span class="k">network:</span><span id="net-val">192.168.1.0/24</span></div>
      <div class="side-kv"><span class="k">hosts found:</span><span id="hosts-val">— awaiting scan —</span></div>
      <div class="side-btn-row">
        <button type="button" class="side-btn" id="scan-lan">⚛ SCAN LAN</button>
        <button type="button" class="side-btn primary" id="start-ros">▶ START</button>
      </div>
    </div>

    <div class="side-card">
      <div class="side-head">AGENT · CLAUDE HAIKU</div>
      <div class="agent-sub">Your ROS-aware copilot. Ask about graphs, author nodes, debug transforms — with full project context.</div>
      <div class="suggestions">
        <button type="button" class="sugg" data-p="inspect /tf">inspect /tf</button>
        <button type="button" class="sugg" data-p="why is amcl drifting?">why is amcl drifting?</button>
        <button type="button" class="sugg" data-p="new pub/sub">new pub/sub</button>
        <button type="button" class="sugg" data-p="tune nav2">tune nav2</button>
      </div>
      <div class="agent-input">
        <input id="agent-input" type="text" placeholder="ask the agent…" autocomplete="off"/>
        <span class="k">⌘K</span>
      </div>
    </div>

    <div class="side-card" id="key-banner" style="display:none;border-color:rgba(224,102,102,.3);background:rgba(224,102,102,.07)">
      <div class="side-head" style="color:var(--red)">SETUP REQUIRED</div>
      <div class="side-title">ANTHROPIC API KEY</div>
      <div class="side-kv"><span class="k">env var:</span><span>ANTHROPIC_API_KEY</span></div>
      <div class="side-btn-row">
        <button type="button" class="side-btn" id="btn-getkey">GET KEY ↗</button>
        <button type="button" class="side-btn primary" id="btn-opensettings">OPEN SETTINGS</button>
      </div>
    </div>
  </div>
</div>

<!-- ═══ MODALS (wizard + clone — unchanged) ═══ -->
<div class="modal-backdrop" id="modal-overlay">
  <div class="modal-box">
    <div class="modal-title" id="modal-title">NEW · ROS 2 PROJECT</div>
    <div class="step active" id="step1">
      <div class="modal-step-label">Step 01 / 03 — Name</div>
      <input class="m-input" id="proj-name" type="text" placeholder="my_robot" autocomplete="off"/>
      <div class="m-error" id="name-error"></div>
      <div class="m-hint">// lowercase · letters · numbers · underscores · start with a letter</div>
      <div class="modal-actions">
        <button type="button" class="btn-secondary" id="s1-cancel">CANCEL</button>
        <button type="button" class="btn-primary" id="s1-next" disabled>NEXT →</button>
      </div>
    </div>
    <div class="step" id="step2">
      <div class="modal-step-label">Step 02 / 03 — Template</div>
      <div class="robot-cards">
        <div class="r-card" id="rc-diff">
          <div class="r-label">DIFF-DRIVE</div>
          <div class="r-cname">DIFF DRIVE</div>
          <div class="r-desc">non-holonomic · /cmd_vel → /odom</div>
        </div>
        <div class="r-card" id="rc-empty">
          <div class="r-label">EMPTY</div>
          <div class="r-cname">EMPTY</div>
          <div class="r-desc">hello-world publisher · scaffold only</div>
        </div>
        <div class="r-card disabled" id="rc-ack">
          <div class="r-label">ACKERMANN</div>
          <div class="r-cname">ACKERMANN</div>
          <div class="r-desc">car-like steering geometry</div>
          <div class="r-badge">coming soon</div>
        </div>
        <div class="r-card disabled" id="rc-man">
          <div class="r-label">ARM-6DOF</div>
          <div class="r-cname">ARM</div>
          <div class="r-desc">6-dof robotic arm · moveit2</div>
          <div class="r-badge">coming soon</div>
        </div>
      </div>
      <div class="modal-actions">
        <button type="button" class="btn-secondary" id="s2-back">← BACK</button>
        <button type="button" class="btn-primary" id="s2-next" disabled>NEXT →</button>
      </div>
    </div>
    <div class="step" id="step3">
      <div class="modal-step-label">Step 03 / 03 — Confirm</div>
      <div id="tree-preview" class="tree"></div>
      <div class="modal-actions">
        <button type="button" class="btn-secondary" id="s3-back">← BACK</button>
        <button type="button" class="btn-primary" id="btn-create">CREATE →</button>
      </div>
    </div>
  </div>
</div>

<div class="modal-backdrop" id="clone-overlay">
  <div class="modal-box">
    <div class="modal-title">CLONE · GIT REPOSITORY</div>
    <input class="m-input" id="clone-url" type="text" placeholder="https://github.com/org/repo.git"/>
    <div class="modal-actions">
      <button type="button" class="btn-secondary" id="clone-cancel">Cancel</button>
      <button type="button" class="btn-primary" id="clone-go">CLONE</button>
    </div>
  </div>
</div>

<script nonce="${n}">
const vscode = acquireVsCodeApi();
let selectedRobot = '';

// Date line
(function () {
  const now = new Date();
  const pad = n => String(n).padStart(2, '0');
  const d = pad(now.getUTCDate()), m = pad(now.getUTCMonth()+1), y = now.getUTCFullYear();
  const h = pad(now.getUTCHours()), mi = pad(now.getUTCMinutes());
  document.getElementById('date-line').textContent = '// ' + m + ' · ' + d + ' · ' + y + ' — ' + h + ':' + mi + ' UTC';
})();

// ── Message handler
window.addEventListener('message', e => {
  const m = e.data;
  if (m.type === 'recents') renderRecents(m.items);
  if (m.type === 'apiKeyStatus') document.getElementById('key-banner').style.display = m.hasKey ? 'none' : 'flex';
  if (m.type === 'scaffoldDone') closeModal();
  if (m.type === 'scaffoldCancelled') {
    const btn = document.getElementById('btn-create');
    if (btn) { btn.disabled = false; btn.textContent = 'CREATE →'; }
  }
});

// ── Buttons
document.getElementById('btn-new').addEventListener('click', openWizard);
document.getElementById('btn-open').addEventListener('click', () => vscode.postMessage({ type: 'openProject' }));
document.getElementById('btn-clone').addEventListener('click', openCloneModal);
document.getElementById('btn-connect').addEventListener('click', () => vscode.postMessage({ type: 'connect' }));
document.getElementById('scan-lan').addEventListener('click', () => vscode.postMessage({ type: 'connect' }));
document.getElementById('start-ros').addEventListener('click', () => vscode.postMessage({ type: 'startRuntime' }));

document.querySelectorAll('.sugg').forEach(b => b.addEventListener('click', () => {
  vscode.postMessage({ type: 'agentPrompt', text: b.dataset.p });
}));

document.getElementById('agent-input').addEventListener('keydown', e => {
  if (e.key === 'Enter') {
    const text = e.target.value.trim();
    if (text) vscode.postMessage({ type: 'agentPrompt', text });
    e.target.value = '';
  }
});

document.getElementById('btn-getkey')?.addEventListener('click', () => vscode.postMessage({ type:'openExternal', url:'https://console.anthropic.com/settings/keys' }));
document.getElementById('btn-opensettings')?.addEventListener('click', () => vscode.postMessage({ type:'openSettings' }));

// wizard
document.getElementById('s1-cancel').addEventListener('click', closeModal);
document.getElementById('s1-next').addEventListener('click', goStep2);
document.getElementById('s2-back').addEventListener('click', () => goStep(1));
document.getElementById('s2-next').addEventListener('click', goStep3);
document.getElementById('s3-back').addEventListener('click', () => goStep(2));
document.getElementById('btn-create').addEventListener('click', createProject);
document.getElementById('clone-cancel').addEventListener('click', closeCloneModal);
document.getElementById('clone-go').addEventListener('click', doClone);

['diff','empty','ack','man'].forEach(id => {
  const card = document.getElementById('rc-'+id);
  if (card && !card.classList.contains('disabled')) {
    card.addEventListener('click', () => selectRobot(id === 'diff' ? 'diff-drive' : id === 'empty' ? 'empty' : id === 'ack' ? 'ackermann' : 'manipulator'));
  }
});

document.getElementById('modal-overlay').addEventListener('click', e => { if (e.target === e.currentTarget) closeModal(); });
document.getElementById('clone-overlay').addEventListener('click', e => { if (e.target === e.currentTarget) closeCloneModal(); });

document.getElementById('proj-name').addEventListener('input', validateName);
document.getElementById('proj-name').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); goStep2(); } });
document.getElementById('clone-url').addEventListener('keydown', e => { if (e.key === 'Enter') doClone(); });

// ── Recents
function renderRecents(items) {
  const list = document.getElementById('recents-list');
  const count = document.getElementById('rcount');
  if (!items || !items.length) {
    list.innerHTML = '<div class="no-recents">// NO RECENT WORKSPACES · open one to get started</div>';
    count.textContent = '00 total';
    return;
  }
  count.textContent = String(items.length).padStart(2,'0') + ' total';
  list.innerHTML = items.map((p, i) => {
    const parts = p.replace(/\\\\/g, '/').split('/');
    const name = parts[parts.length - 1] || p;
    const dir = (parts.slice(0,-1).join('/') || '').replace(/^\\/Users\\/[^/]+/, '~').replace(/^\\/home\\/[^/]+/, '~');
    const num = String(i+1).padStart(2, '0');
    return '<div class="r-item" data-path="' + p.replace(/"/g,'&quot;') + '">'
      + '<span class="r-num">' + num + '</span>'
      + '<span class="r-name">' + esc(name) + '</span>'
      + '<span class="r-path">' + esc(dir) + '</span>'
      + '<span class="r-branch">main</span>'
      + '<span class="r-nodes">—</span>'
      + '<span class="r-last">recent</span>'
      + '</div>';
  }).join('');
  list.querySelectorAll('.r-item').forEach(btn => {
    btn.addEventListener('click', () => vscode.postMessage({ type:'openRecent', path: btn.dataset.path }));
  });
}
function esc(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

// ── Wizard
function openWizard() {
  selectedRobot = '';
  document.getElementById('proj-name').value = '';
  document.getElementById('name-error').textContent = '';
  document.getElementById('s1-next').disabled = true;
  document.getElementById('s2-next').disabled = true;
  ['diff','empty','ack','man'].forEach(id => document.getElementById('rc-'+id)?.classList.remove('selected'));
  goStep(1);
  document.getElementById('modal-overlay').classList.add('open');
  setTimeout(() => document.getElementById('proj-name').focus(), 60);
}
function closeModal() { document.getElementById('modal-overlay').classList.remove('open'); }
function goStep(n) {
  [1,2,3].forEach(i => document.getElementById('step'+i).classList.toggle('active', i===n));
  document.getElementById('modal-title').textContent = n===1 ? 'NEW · ROS 2 PROJECT' : n===2 ? 'PICK A TEMPLATE' : 'CONFIRM · CREATE';
}
function goStep2() { if (!validateNameNow()) return; goStep(2); }
function goStep3() {
  if (!selectedRobot) return;
  document.getElementById('tree-preview').innerHTML = buildTree(document.getElementById('proj-name').value.trim(), selectedRobot);
  goStep(3);
}
function validateName() {
  const val = document.getElementById('proj-name').value.trim();
  const ok = /^[a-z][a-z0-9_]*$/.test(val) && val.length >= 2;
  document.getElementById('name-error').textContent = val.length > 0 && !ok ? 'Use lowercase letters, numbers, underscores — start with a letter' : '';
  document.getElementById('s1-next').disabled = !ok;
}
function validateNameNow() { return /^[a-z][a-z0-9_]*$/.test(document.getElementById('proj-name').value.trim()); }
function selectRobot(type) {
  selectedRobot = type;
  const map = {'diff-drive':'diff','empty':'empty','ackermann':'ack','manipulator':'man'};
  ['diff','empty','ack','man'].forEach(id => document.getElementById('rc-'+id)?.classList.remove('selected'));
  document.getElementById('rc-'+map[type])?.classList.add('selected');
  document.getElementById('s2-next').disabled = false;
}
function buildTree(name, type) {
  return [
    '<span class="t-dir">' + name + '/</span>',
    '├── <span class="t-dir">.roscode/</span>  <span style="color:var(--fg3)">config.json</span>',
    '├── <span class="t-dir">src/' + name + '/</span>',
    '│   ├── <span style="color:var(--fg2)">package.xml</span>  <span style="color:var(--fg2)">setup.py</span>',
    '│   ├── <span class="t-dir">' + name + '/</span>  <span style="color:var(--fg2)">' + name + '_node.py</span>',
    '│   └── <span class="t-dir">launch/</span>  <span style="color:var(--fg2)">launch.py</span>',
    '└── <span class="t-dir">runtime/</span>  <span style="color:var(--fg2)">docker-compose.yml</span>',
  ].join('\\n');
}
function createProject() {
  const btn = document.getElementById('btn-create');
  btn.disabled = true; btn.textContent = 'Creating…';
  vscode.postMessage({ type:'newProject', name: document.getElementById('proj-name').value.trim(), robotType: selectedRobot });
}
function openCloneModal() {
  document.getElementById('clone-url').value = '';
  document.getElementById('clone-overlay').classList.add('open');
  setTimeout(() => document.getElementById('clone-url').focus(), 60);
}
function closeCloneModal() { document.getElementById('clone-overlay').classList.remove('open'); }
function doClone() {
  const url = document.getElementById('clone-url').value.trim();
  if (!url) return;
  closeCloneModal();
  vscode.postMessage({ type:'cloneRepo', url });
}

vscode.postMessage({ type: 'ready' });
</script>
</body>
</html>`;
  }
}
