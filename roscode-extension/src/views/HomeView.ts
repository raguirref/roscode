import * as vscode from "vscode";
import type { RosConnection } from "../ros/connection";

export class HomeView implements vscode.WebviewViewProvider {
  public static readonly viewType = "roscode.home";
  private _view?: vscode.WebviewView;

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly ros: RosConnection
  ) {
    ros.onStatusChange(() => this._pushStatus());
  }

  resolveWebviewView(view: vscode.WebviewView): void {
    this._view = view;
    view.webview.options = { enableScripts: true, localResourceRoots: [this.context.extensionUri] };
    view.webview.html = this._html();
    view.webview.onDidReceiveMessage((m) => {
      if (m.type === "command") vscode.commands.executeCommand(m.command);
    });
    this._pushStatus();
  }

  updateRobots(count: number, scanning: boolean) {
    this._view?.webview.postMessage({ type: "robots", count, scanning });
  }

  private _pushStatus() {
    this._view?.webview.postMessage({
      type: "status",
      connected: this.ros.status === "connected",
      host: this.ros.connectedHost,
      rosVersion: this.ros.robot?.rosVersion,
    });
  }

  private _html(): string {
    const n = nonce();
    return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8"/>
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'nonce-${n}'; script-src 'nonce-${n}';">
<style nonce="${n}">
:root{--accent:#4cc9f0;--bg:#0a0e14;--bg2:#0d1520;--fg:#c9d1d9;--fg2:#8b9ab0;--fg3:#3d4a5c;--border:#141e2e;--green:#3dd68c;--red:#f87171}
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:'Inter',system-ui,sans-serif;font-size:12px;background:var(--bg);color:var(--fg);padding:6px 8px 10px;overflow:hidden auto}

/* Status row — single compact panel */
.status{background:transparent;border:1px solid var(--border);border-radius:6px;padding:8px 9px;display:flex;flex-direction:column;gap:6px;margin-bottom:10px}
.srow{display:flex;align-items:center;gap:8px;min-height:17px}
.srow:first-child{padding-bottom:6px;border-bottom:1px solid var(--border)}
.dot{width:6px;height:6px;border-radius:50%;background:var(--fg3);flex-shrink:0}
.dot.on{background:var(--green);box-shadow:0 0 6px var(--green)}
.dot.scan{background:var(--accent);animation:pulse 1.5s ease infinite}
@keyframes pulse{0%,100%{opacity:.3}50%{opacity:1}}
.lbl{font-size:11.5px;color:var(--fg2);flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.val{color:var(--fg3);font-size:10.5px;font-family:'JetBrains Mono',ui-monospace,monospace;flex-shrink:0}
.val.hl{color:var(--accent)}

/* Action buttons */
.btn{display:flex;align-items:center;gap:8px;padding:7px 9px;border-radius:5px;cursor:pointer;color:var(--fg2);font-size:11.5px;transition:all 100ms;border:1px solid transparent;background:transparent}
.btn:hover{background:var(--bg2);color:var(--accent);border-color:var(--border)}
.btn svg{flex-shrink:0;color:var(--accent)}
.kbd{margin-left:auto;font-size:9.5px;color:var(--fg3);background:var(--bg2);border:1px solid var(--border);border-radius:3px;padding:1px 5px;font-family:inherit;letter-spacing:.5px}

/* Subtle section header */
.hd{font-size:9.5px;color:var(--fg3);text-transform:uppercase;letter-spacing:1.2px;padding:8px 4px 3px;font-weight:600}
</style>
</head>
<body>

<div class="status">
  <div class="srow">
    <span class="dot" id="cdot"></span>
    <span class="lbl" id="clbl">No robot connected</span>
    <span class="val" id="cval"></span>
  </div>
  <div class="srow">
    <span class="dot" id="rdot"></span>
    <span class="lbl" id="rlbl">Network idle</span>
    <span class="val hl" id="rval">—</span>
  </div>
</div>

<div class="hd">Actions</div>

<div class="btn" data-cmd="roscode.focusAgent">
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
  <span>Ask agent</span>
  <span class="kbd">⌘⇧A</span>
</div>

<div class="btn" data-cmd="roscode.discoverNetwork">
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12a7 7 0 0 1 14 0"/><path d="M8 12a4 4 0 0 1 8 0"/><circle cx="12" cy="12" r="1.5" fill="currentColor"/></svg>
  <span>Scan network</span>
</div>

<div class="btn" data-cmd="roscode.openNodeGraph">
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="5" cy="6" r="2"/><circle cx="19" cy="6" r="2"/><circle cx="12" cy="18" r="2"/><path d="M7 6h10M6 8l5 8M18 8l-5 8"/></svg>
  <span>Node graph</span>
  <span class="kbd">⌘⇧G</span>
</div>

<div class="btn" data-cmd="roscode.searchNodes">
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
  <span>Search nodes</span>
  <span class="kbd">⌘⇧N</span>
</div>

<div class="btn" data-cmd="roscode.searchLibrary">
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>
  <span>Browse msg types</span>
</div>

<div class="btn" data-cmd="workbench.action.files.openFolder">
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
  <span>Open workspace…</span>
</div>

<script nonce="${n}">
const vsc = acquireVsCodeApi();
document.querySelectorAll('.btn').forEach(el => {
  el.addEventListener('click', () => vsc.postMessage({ type:'command', command: el.dataset.cmd }));
});
const cdot = document.getElementById('cdot');
const clbl = document.getElementById('clbl');
const cval = document.getElementById('cval');
const rdot = document.getElementById('rdot');
const rlbl = document.getElementById('rlbl');
const rval = document.getElementById('rval');
window.addEventListener('message', e => {
  const m = e.data;
  if(m.type === 'status'){
    if(m.connected){
      cdot.classList.add('on'); cdot.classList.remove('scan');
      clbl.textContent = m.host || 'Connected';
      cval.textContent = (m.rosVersion||'').toUpperCase();
      cval.className = 'val hl';
    } else {
      cdot.classList.remove('on','scan');
      clbl.textContent = 'No robot connected';
      cval.textContent = '';
    }
  } else if(m.type === 'robots'){
    if(m.scanning){
      rdot.classList.add('scan'); rdot.classList.remove('on');
      rlbl.textContent = 'Scanning LAN…';
      rval.textContent = '—';
    } else {
      rdot.classList.remove('scan');
      if(m.count > 0){ rdot.classList.add('on'); rlbl.textContent = 'Hosts on network'; }
      else { rdot.classList.remove('on'); rlbl.textContent = 'No hosts found'; }
      rval.textContent = m.count;
    }
  }
});
</script>
</body>
</html>`;
  }
}

function nonce(){let t="";const c="ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";for(let i=0;i<32;i++)t+=c[Math.floor(Math.random()*c.length)];return t;}
