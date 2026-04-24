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
@import url("https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600&family=Geist+Mono:wght@400;500;600&display=swap");
:root{
  --accent:#f2a83b;
  --accent-dim:rgba(242,168,59,0.10);
  --accent-line:rgba(242,168,59,0.28);
  --bg:#0a0c0b;
  --bg2:#121615;
  --bg3:#181d1b;
  --fg:#e4e6e1;
  --fg2:#9ea39a;
  --fg3:#636862;
  --border:#22282660;
  --border-hi:#333b38;
  --green:#8bc34a;
  --red:#e06666;
  --warn:#f2c84b;
  --font-mono:'Geist Mono','JetBrains Mono',ui-monospace,monospace;
  --font-sans:'Geist','Inter',system-ui,sans-serif;
}
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:var(--font-sans);font-size:12px;background:var(--bg);color:var(--fg);padding:8px 10px 10px;overflow:hidden auto;
  background-image:radial-gradient(var(--border-hi) 1px, transparent 1px);
  background-size:24px 24px}

/* Status row */
.status{background:transparent;border:1px solid var(--border);border-radius:4px;padding:10px 11px;display:flex;flex-direction:column;gap:7px;margin-bottom:12px;background:var(--bg2)}
.srow{display:flex;align-items:center;gap:8px;min-height:17px}
.srow:first-child{padding-bottom:7px;border-bottom:1px solid var(--border)}
.dot{width:6px;height:6px;border-radius:50%;background:var(--fg3);flex-shrink:0}
.dot.on{background:var(--green);box-shadow:0 0 6px var(--green)}
.dot.scan{background:var(--accent);animation:pulse 1.5s ease infinite}
@keyframes pulse{0%,100%{opacity:.3}50%{opacity:1}}
.lbl{font-family:var(--font-mono);font-size:11px;color:var(--fg2);flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;letter-spacing:.3px}
.val{color:var(--fg3);font-size:10px;font-family:var(--font-mono);flex-shrink:0;text-transform:uppercase;letter-spacing:.5px}
.val.hl{color:var(--accent)}

/* Action buttons */
.btn{display:flex;align-items:center;gap:9px;padding:8px 10px;border-radius:4px;cursor:pointer;color:var(--fg2);font-family:var(--font-mono);font-size:10px;letter-spacing:.8px;text-transform:uppercase;transition:all 100ms;border:1px solid transparent;background:transparent}
.btn:hover{background:var(--bg2);color:var(--accent);border-color:var(--border)}
.btn svg{flex-shrink:0;color:var(--accent)}
.kbd{margin-left:auto;font-size:9px;color:var(--fg3);background:transparent;border:1px solid var(--border);border-radius:3px;padding:1px 5px;font-family:var(--font-mono);letter-spacing:.5px}
.btn.primary{background:var(--accent-dim);border-color:var(--accent-line);color:var(--accent);margin-bottom:4px}
.btn.primary:hover{background:var(--accent);color:#1a1408}
.btn.primary svg{color:inherit}

/* Section header */
.hd{font-family:var(--font-mono);font-size:9px;color:var(--fg3);text-transform:uppercase;letter-spacing:1.5px;padding:10px 4px 4px;font-weight:500}
.hd::before{content:"// ";color:var(--accent)}

/* ── Wizard Modal ───────────────────────────────────────── */
#modal{display:none;position:fixed;inset:0;background:rgba(10,12,11,0.95);z-index:100;flex-direction:column;padding:12px 10px;overflow-y:auto}
#modal.open{display:flex}
.modal-box{background:var(--bg2);border:1px solid var(--border);border-radius:4px;padding:16px;display:flex;flex-direction:column;gap:12px;flex:1;max-height:100%}
.modal-title{font-family:var(--font-mono);font-size:13px;font-weight:600;color:var(--fg);letter-spacing:.3px;text-transform:uppercase}
.modal-sub{font-family:var(--font-mono);font-size:10px;color:var(--fg3);letter-spacing:.3px}

/* Step indicator */
.steps{display:flex;gap:4px;align-items:center}
.step{width:18px;height:2px;border-radius:0;background:var(--border-hi)}
.step.done{background:var(--green)}
.step.active{background:var(--accent)}

/* Name input */
.field{display:flex;flex-direction:column;gap:6px}
.field label{font-family:var(--font-mono);font-size:9px;color:var(--fg3);font-weight:500;letter-spacing:1.5px;text-transform:uppercase}
.field label::before{content:"// ";color:var(--accent)}
.field input{background:var(--bg);border:1px solid var(--border-hi);border-radius:4px;padding:8px 10px;color:var(--fg);font-family:var(--font-mono);font-size:12px;outline:none;transition:border-color 120ms}
.field input:focus{border-color:var(--accent)}
.field input::placeholder{color:var(--fg3)}

/* Robot type cards */
.type-grid{display:grid;grid-template-columns:1fr 1fr;gap:6px}
.type-card{border:1px solid var(--border);border-radius:4px;padding:10px 11px;cursor:pointer;transition:all 100ms;display:flex;flex-direction:column;gap:4px;background:var(--bg)}
.type-card:hover{border-color:var(--accent-line)}
.type-card.selected{border-color:var(--accent);background:var(--accent-dim)}
.type-card.disabled{opacity:.4;cursor:not-allowed}
.type-card .tc-icon{font-size:16px;line-height:1}
.type-card .tc-name{font-family:var(--font-mono);font-size:11px;font-weight:600;color:var(--fg);letter-spacing:.3px;text-transform:uppercase}
.type-card .tc-desc{font-size:10px;color:var(--fg3);line-height:1.45}
.type-card .tc-badge{font-family:var(--font-mono);font-size:8.5px;color:var(--fg3);background:transparent;border:1px solid var(--border);border-radius:3px;padding:1px 5px;align-self:flex-start;margin-top:2px;letter-spacing:.5px;text-transform:uppercase}

/* Modal footer */
.modal-footer{display:flex;gap:6px;margin-top:4px}
.modal-btn{flex:1;padding:8px;border-radius:4px;border:1px solid;cursor:pointer;font-family:var(--font-mono);font-size:11px;font-weight:600;letter-spacing:.5px;text-transform:uppercase;transition:all 100ms}
.modal-btn.cancel{background:transparent;border-color:var(--border-hi);color:var(--fg3)}
.modal-btn.cancel:hover{border-color:var(--fg2);color:var(--fg)}
.modal-btn.next{background:var(--accent-dim);border-color:var(--accent-line);color:var(--accent)}
.modal-btn.next:hover:not(:disabled){background:var(--accent);color:#1a1408}
.modal-btn.next:disabled{opacity:.35;cursor:not-allowed}
.err{font-size:10px;color:var(--red);min-height:14px;font-family:var(--font-mono)}
</style>
</head>
<body>

<div class="status">
  <div class="srow">
    <span class="dot" id="cdot"></span>
    <span class="lbl" id="clbl">NO ROBOT LINKED</span>
    <span class="val" id="cval"></span>
  </div>
  <div class="srow">
    <span class="dot" id="rdot"></span>
    <span class="lbl" id="rlbl">NET · IDLE</span>
    <span class="val hl" id="rval">—</span>
  </div>
</div>

<div class="hd">Project</div>

<div class="btn primary" id="newBtn">
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
  <span>New ROS 2 project</span>
</div>

<div class="btn" data-cmd="workbench.action.files.openFolder">
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
  <span>Open workspace</span>
</div>

<div class="btn" data-cmd="roscode.startRuntime">
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="5 3 19 12 5 21 5 3"/></svg>
  <span>Start runtime</span>
</div>

<div class="hd">Tools</div>

<div class="btn" data-cmd="roscode.focusAgent">
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l1.8 5.4L19 10l-5.2 1.6L12 17l-1.8-5.4L5 10l5.2-1.6z"/></svg>
  <span>Ask agent</span>
  <span class="kbd">⌘⇧A</span>
</div>

<div class="btn" data-cmd="roscode.discoverNetwork">
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12a7 7 0 0 1 14 0"/><path d="M8 12a4 4 0 0 1 8 0"/><circle cx="12" cy="12" r="1.5" fill="currentColor"/></svg>
  <span>Scan LAN</span>
</div>

<div class="btn" data-cmd="roscode.openNodeGraph">
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="5" cy="6" r="2"/><circle cx="19" cy="6" r="2"/><circle cx="12" cy="18" r="2"/><path d="M7 6h10M6 8l5 8M18 8l-5 8"/></svg>
  <span>Node graph</span>
  <span class="kbd">⌘⇧G</span>
</div>

<div class="btn" data-cmd="roscode.searchLibrary">
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 4h11a2 2 0 012 2v13H7a2 2 0 00-2 2V4z"/><path d="M5 4v16"/></svg>
  <span>Library</span>
</div>

<!-- ── Wizard Modal ── -->
<div id="modal">
  <div class="modal-box">
    <div style="display:flex;align-items:center;justify-content:space-between">
      <span class="modal-title">NEW · ROS 2 PROJECT</span>
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
      <span class="modal-sub">// PICK A TEMPLATE</span>
      <div class="type-grid">
        <div class="type-card selected" data-type="diff-drive">
          <span class="tc-icon">◎</span>
          <span class="tc-name">DIFF-DRIVE</span>
          <span class="tc-desc">two-wheel differential drive · /cmd_vel → /odom</span>
        </div>
        <div class="type-card" data-type="empty">
          <span class="tc-icon">▣</span>
          <span class="tc-name">EMPTY</span>
          <span class="tc-desc">bare package skeleton · hello-world publisher</span>
        </div>
        <div class="type-card disabled" data-type="ackermann">
          <span class="tc-icon">⊚</span>
          <span class="tc-name">ACKERMANN</span>
          <span class="tc-desc">car-like steering geometry</span>
          <span class="tc-badge">coming soon</span>
        </div>
        <div class="type-card disabled" data-type="manipulator">
          <span class="tc-icon">⨉</span>
          <span class="tc-name">ARM</span>
          <span class="tc-desc">joint state control · moveit2</span>
          <span class="tc-badge">coming soon</span>
        </div>
      </div>
    </div>

    <div class="modal-footer">
      <button class="modal-btn cancel" id="cancelBtn">CANCEL</button>
      <button class="modal-btn next" id="nextBtn">NEXT →</button>
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
    if(m.connected){cdot.classList.add('on');clbl.textContent=(m.host||'CONNECTED').toUpperCase();cval.textContent=(m.rosVersion||'').toUpperCase();cval.className='val hl';}
    else{cdot.classList.remove('on');clbl.textContent='NO ROBOT LINKED';cval.textContent='';}
  } else if(m.type==='robots'){
    if(m.scanning){rdot.classList.add('scan');rlbl.textContent='SCANNING LAN…';rval.textContent='—';}
    else{rdot.classList.remove('scan');if(m.count>0){rdot.classList.add('on');rlbl.textContent='HOSTS ON NETWORK';}else{rdot.classList.remove('on');rlbl.textContent='NO HOSTS FOUND';}rval.textContent=m.count;}
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
  nextBtn.textContent='NEXT →';nextBtn.disabled=false;
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
    nextBtn.textContent='CREATE →';
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
