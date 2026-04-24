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
    this._sendRecents();
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

  private async _handle(msg: any) {
    switch (msg.type) {
      case "ready":
        this._sendRecents();
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
      await scaffoldProject(name, robotType as any);
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
  content="default-src 'none'; style-src 'nonce-${n}'; script-src 'nonce-${n}';">
<style nonce="${n}">
:root{
  --bg:#0d1117; --bg2:#161b22; --bg3:#21262d;
  --fg:#e6edf3; --fg2:#8b949e; --fg3:#484f58;
  --border:#21262d; --border2:#30363d;
  --accent:#4cc9f0;
}
*{box-sizing:border-box;margin:0;padding:0;-webkit-font-smoothing:antialiased}
html,body{height:100%;background:var(--bg);color:var(--fg);
  font-family:'Inter',-apple-system,BlinkMacSystemFont,system-ui,sans-serif;font-size:13px;
  display:flex;flex-direction:column}
button{cursor:pointer;font-family:inherit;font-size:inherit}

/* ── MAIN LAYOUT ─── */
#app{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:40px 20px;gap:40px}

/* ── WORDMARK ─── */
.wordmark{font-size:22px;font-weight:700;letter-spacing:-.5px;display:flex;align-items:baseline;gap:2px}
.wordmark .ros{color:var(--accent)}
.wordmark .stud{color:var(--fg3);font-weight:400}

/* ── ACTION CARDS ─── */
.cards{display:flex;gap:14px}
.card{
  width:160px;padding:22px 18px 20px;border-radius:8px;
  border:1px solid var(--border);background:var(--bg);
  display:flex;flex-direction:column;align-items:center;gap:10px;
  cursor:pointer;transition:border-color 100ms,background 100ms;
}
.card:hover{border-color:var(--accent);background:var(--bg2)}
.card .icon{font-size:22px;line-height:1}
.card .label{font-size:12.5px;font-weight:600;color:var(--fg);text-align:center}
.card .sub{font-size:11px;color:var(--fg2);text-align:center;line-height:1.4}

/* ── RECENTS ─── */
#recents-section{width:100%;max-width:500px}
.section-title{font-size:11px;font-weight:600;color:var(--fg3);letter-spacing:.06em;text-transform:uppercase;margin-bottom:8px}
#recents-list{display:flex;flex-direction:column;gap:2px}
.recent-item{display:flex;align-items:center;justify-content:space-between;
  padding:7px 10px;border-radius:6px;cursor:pointer;gap:8px}
.recent-item:hover{background:var(--bg2)}
.recent-item .r-name{font-size:12.5px;font-weight:500;color:var(--fg)}
.recent-item .r-path{font-size:11px;color:var(--fg3);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1;text-align:right}
.no-recents{font-size:11.5px;color:var(--fg3);padding:4px 10px}

/* ── MODAL OVERLAY ─── */
#modal-overlay{
  display:none;position:fixed;inset:0;background:rgba(1,4,9,.85);
  align-items:center;justify-content:center;z-index:100;
}
#modal-overlay.open{display:flex}
#modal{
  background:var(--bg2);border:1px solid var(--border2);border-radius:12px;
  width:480px;max-width:calc(100vw - 40px);padding:28px;
  display:flex;flex-direction:column;gap:20px;
}
.modal-title{font-size:15px;font-weight:700;color:var(--fg)}
.step{display:none;flex-direction:column;gap:16px}
.step.active{display:flex}
.step-label{font-size:11px;font-weight:600;color:var(--fg3);letter-spacing:.06em;text-transform:uppercase}
.m-input{
  background:var(--bg);border:1px solid var(--border2);border-radius:7px;
  padding:9px 12px;color:var(--fg);font-family:inherit;font-size:13px;outline:none;width:100%;
}
.m-input:focus{border-color:var(--accent)}
.m-input::placeholder{color:var(--fg3)}
.m-error{font-size:11.5px;color:#f85149;min-height:18px}
.m-hint{font-size:11px;color:var(--fg3)}

/* Robot type cards */
.robot-cards{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.r-card{
  border:1px solid var(--border);border-radius:7px;padding:14px 12px;
  cursor:pointer;transition:border-color 100ms,background 100ms;display:flex;flex-direction:column;gap:6px;
}
.r-card:hover{border-color:var(--accent);background:var(--bg)}
.r-card.selected{border-color:var(--accent);background:rgba(76,201,240,.06)}
.r-card.disabled{opacity:.35;cursor:not-allowed}
.r-card .r-icon{font-size:20px}
.r-card .r-name{font-size:12px;font-weight:600;color:var(--fg)}
.r-card .r-desc{font-size:10.5px;color:var(--fg2);line-height:1.3}
.r-badge{font-size:9px;padding:1px 5px;border-radius:3px;background:var(--bg3);color:var(--fg3);width:fit-content;margin-top:2px}

/* File tree preview */
.tree{font-family:ui-monospace,monospace;font-size:11px;color:var(--fg2);
  background:var(--bg);border:1px solid var(--border);border-radius:6px;
  padding:10px 12px;line-height:1.7;max-height:180px;overflow-y:auto}
.tree .t-dir{color:var(--accent)}
.tree .t-file{color:var(--fg2)}

/* Bottom modal row */
.modal-actions{display:flex;gap:8px;justify-content:flex-end}
.btn-secondary{
  padding:7px 16px;border-radius:6px;border:1px solid var(--border2);
  background:transparent;color:var(--fg2);font-size:12.5px;
}
.btn-secondary:hover{border-color:var(--fg2);color:var(--fg)}
.btn-primary{
  padding:7px 18px;border-radius:6px;border:none;
  background:var(--accent);color:#0d1117;font-size:12.5px;font-weight:600;
}
.btn-primary:hover{background:#7de8f7}
.btn-primary:disabled{opacity:.35;cursor:default}

/* Clone modal */
#clone-modal{display:none;flex-direction:column;gap:16px}
#clone-modal.open{display:flex}
</style>
</head>
<body>
<div id="app">
  <!-- Wordmark -->
  <div class="wordmark"><span class="ros">roscode</span><span class="stud">&nbsp;studio</span></div>

  <!-- Action cards -->
  <div class="cards">
    <div class="card" onclick="openWizard()">
      <div class="icon">+</div>
      <div class="label">New Project</div>
      <div class="sub">Scaffold a ROS 2 workspace</div>
    </div>
    <div class="card" onclick="openProject()">
      <div class="icon">📁</div>
      <div class="label">Open Project</div>
      <div class="sub">Open an existing workspace</div>
    </div>
    <div class="card" onclick="openCloneModal()">
      <div class="icon">🔗</div>
      <div class="label">Clone Repo</div>
      <div class="sub">Clone from Git URL</div>
    </div>
  </div>

  <!-- Recent projects -->
  <div id="recents-section">
    <div class="section-title">Recent</div>
    <div id="recents-list"><div class="no-recents">No recent projects</div></div>
  </div>
</div>

<!-- ── NEW PROJECT MODAL ────────────────────────── -->
<div id="modal-overlay">
  <div id="modal">
    <div class="modal-title" id="modal-title">New ROS 2 Project</div>

    <!-- Step 1: Name -->
    <div class="step active" id="step1">
      <div class="step-label">Step 1 of 3 — Project name</div>
      <input class="m-input" id="proj-name" type="text" placeholder="my_robot" autocomplete="off" oninput="validateName()" onkeydown="nameKey(event)"/>
      <div class="m-error" id="name-error"></div>
      <div class="m-hint">Lowercase, letters/numbers/underscores. No spaces.</div>
      <div class="modal-actions">
        <button class="btn-secondary" onclick="closeModal()">Cancel</button>
        <button class="btn-primary" id="btn-step1-next" onclick="goStep2()" disabled>Next →</button>
      </div>
    </div>

    <!-- Step 2: Robot type -->
    <div class="step" id="step2">
      <div class="step-label">Step 2 of 3 — Robot type</div>
      <div class="robot-cards">
        <div class="r-card" id="rc-diff" onclick="selectRobot('diff-drive')">
          <div class="r-icon">🚗</div>
          <div class="r-name">Diff Drive</div>
          <div class="r-desc">Non-holonomic. /cmd_vel → /odom subscriber + publisher</div>
        </div>
        <div class="r-card" id="rc-empty" onclick="selectRobot('empty')">
          <div class="r-icon">⬜</div>
          <div class="r-name">Empty</div>
          <div class="r-desc">Hello-world publisher node. Start from scratch.</div>
        </div>
        <div class="r-card disabled" id="rc-ack">
          <div class="r-icon">🏎</div>
          <div class="r-name">Ackermann</div>
          <div class="r-desc">Car-like steering geometry</div>
          <div class="r-badge">uses diff-drive template</div>
        </div>
        <div class="r-card disabled" id="rc-man">
          <div class="r-icon">🦾</div>
          <div class="r-name">Manipulator</div>
          <div class="r-desc">6DOF robotic arm</div>
          <div class="r-badge">uses diff-drive template</div>
        </div>
      </div>
      <div class="modal-actions">
        <button class="btn-secondary" onclick="goStep1()">← Back</button>
        <button class="btn-primary" id="btn-step2-next" onclick="goStep3()" disabled>Next →</button>
      </div>
    </div>

    <!-- Step 3: Confirm + preview -->
    <div class="step" id="step3">
      <div class="step-label">Step 3 of 3 — Confirm</div>
      <div id="tree-preview" class="tree"></div>
      <div class="modal-actions">
        <button class="btn-secondary" onclick="goStep2()">← Back</button>
        <button class="btn-primary" id="btn-create" onclick="createProject()">Create project</button>
      </div>
    </div>
  </div>
</div>

<!-- ── CLONE MODAL ────────────────────────────── -->
<div id="modal-overlay2" style="display:none;position:fixed;inset:0;background:rgba(1,4,9,.85);align-items:center;justify-content:center;z-index:100;">
  <div id="modal" style="background:var(--bg2);border:1px solid var(--border2);border-radius:12px;width:480px;max-width:calc(100vw - 40px);padding:28px;display:flex;flex-direction:column;gap:20px;">
    <div class="modal-title">Clone Git Repository</div>
    <input class="m-input" id="clone-url" type="text" placeholder="https://github.com/org/repo.git" onkeydown="cloneKey(event)"/>
    <div class="modal-actions">
      <button class="btn-secondary" onclick="closeCloneModal()">Cancel</button>
      <button class="btn-primary" onclick="doClone()">Clone</button>
    </div>
  </div>
</div>

<script nonce="${n}">
const vscode = acquireVsCodeApi();
let selectedRobot = '';
let projName = '';

window.addEventListener('message', e => {
  const m = e.data;
  if (m.type === 'recents') renderRecents(m.items);
  if (m.type === 'parentChosen') { /* handled inline */ }
  if (m.type === 'scaffoldDone') closeModal();
  if (m.type === 'scaffoldCancelled') {
    document.getElementById('btn-create').disabled = false;
    document.getElementById('btn-create').textContent = 'Create project';
  }
});

function renderRecents(items) {
  const list = document.getElementById('recents-list');
  if (!items || !items.length) {
    list.innerHTML = '<div class="no-recents">No recent projects</div>';
    return;
  }
  list.innerHTML = items.map(p => {
    const parts = p.split('/');
    const name = parts[parts.length - 1];
    const dir = parts.slice(0, -1).join('/').replace(/\\/Users\\/[^/]+/, '~');
    return \`<div class="recent-item" onclick="openRecent(\${JSON.stringify(p)})">
      <span class="r-name">\${name}</span>
      <span class="r-path">\${dir}</span>
    </div>\`;
  }).join('');
}

function openRecent(p) { vscode.postMessage({ type: 'openRecent', path: p }); }
function openProject() { vscode.postMessage({ type: 'openProject' }); }

// ── Wizard ─────────────────────────────────────
function openWizard() {
  selectedRobot = ''; projName = '';
  document.getElementById('proj-name').value = '';
  document.getElementById('name-error').textContent = '';
  document.getElementById('btn-step1-next').disabled = true;
  goStep(1);
  document.getElementById('modal-overlay').classList.add('open');
  setTimeout(() => document.getElementById('proj-name').focus(), 50);
}

function closeModal() {
  document.getElementById('modal-overlay').classList.remove('open');
}

function goStep(n) {
  [1,2,3].forEach(i => document.getElementById('step'+i).classList.toggle('active', i===n));
  document.getElementById('modal-title').textContent = [
    '', 'New ROS 2 Project', 'Choose Robot Type', 'Confirm Project'
  ][n];
}

function goStep1() { goStep(1); }
function goStep2() {
  if (!validateNameNow()) return;
  goStep(2);
}
function goStep3() {
  if (!selectedRobot) return;
  projName = document.getElementById('proj-name').value.trim();
  document.getElementById('tree-preview').innerHTML = buildTree(projName, selectedRobot);
  goStep(3);
}

function validateName() {
  const val = document.getElementById('proj-name').value.trim();
  const ok = /^[a-z][a-z0-9_]*$/.test(val) && val.length >= 2;
  const err = document.getElementById('name-error');
  err.textContent = val.length > 0 && !ok ? 'Use lowercase letters, numbers, underscores (start with a letter)' : '';
  document.getElementById('btn-step1-next').disabled = !ok;
}

function validateNameNow() {
  const val = document.getElementById('proj-name').value.trim();
  return /^[a-z][a-z0-9_]*$/.test(val) && val.length >= 2;
}

function nameKey(e) { if (e.key === 'Enter') { e.preventDefault(); goStep2(); } }

function selectRobot(type) {
  selectedRobot = type;
  ['diff','empty','ack','man'].forEach(id => {
    const card = document.getElementById('rc-'+id);
    if (card) card.classList.remove('selected');
  });
  const map = {'diff-drive':'diff','empty':'empty','ackermann':'ack','manipulator':'man'};
  document.getElementById('rc-'+map[type])?.classList.add('selected');
  document.getElementById('btn-step2-next').disabled = false;
}

function buildTree(name, type) {
  const nodeFile = type === 'empty' ? name+'_node.py' : name+'_node.py';
  return [
    \`<span class="t-dir">\${name}/</span>\`,
    \`├── <span class="t-dir">.roscode/</span>\`,
    \`│   └── <span class="t-file">config.json</span>\`,
    \`├── <span class="t-dir">src/</span>\`,
    \`│   └── <span class="t-dir">\${name}/</span>\`,
    \`│       ├── <span class="t-file">package.xml</span>\`,
    \`│       ├── <span class="t-file">setup.py</span>\`,
    \`│       ├── <span class="t-dir">\${name}/</span>\`,
    \`│       │   ├── <span class="t-file">__init__.py</span>\`,
    \`│       │   └── <span class="t-file">\${nodeFile}</span>\`,
    \`│       └── <span class="t-dir">launch/</span>\`,
    \`│           └── <span class="t-file">launch.py</span>\`,
    \`└── <span class="t-dir">runtime/</span>\`,
    \`    └── <span class="t-file">docker-compose.yml</span>\`,
  ].join('\\n');
}

function createProject() {
  const btn = document.getElementById('btn-create');
  btn.disabled = true;
  btn.textContent = 'Creating…';
  projName = document.getElementById('proj-name').value.trim();
  vscode.postMessage({ type: 'newProject', name: projName, robotType: selectedRobot });
}

// ── Clone ───────────────────────────────────────
function openCloneModal() {
  document.getElementById('modal-overlay2').style.display = 'flex';
  setTimeout(() => document.getElementById('clone-url').focus(), 50);
}
function closeCloneModal() {
  document.getElementById('modal-overlay2').style.display = 'none';
}
function cloneKey(e) { if (e.key === 'Enter') doClone(); }
function doClone() {
  const url = document.getElementById('clone-url').value.trim();
  if (!url) return;
  closeCloneModal();
  vscode.postMessage({ type: 'cloneRepo', url });
}

vscode.postMessage({ type: 'ready' });
</script>
</body>
</html>`;
  }
}
