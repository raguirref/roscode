import * as vscode from "vscode";
import type { RosConnection } from "../ros/connection";

export class HomeView implements vscode.WebviewViewProvider {
  public static readonly viewType = "roscode.home";
  private _view?: vscode.WebviewView;

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly ros: RosConnection
  ) {
    ros.onStatusChange(() => this._push());
  }

  resolveWebviewView(view: vscode.WebviewView): void {
    this._view = view;
    view.webview.options = { enableScripts: true, localResourceRoots: [this.context.extensionUri] };
    view.webview.html = this._html();
    view.webview.onDidReceiveMessage((m) => {
      if (m.type === "command") vscode.commands.executeCommand(m.command);
    });
    this._push();
  }

  updateRobots(count: number, scanning: boolean) {
    this._view?.webview.postMessage({ type: "robots", count, scanning });
  }

  private _push() {
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
:root{--accent:#4cc9f0;--bg:#0a0e14;--bg2:#0d1520;--fg:#c9d1d9;--fg2:#8b9ab0;--fg3:#3d4a5c;--border:#141e2e;--green:#3dd68c}
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:'Inter',system-ui,sans-serif;font-size:12px;background:var(--bg);color:var(--fg);padding:10px 10px 12px;overflow-y:auto}
.brand{font-weight:700;letter-spacing:-0.3px;font-size:13px;margin-bottom:2px}
.brand .a{color:var(--accent)}.brand .b{color:var(--fg3);font-weight:500}
.sub{color:var(--fg3);font-size:10.5px;margin-bottom:12px}
.card{background:var(--bg2);border:1px solid var(--border);border-radius:6px;padding:9px 11px;margin-bottom:7px;cursor:pointer;transition:border-color 120ms,background 120ms}
.card:hover{border-color:var(--accent);background:#0e1a2b}
.card.nostyle{cursor:default}.card.nostyle:hover{border-color:var(--border);background:var(--bg2)}
.row{display:flex;align-items:center;gap:8px}
.dot{width:6px;height:6px;border-radius:50%;background:var(--fg3);flex-shrink:0}
.dot.on{background:var(--green);box-shadow:0 0 6px var(--green)}
.lbl{font-size:11.5px;color:var(--fg)}
.val{margin-left:auto;color:var(--fg2);font-size:10.5px;font-family:'JetBrains Mono',monospace}
.val.hl{color:var(--accent)}
.title{font-size:11px;color:var(--fg3);text-transform:uppercase;letter-spacing:1px;padding:10px 2px 5px}
.sc{display:flex;align-items:center;gap:8px;padding:6px 8px;border-radius:4px;cursor:pointer;color:var(--fg2);font-size:11.5px;transition:all 100ms}
.sc:hover{background:var(--bg2);color:var(--accent)}
.sc svg{flex-shrink:0}
.kbd{margin-left:auto;font-size:9.5px;color:var(--fg3);background:var(--bg);border:1px solid var(--border);border-radius:3px;padding:1px 5px;font-family:inherit}
</style>
</head>
<body>
<div class="brand"><span class="a">roscode</span> <span class="b">studio</span></div>
<div class="sub">AI-native IDE for ROS 2</div>

<div class="card nostyle" id="status-card">
  <div class="row">
    <span class="dot" id="cdot"></span>
    <span class="lbl" id="clbl">No robot connected</span>
    <span class="val" id="cval"></span>
  </div>
</div>

<div class="card nostyle" id="robots-card">
  <div class="row">
    <span class="dot" id="rdot"></span>
    <span class="lbl" id="rlbl">Network: idle</span>
    <span class="val hl" id="rval">0</span>
  </div>
</div>

<div class="title">Quick actions</div>

<div class="sc" data-cmd="roscode.focusAgent">
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
  <span>Ask the agent</span>
  <span class="kbd">⌘⇧A</span>
</div>

<div class="sc" data-cmd="roscode.discoverNetwork">
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M12 1v6m0 10v6M4.22 4.22l4.24 4.24m7.08 7.08l4.24 4.24M1 12h6m10 0h6M4.22 19.78l4.24-4.24m7.08-7.08l4.24-4.24"/></svg>
  <span>Scan for ROS hosts</span>
</div>

<div class="sc" data-cmd="roscode.openNodeGraph">
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="5" cy="6" r="2"/><circle cx="19" cy="6" r="2"/><circle cx="12" cy="18" r="2"/><path d="M7 6h10M6 8l5 8M18 8l-5 8"/></svg>
  <span>Open node graph</span>
  <span class="kbd">⌘⇧G</span>
</div>

<div class="sc" data-cmd="roscode.searchNodes">
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
  <span>Search nodes</span>
  <span class="kbd">⌘⇧N</span>
</div>

<script nonce="${n}">
const vsc = acquireVsCodeApi();
document.querySelectorAll('.sc').forEach(el => {
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
    if(m.connected){ cdot.classList.add('on'); clbl.textContent='Connected'; cval.textContent = m.host + ' · ' + (m.rosVersion||'').toUpperCase(); cval.className='val hl'; }
    else { cdot.classList.remove('on'); clbl.textContent='No robot connected'; cval.textContent=''; }
  } else if(m.type === 'robots'){
    if(m.scanning){ rlbl.textContent='Scanning LAN…'; rdot.classList.remove('on'); }
    else { rlbl.textContent = m.count > 0 ? 'Hosts found' : 'No hosts'; if(m.count>0)rdot.classList.add('on');else rdot.classList.remove('on'); }
    rval.textContent = m.count;
  }
});
</script>
</body>
</html>`;
  }
}

function nonce(){let t="";const c="ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";for(let i=0;i<32;i++)t+=c[Math.floor(Math.random()*c.length)];return t;}
