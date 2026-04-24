import * as vscode from "vscode";
import type { RosConnection } from "../ros/connection";
import { scaffoldProject } from "../scaffoldProject";

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
    view.webview.onDidReceiveMessage(async (m) => {
      if (m.type === "command") {
        vscode.commands.executeCommand(m.command, ...(m.args ?? []));
      } else if (m.type === "newProject") {
        await scaffoldProject(m.name, m.robotType);
      }
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
:root{--accent:#4cc9f0;--accent-dim:#4cc9f060;--bg:#0a0e14;--bg2:#0d1520;--bg3:#111b2b;--fg:#c9d1d9;--fg2:#8b9ab0;--fg3:#3d4a5c;--border:#141e2e;--green:#3dd68c;--red:#f87171}
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:'Inter',system-ui,sans-serif;font-size:12px;background:var(--bg);color:var(--fg);padding:6px 8px 10px;overflow:hidden auto}

/* Status row */
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
.btn.primary{background:var(--accent-dim);border-color:var(--accent);color:var(--accent);margin-bottom:2px}
.btn.primary:hover{background:var(--accent);color:#060809}
.btn.primary svg{color:inherit}

/* Section header */
.hd{font-size:9.5px;color:var(--fg3);text-transform:uppercase;letter-spacing:1.2px;padding:8px 4px 3px;font-weight:600}

/* ── Wizard Modal ───────────────────────────────────────── */
#modal{display:none;position:fixed;inset:0;background:#0a0e14ee;z-index:100;flex-direction:column;padding:10px 8px;overflow-y:auto}
#modal.open{display:flex}
.modal-box{background:var(--bg2);border:1px solid var(--border);border-radius:8px;padding:14px;display:flex;flex-direction:column;gap:10px;flex:1;max-height:100%}
.modal-title{font-size:13px;font-weight:700;color:var(--fg);letter-spacing:-0.2px}
.modal-sub{font-size:11px;color:var(--fg3)}

/* Step indicator */
.steps{display:flex;gap:4px;align-items:center}
.step{width:18px;height:3px;border-radius:2px;background:var(--border)}
.step.done{background:var(--green)}
.step.active{background:var(--accent)}

/* Name input */
.field{display:flex;flex-direction:column;gap:5px}
.field label{font-size:10.5px;color:var(--fg2);font-weight:600;letter-spacing:.3px}
.field input{background:var(--bg);border:1px solid var(--border);border-radius:5px;padding:7px 9px;color:var(--fg);font-family:inherit;font-size:12px;outline:none;transition:border-color 120ms}
.field input:focus{border-color:var(--accent)}
.field input::placeholder{color:var(--fg3)}

/* Robot type cards */
.type-grid{display:grid;grid-template-columns:1fr 1fr;gap:6px}
.type-card{border:1px solid var(--border);border-radius:6px;padding:8px 9px;cursor:pointer;transition:all 100ms;display:flex;flex-direction:column;gap:3px;background:var(--bg)}
.type-card:hover{border-color:var(--accent-dim)}
.type-card.selected{border-color:var(--accent);background:var(--accent-dim)}
.type-card.disabled{opacity:.4;cursor:not-allowed}
.type-card .tc-icon{font-size:16px;line-height:1}
.type-card .tc-name{font-size:11px;font-weight:600;color:var(--fg)}
.type-card .tc-desc{font-size:10px;color:var(--fg3);line-height:1.35}
.type-card .tc-badge{font-size:9px;color:var(--fg3);background:var(--bg2);border:1px solid var(--border);border-radius:3px;padding:1px 4px;align-self:flex-start;margin-top:2px}

/* Modal footer */
.modal-footer{display:flex;gap:6px;margin-top:4px}
.modal-btn{flex:1;padding:7px;border-radius:5px;border:1px solid;cursor:pointer;font-family:inherit;font-size:12px;font-weight:600;transition:all 100ms}
.modal-btn.cancel{background:transparent;border-color:var(--border);color:var(--fg3)}
.modal-btn.cancel:hover{border-color:var(--fg3);color:var(--fg)}
.modal-btn.next{background:var(--accent-dim);border-color:var(--accent);color:var(--accent)}
.modal-btn.next:hover:not(:disabled){background:var(--accent);color:#060809}
.modal-btn.next:disabled{opacity:.35;cursor:not-allowed}
.err{font-size:10.5px;color:var(--red);min-height:14px}
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

<div class="hd">Project</div>

<div class="btn primary" id="newBtn">
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
  <span>New ROS 2 project…</span>
</div>

<div class="btn" data-cmd="workbench.action.files.openFolder">
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
  <span>Open workspace…</span>
</div>

<div class="btn" data-cmd="roscode.startRuntime">
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="5 3 19 12 5 21 5 3"/></svg>
  <span>Start ROS runtime</span>
</div>

<div class="hd">Tools</div>

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

<div class="btn" data-cmd="roscode.searchLibrary">
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>
  <span>Browse msg types</span>
</div>

<!-- ── Wizard Modal ── -->
<div id="modal">
  <div class="modal-box">
    <div style="display:flex;align-items:center;justify-content:space-between">
      <span class="modal-title">New ROS 2 project</span>
      <div class="steps">
        <div class="step active" id="s1"></div>
        <div class="step" id="s2"></div>
      </div>
    </div>

    <!-- Step 1: Project name -->
    <div id="step1">
      <div class="field">
        <label>PROJECT NAME</label>
        <input id="nameInp" placeholder="my_robot" maxlength="64" autocomplete="off"/>
      </div>
      <div class="err" id="nameErr"></div>
    </div>

    <!-- Step 2: Robot type -->
    <div id="step2" style="display:none;flex-direction:column;gap:8px">
      <span class="modal-sub">Choose a starting template</span>
      <div class="type-grid">
        <div class="type-card selected" data-type="diff-drive">
          <span class="tc-icon">🚗</span>
          <span class="tc-name">Diff-drive</span>
          <span class="tc-desc">Two-wheel differential drive with /cmd_vel → /odom</span>
        </div>
        <div class="type-card" data-type="empty">
          <span class="tc-icon">📦</span>
          <span class="tc-name">Empty</span>
          <span class="tc-desc">Bare package skeleton with hello-world publisher</span>
        </div>
        <div class="type-card disabled" data-type="ackermann">
          <span class="tc-icon">🏎</span>
          <span class="tc-name">Ackermann</span>
          <span class="tc-desc">Car-like steering geometry</span>
          <span class="tc-badge">coming soon</span>
        </div>
        <div class="type-card disabled" data-type="manipulator">
          <span class="tc-icon">🦾</span>
          <span class="tc-name">Manipulator</span>
          <span class="tc-desc">Joint state control with MoveIt2</span>
          <span class="tc-badge">coming soon</span>
        </div>
      </div>
    </div>

    <div class="modal-footer">
      <button class="modal-btn cancel" id="cancelBtn">Cancel</button>
      <button class="modal-btn next" id="nextBtn">Next →</button>
    </div>
  </div>
</div>

<script nonce="${n}">
const vsc = acquireVsCodeApi();

// ── status wiring ──
document.querySelectorAll('.btn[data-cmd]').forEach(el => {
  el.addEventListener('click', () => vsc.postMessage({ type:'command', command: el.dataset.cmd }));
});
const cdot=document.getElementById('cdot'),clbl=document.getElementById('clbl'),cval=document.getElementById('cval');
const rdot=document.getElementById('rdot'),rlbl=document.getElementById('rlbl'),rval=document.getElementById('rval');
window.addEventListener('message', e => {
  const m = e.data;
  if(m.type==='status'){
    if(m.connected){cdot.classList.add('on');clbl.textContent=m.host||'Connected';cval.textContent=(m.rosVersion||'').toUpperCase();cval.className='val hl';}
    else{cdot.classList.remove('on');clbl.textContent='No robot connected';cval.textContent='';}
  } else if(m.type==='robots'){
    if(m.scanning){rdot.classList.add('scan');rlbl.textContent='Scanning LAN…';rval.textContent='—';}
    else{rdot.classList.remove('scan');if(m.count>0){rdot.classList.add('on');rlbl.textContent='Hosts on network';}else{rdot.classList.remove('on');rlbl.textContent='No hosts found';}rval.textContent=m.count;}
  }
});

// ── wizard ──
const modal=document.getElementById('modal');
const step1=document.getElementById('step1');
const step2=document.getElementById('step2');
const nameInp=document.getElementById('nameInp');
const nameErr=document.getElementById('nameErr');
const nextBtn=document.getElementById('nextBtn');
const cancelBtn=document.getElementById('cancelBtn');
const s1=document.getElementById('s1'),s2=document.getElementById('s2');
let curStep=1;
let selectedType='diff-drive';

document.getElementById('newBtn').addEventListener('click',()=>{
  curStep=1;
  nameInp.value='';
  nameErr.textContent='';
  selectedType='diff-drive';
  document.querySelectorAll('.type-card').forEach(c=>{c.classList.toggle('selected',c.dataset.type==='diff-drive');});
  step1.style.display='';step2.style.display='none';
  s1.className='step active';s2.className='step';
  nextBtn.textContent='Next →';nextBtn.disabled=false;
  modal.classList.add('open');
  setTimeout(()=>nameInp.focus(),80);
});

cancelBtn.addEventListener('click',()=>modal.classList.remove('open'));

document.querySelectorAll('.type-card:not(.disabled)').forEach(card=>{
  card.addEventListener('click',()=>{
    selectedType=card.dataset.type;
    document.querySelectorAll('.type-card').forEach(c=>c.classList.remove('selected'));
    card.classList.add('selected');
  });
});

nextBtn.addEventListener('click',()=>{
  if(curStep===1){
    const raw=nameInp.value.trim();
    if(!raw){nameErr.textContent='Project name is required';nameInp.focus();return;}
    if(!/^[a-zA-Z][a-zA-Z0-9_\\- ]*$/.test(raw)){nameErr.textContent='Start with a letter; use letters, numbers, _, -, or spaces';nameInp.focus();return;}
    nameErr.textContent='';
    curStep=2;
    step1.style.display='none';step2.style.display='flex';
    s1.className='step done';s2.className='step active';
    nextBtn.textContent='Create project';
  } else {
    const name=nameInp.value.trim();
    modal.classList.remove('open');
    vsc.postMessage({type:'newProject',name,robotType:selectedType});
  }
});

nameInp.addEventListener('keydown',e=>{if(e.key==='Enter')nextBtn.click();});
nameInp.addEventListener('input',()=>{nameErr.textContent='';});
modal.addEventListener('click',e=>{if(e.target===modal)modal.classList.remove('open');});
</script>
</body>
</html>`;
  }
}

function nonce(){let t="";const c="ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";for(let i=0;i<32;i++)t+=c[Math.floor(Math.random()*c.length)];return t;}
