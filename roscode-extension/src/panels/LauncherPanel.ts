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
    // Close VS Code's panel (SCM/terminal area) so it doesn't show through
    setTimeout(() => {
      vscode.commands.executeCommand("workbench.action.closePanel").catch(() => {});
      vscode.commands.executeCommand("workbench.action.closeSidebar").catch(() => {});
    }, 150);
    setTimeout(() => {
      vscode.commands.executeCommand("workbench.action.closePanel").catch(() => {});
    }, 800);
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
    // If parentDir not provided, ask
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
    terminal.sendText(`git clone ${url} "${dest}/${url.split("/").pop()?.replace(".git","")}" && echo "✅ Clone done"`);
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
  content="default-src 'none'; style-src 'nonce-${n}' 'unsafe-inline'; script-src 'nonce-${n}' 'unsafe-inline';">
<style nonce="${n}">
:root{
  --bg:#080c10; --bg2:#0d1117; --bg3:#161b22; --bg4:#21262d;
  --fg:#e6edf3; --fg2:#8b949e; --fg3:#484f58;
  --border:#21262d; --border2:#30363d;
  --accent:#4cc9f0; --accent-dim:rgba(76,201,240,.12);
  --red:#f85149;
}
*{box-sizing:border-box;margin:0;padding:0;-webkit-font-smoothing:antialiased}
html,body{height:100%;overflow:hidden;background:var(--bg);color:var(--fg);
  font-family:'Inter',-apple-system,BlinkMacSystemFont,system-ui,sans-serif;font-size:13px}
button{cursor:pointer;font-family:inherit;font-size:inherit;border:none;background:none}

/* ── BACKGROUND PATTERN ─── */
#bg-grid{
  position:fixed;inset:0;pointer-events:none;z-index:0;
  background-image:radial-gradient(circle at 50% 20%, rgba(76,201,240,.06) 0%, transparent 60%),
    radial-gradient(rgba(76,201,240,.04) 1px, transparent 1px);
  background-size:100% 100%, 24px 24px;
}

/* ── MAIN LAYOUT ─── */
#app{
  position:relative;z-index:1;height:100%;
  display:flex;flex-direction:column;align-items:center;justify-content:center;
  padding:32px 24px;gap:32px;
}

/* ── BRAND ─── */
.brand{display:flex;flex-direction:column;align-items:center;gap:12px}
.brand-row{display:flex;align-items:center;gap:14px}
.logo-mark{width:40px;height:40px;flex-shrink:0;filter:drop-shadow(0 0 12px rgba(76,201,240,.35))}
.wordmark{font-size:26px;font-weight:700;letter-spacing:-.6px;display:flex;align-items:baseline;gap:2px}
.wordmark .ros{color:var(--accent)}
.wordmark .stud{color:var(--fg3);font-weight:300;letter-spacing:0}
.tagline{font-size:12px;color:var(--fg3);letter-spacing:.03em}

/* ── ACTION CARDS ─── */
.cards{display:flex;gap:12px}
.card{
  width:160px;padding:24px 16px 20px;border-radius:10px;
  border:1px solid var(--border);background:var(--bg2);
  display:flex;flex-direction:column;align-items:center;gap:12px;
  cursor:pointer;
  transition:border-color 150ms,background 150ms,box-shadow 150ms,transform 100ms;
  color:inherit;
}
.card:hover{
  border-color:var(--accent);background:var(--bg3);
  box-shadow:0 0 0 1px rgba(76,201,240,.15), 0 8px 24px rgba(0,0,0,.35);
  transform:translateY(-1px);
}
.card:active{transform:translateY(0)}
.card-icon{
  width:36px;height:36px;border-radius:8px;
  background:var(--accent-dim);border:1px solid rgba(76,201,240,.2);
  display:flex;align-items:center;justify-content:center;color:var(--accent);
}
.card-icon svg{width:18px;height:18px}
.card-label{font-size:12.5px;font-weight:600;color:var(--fg);text-align:center}
.card-sub{font-size:11px;color:var(--fg3);text-align:center;line-height:1.4}

/* ── API KEY BANNER ─── */
#key-banner{
  width:100%;max-width:520px;
  border:1px solid rgba(248,81,73,.3);background:rgba(248,81,73,.07);
  border-radius:10px;padding:14px 16px;display:none;flex-direction:column;gap:10px;
}
#key-banner.visible{display:flex}
.kb-row{display:flex;align-items:flex-start;gap:10px}
.kb-icon{
  width:26px;height:26px;border-radius:6px;background:rgba(248,81,73,.2);
  display:flex;align-items:center;justify-content:center;flex-shrink:0;
  color:#f85149;font-size:13px;font-weight:700;
}
.kb-body{flex:1}
.kb-title{font-size:12.5px;font-weight:700;color:var(--fg);margin-bottom:3px}
.kb-text{font-size:11px;color:var(--fg2);line-height:1.5}
.kb-text code{color:var(--accent);font-family:ui-monospace,monospace;font-size:10.5px}
.kb-actions{display:flex;gap:6px;flex-wrap:wrap}
.btn-key{padding:5px 14px;border-radius:6px;font-size:11px;font-weight:600;cursor:pointer;font-family:inherit;transition:all 100ms}
.btn-key-primary{background:var(--accent);border:none;color:#0d1117}
.btn-key-primary:hover{background:#7de8f7}
.btn-key-ghost{background:transparent;border:1px solid var(--border2);color:var(--fg2)}
.btn-key-ghost:hover{border-color:var(--fg2);color:var(--fg)}
.btn-key-dismiss{background:transparent;border:none;color:var(--fg3);margin-left:auto;padding:5px 8px;font-size:11px}
.btn-key-dismiss:hover{color:var(--fg)}

/* ── RECENTS ─── */
#recents-section{width:100%;max-width:520px}
.section-title{
  font-size:10px;font-weight:600;color:var(--fg3);
  letter-spacing:.08em;text-transform:uppercase;margin-bottom:6px;
  padding:0 4px;
}
#recents-list{display:flex;flex-direction:column;gap:1px}
.recent-item{
  display:flex;align-items:center;gap:8px;
  padding:7px 10px;border-radius:6px;cursor:pointer;
  transition:background 100ms;
}
.recent-item:hover{background:var(--bg3)}
.recent-item .r-dot{width:5px;height:5px;border-radius:50%;background:var(--fg3);flex-shrink:0}
.recent-item .r-name{font-size:12px;font-weight:500;color:var(--fg);flex-shrink:0}
.recent-item .r-path{font-size:10.5px;color:var(--fg3);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1;text-align:right}
.no-recents{font-size:11px;color:var(--fg3);padding:4px 10px}

/* ── MODALS ─── */
.modal-backdrop{
  display:none;position:fixed;inset:0;background:rgba(1,4,9,.88);
  align-items:center;justify-content:center;z-index:200;
  backdrop-filter:blur(2px);
}
.modal-backdrop.open{display:flex}
.modal-box{
  background:var(--bg3);border:1px solid var(--border2);border-radius:14px;
  width:500px;max-width:calc(100vw - 40px);padding:28px;
  display:flex;flex-direction:column;gap:20px;
  box-shadow:0 24px 60px rgba(0,0,0,.6);
}
.modal-title{font-size:15px;font-weight:700;color:var(--fg);letter-spacing:-.2px}
.modal-step-label{font-size:10px;font-weight:600;color:var(--fg3);letter-spacing:.08em;text-transform:uppercase}
.step{display:none;flex-direction:column;gap:14px}
.step.active{display:flex}
.m-input{
  background:var(--bg2);border:1px solid var(--border2);border-radius:8px;
  padding:10px 13px;color:var(--fg);font-family:inherit;font-size:13px;outline:none;width:100%;
  transition:border-color 100ms;
}
.m-input:focus{border-color:var(--accent)}
.m-input::placeholder{color:var(--fg3)}
.m-error{font-size:11px;color:#f85149;min-height:16px}
.m-hint{font-size:11px;color:var(--fg3)}
.modal-actions{display:flex;gap:8px;justify-content:flex-end;margin-top:4px}
.btn-secondary{
  padding:7px 16px;border-radius:7px;border:1px solid var(--border2);
  background:transparent;color:var(--fg2);font-size:12px;cursor:pointer;font-family:inherit;
  transition:all 100ms;
}
.btn-secondary:hover{border-color:var(--fg);color:var(--fg)}
.btn-primary{
  padding:7px 20px;border-radius:7px;border:none;
  background:var(--accent);color:#0d1117;font-size:12px;font-weight:600;cursor:pointer;font-family:inherit;
  transition:background 100ms;
}
.btn-primary:hover{background:#7de8f7}
.btn-primary:disabled{opacity:.35;cursor:default}

/* Robot type selector */
.robot-cards{display:grid;grid-template-columns:1fr 1fr;gap:8px}
.r-card{
  border:1px solid var(--border);border-radius:8px;padding:13px 11px;
  cursor:pointer;transition:border-color 100ms,background 100ms;
  display:flex;flex-direction:column;gap:5px;background:var(--bg2);
}
.r-card:hover{border-color:var(--accent);background:var(--bg3)}
.r-card.selected{border-color:var(--accent);background:rgba(76,201,240,.08)}
.r-card.disabled{opacity:.3;cursor:not-allowed;pointer-events:none}
.r-label{font-size:10px;font-weight:700;font-family:ui-monospace,monospace;color:var(--accent);letter-spacing:.05em}
.r-card.disabled .r-label{color:var(--fg3)}
.r-name{font-size:12px;font-weight:600;color:var(--fg)}
.r-desc{font-size:10.5px;color:var(--fg2);line-height:1.3}
.r-badge{font-size:9px;padding:2px 5px;border-radius:3px;background:var(--bg4);color:var(--fg3);width:fit-content;margin-top:2px}

/* File tree preview */
.tree{
  font-family:ui-monospace,monospace;font-size:11px;color:var(--fg2);
  background:var(--bg2);border:1px solid var(--border);border-radius:7px;
  padding:10px 13px;line-height:1.8;max-height:200px;overflow-y:auto;
}
.tree .t-dir{color:var(--accent)}
</style>
</head>
<body>
<div id="bg-grid"></div>
<div id="app">

  <!-- Brand -->
  <!-- TODO: replace SVG with final vector logo from design -->
  <div class="brand">
    <div class="brand-row">
      <svg class="logo-mark" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
        <circle cx="20" cy="20" r="19" stroke="#4cc9f0" stroke-width="1.5"/>
        <circle cx="20" cy="20" r="7"  fill="#4cc9f0" opacity="0.92"/>
        <circle cx="20" cy="5"  r="2.8" fill="#4cc9f0" opacity="0.3"/>
        <circle cx="20" cy="35" r="2.8" fill="#4cc9f0" opacity="0.3"/>
        <circle cx="5"  cy="20" r="2.8" fill="#4cc9f0" opacity="0.3"/>
        <circle cx="35" cy="20" r="2.8" fill="#4cc9f0" opacity="0.3"/>
        <line x1="20" y1="7.8"  x2="20" y2="13" stroke="#4cc9f0" stroke-width="1.2" opacity=".3"/>
        <line x1="20" y1="27"  x2="20" y2="32.2" stroke="#4cc9f0" stroke-width="1.2" opacity=".3"/>
        <line x1="7.8"  y1="20" x2="13" y2="20" stroke="#4cc9f0" stroke-width="1.2" opacity=".3"/>
        <line x1="27"  y1="20" x2="32.2" y2="20" stroke="#4cc9f0" stroke-width="1.2" opacity=".3"/>
      </svg>
      <div class="wordmark"><span class="ros">roscode</span><span class="stud">&thinsp;studio</span></div>
    </div>
    <div class="tagline">The ROS 2 IDE powered by Claude AI</div>
  </div>

  <!-- Action cards — using <button> so they always receive click events -->
  <div class="cards">
    <button type="button" class="card" id="btn-new">
      <div class="card-icon">
        <svg viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.6">
          <line x1="9" y1="3" x2="9" y2="15"/><line x1="3" y1="9" x2="15" y2="9"/>
        </svg>
      </div>
      <div class="card-label">New Project</div>
      <div class="card-sub">Scaffold a ROS 2 workspace</div>
    </button>
    <button type="button" class="card" id="btn-open">
      <div class="card-icon">
        <svg viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.6">
          <path d="M2 5a2 2 0 012-2h3l2 2h6a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V5z"/>
        </svg>
      </div>
      <div class="card-label">Open Project</div>
      <div class="card-sub">Open an existing workspace</div>
    </button>
    <button type="button" class="card" id="btn-clone">
      <div class="card-icon">
        <svg viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.6">
          <circle cx="5" cy="4" r="1.5"/><circle cx="13" cy="4" r="1.5"/><circle cx="5" cy="14" r="1.5"/>
          <line x1="5" y1="5.5" x2="5" y2="12.5"/>
          <line x1="6.5" y1="4" x2="11.5" y2="4"/>
          <path d="M5 12.5c0-2 1.5-3 3-3h3"/>
        </svg>
      </div>
      <div class="card-label">Clone Repo</div>
      <div class="card-sub">Clone from Git URL</div>
    </button>
  </div>

  <!-- API key banner -->
  <div id="key-banner">
    <div class="kb-row">
      <div class="kb-icon">!</div>
      <div class="kb-body">
        <div class="kb-title">Anthropic API key required</div>
        <div class="kb-text">Set the <code>ANTHROPIC_API_KEY</code> environment variable, or add it in settings to enable the AI agent.</div>
      </div>
    </div>
    <div class="kb-actions">
      <button type="button" class="btn-key btn-key-primary" id="btn-getkey">Get API key &#8599;</button>
      <button type="button" class="btn-key btn-key-ghost" id="btn-opensettings">Open settings</button>
      <button type="button" class="btn-key-dismiss" id="btn-dismiss-key">Dismiss</button>
    </div>
  </div>

  <!-- Recent projects -->
  <div id="recents-section">
    <div class="section-title">Recent</div>
    <div id="recents-list"><div class="no-recents">No recent projects yet</div></div>
  </div>
</div>

<!-- ── NEW PROJECT MODAL ─── -->
<div class="modal-backdrop" id="modal-overlay">
  <div class="modal-box">
    <div class="modal-title" id="modal-title">New ROS 2 Project</div>
    <div class="step active" id="step1">
      <div class="modal-step-label">Step 1 of 3 &mdash; Project name</div>
      <input class="m-input" id="proj-name" type="text" placeholder="my_robot" autocomplete="off"/>
      <div class="m-error" id="name-error"></div>
      <div class="m-hint">Lowercase letters, numbers, underscores. Must start with a letter.</div>
      <div class="modal-actions">
        <button type="button" class="btn-secondary" id="s1-cancel">Cancel</button>
        <button type="button" class="btn-primary" id="s1-next" disabled>Next &rarr;</button>
      </div>
    </div>
    <div class="step" id="step2">
      <div class="modal-step-label">Step 2 of 3 &mdash; Robot type</div>
      <div class="robot-cards">
        <div class="r-card" id="rc-diff">
          <div class="r-label">DD</div>
          <div class="r-name">Diff Drive</div>
          <div class="r-desc">Non-holonomic &middot; /cmd_vel &rarr; /odom</div>
        </div>
        <div class="r-card" id="rc-empty">
          <div class="r-label">{ }</div>
          <div class="r-name">Empty</div>
          <div class="r-desc">Hello-world publisher. Start from scratch.</div>
        </div>
        <div class="r-card disabled" id="rc-ack">
          <div class="r-label" style="color:var(--fg3)">AK</div>
          <div class="r-name">Ackermann</div>
          <div class="r-desc">Car-like steering geometry</div>
          <div class="r-badge">coming soon</div>
        </div>
        <div class="r-card disabled" id="rc-man">
          <div class="r-label" style="color:var(--fg3)">6D</div>
          <div class="r-name">Manipulator</div>
          <div class="r-desc">6-DOF robotic arm</div>
          <div class="r-badge">coming soon</div>
        </div>
      </div>
      <div class="modal-actions">
        <button type="button" class="btn-secondary" id="s2-back">&larr; Back</button>
        <button type="button" class="btn-primary" id="s2-next" disabled>Next &rarr;</button>
      </div>
    </div>
    <div class="step" id="step3">
      <div class="modal-step-label">Step 3 of 3 &mdash; Confirm</div>
      <div id="tree-preview" class="tree"></div>
      <div class="modal-actions">
        <button type="button" class="btn-secondary" id="s3-back">&larr; Back</button>
        <button type="button" class="btn-primary" id="btn-create">Create project</button>
      </div>
    </div>
  </div>
</div>

<!-- ── CLONE MODAL ─── -->
<div class="modal-backdrop" id="clone-overlay">
  <div class="modal-box">
    <div class="modal-title">Clone Git Repository</div>
    <input class="m-input" id="clone-url" type="text" placeholder="https://github.com/org/repo.git"/>
    <div class="modal-actions">
      <button type="button" class="btn-secondary" id="clone-cancel">Cancel</button>
      <button type="button" class="btn-primary" id="clone-go">Clone</button>
    </div>
  </div>
</div>

<script nonce="${n}">
const vscode = acquireVsCodeApi();
let selectedRobot = '';

// ── Message handler ──────────────────────────────
window.addEventListener('message', e => {
  const m = e.data;
  if (m.type === 'recents') renderRecents(m.items);
  if (m.type === 'apiKeyStatus') {
    document.getElementById('key-banner').classList.toggle('visible', !m.hasKey);
  }
  if (m.type === 'scaffoldDone') closeModal();
  if (m.type === 'scaffoldCancelled') {
    const btn = document.getElementById('btn-create');
    if (btn) { btn.disabled = false; btn.textContent = 'Create project'; }
  }
});

// ── Button wiring (delegation-safe) ─────────────
document.getElementById('btn-new').addEventListener('click', openWizard);
document.getElementById('btn-open').addEventListener('click', () => vscode.postMessage({ type: 'openProject' }));
document.getElementById('btn-clone').addEventListener('click', openCloneModal);
document.getElementById('btn-getkey').addEventListener('click', () => vscode.postMessage({ type:'openExternal', url:'https://console.anthropic.com/settings/keys' }));
document.getElementById('btn-opensettings').addEventListener('click', () => vscode.postMessage({ type:'openSettings' }));
document.getElementById('btn-dismiss-key').addEventListener('click', () => document.getElementById('key-banner').classList.remove('visible'));
document.getElementById('s1-cancel').addEventListener('click', closeModal);
document.getElementById('s1-next').addEventListener('click', goStep2);
document.getElementById('s2-back').addEventListener('click', () => goStep(1));
document.getElementById('s2-next').addEventListener('click', goStep3);
document.getElementById('s3-back').addEventListener('click', () => goStep(2));
document.getElementById('btn-create').addEventListener('click', createProject);
document.getElementById('clone-cancel').addEventListener('click', closeCloneModal);
document.getElementById('clone-go').addEventListener('click', doClone);

// Robot card clicks
['diff','empty','ack','man'].forEach(id => {
  const card = document.getElementById('rc-'+id);
  if (card && !card.classList.contains('disabled')) {
    card.addEventListener('click', () => selectRobot(id === 'diff' ? 'diff-drive' : id === 'empty' ? 'empty' : id === 'ack' ? 'ackermann' : 'manipulator'));
  }
});

// Dismiss modal on backdrop click
document.getElementById('modal-overlay').addEventListener('click', e => { if (e.target === e.currentTarget) closeModal(); });
document.getElementById('clone-overlay').addEventListener('click', e => { if (e.target === e.currentTarget) closeCloneModal(); });

// Keyboard
document.getElementById('proj-name').addEventListener('input', validateName);
document.getElementById('proj-name').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); goStep2(); } });
document.getElementById('clone-url').addEventListener('keydown', e => { if (e.key === 'Enter') doClone(); });

// ── Recents ──────────────────────────────────────
function renderRecents(items) {
  const list = document.getElementById('recents-list');
  if (!items || !items.length) { list.innerHTML = '<div class="no-recents">No recent projects yet</div>'; return; }
  list.innerHTML = items.map(p => {
    const parts = p.split('/');
    const name = parts[parts.length - 1];
    const dir = parts.slice(0,-1).join('/').replace(/^\\/Users\\/[^/]+/, '~');
    return \`<button type="button" class="recent-item" data-path="\${p.replace(/"/g,'&quot;')}">
      <span class="r-dot"></span>
      <span class="r-name">\${esc(name)}</span>
      <span class="r-path">\${esc(dir)}</span>
    </button>\`;
  }).join('');
  list.querySelectorAll('.recent-item').forEach(btn => {
    btn.addEventListener('click', () => vscode.postMessage({ type:'openRecent', path: btn.dataset.path }));
  });
}

function esc(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

// ── Wizard ───────────────────────────────────────
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
  document.getElementById('modal-title').textContent = n===1 ? 'New ROS 2 Project' : n===2 ? 'Choose Robot Type' : 'Confirm Project';
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
    \`<span class="t-dir">\${name}/</span>\`,
    \`├── <span class="t-dir">.roscode/</span>  <span style="color:var(--fg3)">config.json</span>\`,
    \`├── <span class="t-dir">src/\${name}/</span>\`,
    \`│   ├── <span style="color:var(--fg2)">package.xml</span>  <span style="color:var(--fg2)">setup.py</span>\`,
    \`│   ├── <span class="t-dir">\${name}/</span>  <span style="color:var(--fg2)">\${name}_node.py</span>\`,
    \`│   └── <span class="t-dir">launch/</span>  <span style="color:var(--fg2)">launch.py</span>\`,
    \`└── <span class="t-dir">runtime/</span>  <span style="color:var(--fg2)">docker-compose.yml</span>\`,
  ].join('\\n');
}

function createProject() {
  const btn = document.getElementById('btn-create');
  btn.disabled = true; btn.textContent = 'Creating…';
  vscode.postMessage({ type:'newProject', name: document.getElementById('proj-name').value.trim(), robotType: selectedRobot });
}

// ── Clone ────────────────────────────────────────
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
