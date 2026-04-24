import * as vscode from "vscode";
import Anthropic from "@anthropic-ai/sdk";
import type { RosConnection } from "../ros/connection";
import { getAgentTools, dispatchTool, toolDisplayMeta } from "../agent/tools";

export class AgentView implements vscode.WebviewViewProvider {
  public static readonly viewType = "roscode.agent";
  private _view?: vscode.WebviewView;
  private _client: Anthropic | undefined;
  private _messages: Anthropic.MessageParam[] = [];
  private _running = false;

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly ros: RosConnection
  ) {
    ros.onStatusChange(() => this._post({ type: "status", status: ros.status, host: ros.connectedHost }));
  }

  resolveWebviewView(view: vscode.WebviewView): void {
    this._view = view;
    view.webview.options = {
      enableScripts: true,
      localResourceRoots: [this.context.extensionUri],
    };
    view.webview.html = this._html(view.webview);
    view.webview.onDidReceiveMessage((m) => this._handle(m));
  }

  focus(): void {
    vscode.commands.executeCommand("roscode.agent.focus");
  }

  clear(): void {
    this._messages = [];
    this._post({ type: "reset" });
  }

  prefill(text: string): void {
    this._post({ type: "prefill", text });
  }

  private _post(msg: object) {
    this._view?.webview.postMessage(msg);
  }

  private async _handle(msg: any) {
    if (msg.type === "ready") {
      this._post({ type: "status", status: this.ros.status, host: this.ros.connectedHost });
    } else if (msg.type === "send") {
      if (!this._running) await this._run(msg.text);
    } else if (msg.type === "clear") {
      this.clear();
    } else if (msg.type === "runCommand" && msg.command) {
      vscode.commands.executeCommand(msg.command, ...(msg.args ?? []));
    } else if (msg.type === "openSettings") {
      vscode.commands.executeCommand("workbench.action.openSettings", "roscode.anthropicApiKey");
    }
  }

  private async _run(userText: string) {
    this._running = true;
    const apiKey =
      vscode.workspace.getConfiguration("roscode").get<string>("anthropicApiKey") ||
      process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      this._post({ type: "needKey" });
      this._running = false;
      return;
    }
    if (!this._client) this._client = new Anthropic({ apiKey });

    const model = vscode.workspace.getConfiguration("roscode").get<string>("model", "claude-opus-4-7");
    const ws = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? "";

    this._messages.push({ role: "user", content: userText });
    this._post({ type: "thinking" });

    try {
      let loop = true;
      while (loop) {
        const res = await this._client.messages.create({
          model,
          max_tokens: 4096,
          system: systemPrompt(this.ros, ws),
          tools: getAgentTools(),
          messages: this._messages,
        });
        this._messages.push({ role: "assistant", content: res.content });

        for (const blk of res.content) {
          if (blk.type === "text" && blk.text) this._post({ type: "text", text: blk.text });
          if (blk.type === "tool_use") {
            const meta = toolDisplayMeta(blk.name);
            this._post({ type: "tool", id: blk.id, name: blk.name, input: blk.input, meta });
            const result = await dispatchTool(blk.name, blk.input as any, this.ros, ws);
            this._post({ type: "toolResult", id: blk.id, name: blk.name, result });
            this._messages.push({
              role: "user",
              content: [{ type: "tool_result", tool_use_id: blk.id, content: result }],
            });
          }
        }
        loop = res.stop_reason === "tool_use";
      }
    } catch (e: any) {
      this._post({ type: "error", text: String(e?.message ?? e) });
    } finally {
      this._post({ type: "done" });
      this._running = false;
    }
  }

  private _html(webview: vscode.Webview): string {
    const n = nonce();
    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'nonce-${n}' ${webview.cspSource}; script-src 'nonce-${n}'; font-src ${webview.cspSource};">
<style nonce="${n}">
:root{
  --accent:#4cc9f0; --accent-dim:#4cc9f060;
  --bg:#0a0e14; --bg2:#0d1520; --bg3:#111b2b;
  --fg:#c9d1d9; --fg2:#8b9ab0; --fg3:#3d4a5c;
  --border:#141e2e; --red:#f87171; --green:#3dd68c;
}
*{box-sizing:border-box;margin:0;padding:0}
html,body{height:100%}
body{
  font-family:'Inter',-apple-system,BlinkMacSystemFont,system-ui,sans-serif;
  font-size:12.5px;background:var(--bg);color:var(--fg);
  display:flex;flex-direction:column;height:100vh;overflow:hidden;
}
/* Header */
#head{padding:10px 12px;border-bottom:1px solid var(--border);display:flex;align-items:center;gap:8px;flex-shrink:0}
.logo{display:flex;align-items:baseline;gap:0;font-weight:700;letter-spacing:-0.3px;font-size:12.5px}
.logo .a{color:var(--accent)} .logo .b{color:var(--fg3);font-weight:500;margin-left:1px}
.pill{margin-left:auto;font-size:10px;padding:2px 7px;border-radius:9px;border:1px solid var(--border);color:var(--fg3);background:var(--bg2);display:flex;align-items:center;gap:5px;font-weight:500}
.pill .d{width:5px;height:5px;border-radius:50%;background:var(--fg3)}
.pill.on{color:var(--accent);border-color:var(--accent-dim)}
.pill.on .d{background:var(--accent);box-shadow:0 0 4px var(--accent)}

/* Scroll area */
#feed{flex:1;overflow-y:auto;padding:12px;display:flex;flex-direction:column;gap:8px}
#feed::-webkit-scrollbar{width:6px} #feed::-webkit-scrollbar-thumb{background:var(--border);border-radius:3px}

/* Messages */
.m{max-width:100%;line-height:1.55}
.m.user{align-self:flex-end;background:var(--bg3);padding:7px 11px;border-radius:10px 10px 3px 10px;max-width:85%;font-size:12.5px}
.m.ai{align-self:flex-start;color:var(--fg);white-space:pre-wrap;font-size:12.5px;padding:2px 2px 6px;max-width:94%}
.m.ai code{background:var(--bg2);padding:1px 5px;border-radius:3px;font-family:'JetBrains Mono',ui-monospace,monospace;font-size:11.5px;color:var(--accent)}

/* Tool card — this is the "drastically improved" tool display */
.tool{
  background:var(--bg2);border:1px solid var(--border);border-radius:7px;padding:8px 10px;font-size:11.5px;
  display:flex;flex-direction:column;gap:4px;align-self:flex-start;max-width:95%;
}
.tool .row1{display:flex;align-items:center;gap:7px}
.tool .icon{width:16px;height:16px;display:flex;align-items:center;justify-content:center;color:var(--accent);flex-shrink:0}
.tool .title{font-weight:600;color:var(--fg)}
.tool .sub{color:var(--fg2);font-size:11px;margin-left:auto;display:flex;align-items:center;gap:4px}
.tool .sub .s-dot{width:4px;height:4px;border-radius:50%;background:var(--fg3)}
.tool .sub.done .s-dot{background:var(--green)}
.tool .sub.err .s-dot{background:var(--red)}
.tool .body{color:var(--fg2);font-family:'JetBrains Mono',ui-monospace,monospace;font-size:11px;white-space:pre-wrap;background:var(--bg);padding:6px 8px;border-radius:4px;max-height:120px;overflow-y:auto;line-height:1.5;border:1px solid var(--border)}
.tool .body.collapsed{display:none}
.tool .toggle{cursor:pointer;color:var(--fg3);font-size:10px;user-select:none;padding:2px 0}
.tool .toggle:hover{color:var(--accent)}
.tool .arg{color:var(--fg3);font-family:'JetBrains Mono',ui-monospace,monospace;font-size:10.5px;margin-left:23px}
.tool .arg .k{color:var(--fg2)}

/* Thinking */
.thinking{display:flex;align-items:center;gap:6px;color:var(--fg3);font-size:11px;padding:3px 0 3px 2px}
.td{width:4px;height:4px;border-radius:50%;background:var(--accent);animation:pulse 1.3s ease infinite}
.td:nth-child(2){animation-delay:.15s}.td:nth-child(3){animation-delay:.3s}
@keyframes pulse{0%,80%,100%{opacity:.2;transform:scale(.8)}40%{opacity:1;transform:scale(1)}}

/* Error / banner */
.banner{padding:8px 11px;border-radius:6px;font-size:11.5px;border:1px solid}
.banner.err{background:#1f0a0a;border-color:#3a1515;color:var(--red)}
.banner.warn{background:#1a1405;border-color:#3a2c0a;color:#f5cb5c}
.banner a{color:inherit;text-decoration:underline;cursor:pointer}

/* Empty */
.empty{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:20px 16px;text-align:center;gap:14px}
.empty .mark{font-size:28px;color:var(--accent);line-height:1}
.empty h2{font-size:15px;font-weight:700;color:var(--fg);letter-spacing:-0.2px}
.empty p{font-size:11.5px;color:var(--fg2);line-height:1.5;max-width:240px}
.suggest{display:flex;flex-wrap:wrap;gap:5px;justify-content:center;max-width:260px;margin-top:2px}
.sg{background:var(--bg2);border:1px solid var(--border);border-radius:14px;padding:4px 10px;font-size:11px;color:var(--fg2);cursor:pointer;transition:all 100ms}
.sg:hover{border-color:var(--accent-dim);color:var(--accent)}

/* Input */
#bar{padding:8px 10px 10px;border-top:1px solid var(--border);flex-shrink:0;display:flex;flex-direction:column;gap:6px;background:var(--bg)}
.wrap{display:flex;gap:6px;align-items:flex-end;background:var(--bg2);border:1px solid var(--border);border-radius:8px;padding:6px 8px 6px 10px;transition:border-color 120ms}
.wrap:focus-within{border-color:var(--accent-dim)}
#inp{flex:1;background:transparent;border:none;color:var(--fg);font-family:inherit;font-size:12.5px;resize:none;min-height:20px;max-height:140px;outline:none;line-height:1.5;padding:2px 0}
#inp::placeholder{color:var(--fg3)}
#send{background:var(--accent);color:#060809;border:none;border-radius:5px;width:28px;height:28px;cursor:pointer;flex-shrink:0;display:flex;align-items:center;justify-content:center;transition:all 120ms}
#send:hover{background:#7ddff5}
#send:disabled{opacity:.25;cursor:default}
.hint{font-size:10px;color:var(--fg3);text-align:left;padding:0 4px}
.hint kbd{background:var(--bg2);border:1px solid var(--border);border-radius:3px;padding:0 4px;font-family:inherit;font-size:9.5px;color:var(--fg2)}
</style>
</head>
<body>
<div id="head">
  <span class="logo"><span class="a">roscode</span><span class="b">agent</span></span>
  <span id="pill" class="pill"><span class="d"></span><span id="pillText">offline</span></span>
</div>

<div id="empty" class="empty">
  <div class="mark">⬡</div>
  <h2>roscode agent</h2>
  <p>Ask Claude to inspect your ROS graph, fix a node, create a package, or diagnose sensors.</p>
  <div class="suggest">
    <span class="sg" data-t="What topics are active?">topics?</span>
    <span class="sg" data-t="Show me the node graph">graph</span>
    <span class="sg" data-t="Find any issues in my nodes">find bugs</span>
    <span class="sg" data-t="Create a basic publisher node in Python">new publisher</span>
    <span class="sg" data-t="Build the workspace">colcon build</span>
  </div>
</div>

<div id="feed" style="display:none"></div>

<div id="bar">
  <div class="wrap">
    <textarea id="inp" placeholder="Ask about your ROS system…" rows="1"></textarea>
    <button id="send" title="Send (⏎)">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/></svg>
    </button>
  </div>
  <div class="hint"><kbd>↵</kbd> send  <kbd>⇧↵</kbd> new line  <kbd>⌘⇧A</kbd> focus</div>
</div>

<script nonce="${n}">
const vsc = acquireVsCodeApi();
const feed = document.getElementById('feed');
const empty = document.getElementById('empty');
const inp = document.getElementById('inp');
const send = document.getElementById('send');
const pill = document.getElementById('pill');
const pillText = document.getElementById('pillText');
let busy = false;

function show(){feed.style.display='flex';empty.style.display='none';}
function hide(){feed.style.display='none';empty.style.display='flex'}
function mk(tag,cls){const e=document.createElement(tag);if(cls)e.className=cls;return e;}
function esc(s){return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}
function mdInline(s){
  return esc(s).replace(/\\\`([^\`]+)\\\`/g,'<code>$1</code>').replace(/\\*\\*([^*]+)\\*\\*/g,'<strong>$1</strong>');
}
function scroll(){feed.scrollTop=feed.scrollHeight;}

function addUser(t){show();const d=mk('div','m user');d.textContent=t;feed.appendChild(d);scroll();}
function aiStart(){let el=feed.querySelector('.m.ai.pending');if(el)return el;el=mk('div','m ai pending');feed.appendChild(el);return el;}
function aiAppend(t){show();const el=aiStart();el.innerHTML+=mdInline(t).replace(/\\n/g,'<br/>');scroll();}
function aiDone(){feed.querySelector('.m.ai.pending')?.classList.remove('pending');}
function setBusy(v){busy=v;send.disabled=v;}

function addThinking(){
  removeThinking();
  const d=mk('div','thinking');d.id='think';
  d.innerHTML='<span class="td"></span><span class="td"></span><span class="td"></span><span>thinking…</span>';
  feed.appendChild(d);scroll();
}
function removeThinking(){document.getElementById('think')?.remove();}

function iconHtml(icon){
  if(icon==='pulse')   return '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>';
  if(icon==='graph')   return '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="5" cy="6" r="2"/><circle cx="19" cy="6" r="2"/><circle cx="12" cy="18" r="2"/><path d="M7 6h10M6 8l5 8M18 8l-5 8"/></svg>';
  if(icon==='file')    return '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>';
  if(icon==='terminal')return '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="4 17 10 11 4 5"/><line x1="12" y1="19" x2="20" y2="19"/></svg>';
  if(icon==='build')   return '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>';
  if(icon==='radio')   return '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="2"/><path d="M16.24 7.76a6 6 0 0 1 0 8.49m-8.48-.01a6 6 0 0 1 0-8.49m11.31-2.82a10 10 0 0 1 0 14.14m-14.14 0a10 10 0 0 1 0-14.14"/></svg>';
  return '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/></svg>';
}

function addTool(id,name,input,meta){
  show();
  const d=mk('div','tool');d.id='tool-'+id;
  const argStr = Object.keys(input||{}).map(k => {
    const v = String(input[k]);
    const trimmed = v.length > 40 ? v.slice(0, 40) + '…' : v;
    return '<span class="k">'+esc(k)+':</span> '+esc(trimmed);
  }).join('  ');
  d.innerHTML =
    '<div class="row1">'+
      '<span class="icon">'+iconHtml(meta?.icon||'default')+'</span>'+
      '<span class="title">'+esc(meta?.label || name)+'</span>'+
      '<span class="sub"><span class="s-dot"></span><span class="s-text">running…</span></span>'+
    '</div>'+
    (argStr ? '<div class="arg">'+argStr+'</div>' : '')+
    '<div class="toggle" data-for="'+id+'">▸ output</div>'+
    '<div class="body collapsed" id="body-'+id+'"></div>';
  feed.appendChild(d);scroll();
  d.querySelector('.toggle').addEventListener('click',e=>{
    const b=document.getElementById('body-'+id);b.classList.toggle('collapsed');
    e.target.textContent = b.classList.contains('collapsed') ? '▸ output' : '▾ output';
  });
}

function setToolResult(id, result, name){
  const b = document.getElementById('body-'+id);
  if(!b) return;
  const r = String(result || '(no output)').slice(0, 2000);
  b.textContent = r;
  const tool = document.getElementById('tool-'+id);
  const sub = tool?.querySelector('.sub');
  const txt = tool?.querySelector('.s-text');
  if(sub){
    sub.classList.add('done');
    if(txt){
      const lines = r.split('\\n').filter(x=>x.trim()).length;
      txt.textContent = lines > 0 ? lines+' line'+(lines===1?'':'s') : 'done';
    }
  }
}

function addError(t){
  show();
  const d=mk('div','banner err');d.textContent=t;feed.appendChild(d);scroll();
}
function addNeedKey(){
  show();
  const d=mk('div','banner warn');
  d.innerHTML='Set your Anthropic API key to use the agent. <a id="skey">Open settings →</a>';
  feed.appendChild(d);scroll();
  document.getElementById('skey').onclick = () => vsc.postMessage({type:'openSettings'});
  setBusy(false);
}

/* events */
send.onclick = doSend;
inp.addEventListener('keydown', e => { if(e.key==='Enter' && !e.shiftKey){ e.preventDefault(); doSend(); } });
inp.addEventListener('input', () => { inp.style.height='auto'; inp.style.height=Math.min(inp.scrollHeight,140)+'px'; });

document.querySelectorAll('.sg').forEach(el=>{
  el.addEventListener('click', () => { inp.value = el.dataset.t; inp.focus(); doSend(); });
});

function doSend(){
  const t = inp.value.trim();
  if(!t || busy) return;
  inp.value=''; inp.style.height='auto';
  addUser(t); setBusy(true);
  vsc.postMessage({type:'send', text:t});
}

window.addEventListener('message', e => {
  const m = e.data;
  switch(m.type){
    case 'thinking': addThinking(); break;
    case 'text': removeThinking(); aiAppend(m.text); break;
    case 'tool': removeThinking(); aiDone(); addTool(m.id, m.name, m.input, m.meta); break;
    case 'toolResult': setToolResult(m.id, m.result, m.name); break;
    case 'error': removeThinking(); addError(m.text); setBusy(false); break;
    case 'done': aiDone(); removeThinking(); setBusy(false); break;
    case 'status': {
      const on = m.status === 'connected';
      pill.className = 'pill' + (on ? ' on' : '');
      pillText.textContent = on ? m.host : 'offline';
      break;
    }
    case 'needKey': removeThinking(); addNeedKey(); break;
    case 'prefill': inp.value = m.text; inp.focus(); break;
    case 'reset': feed.innerHTML=''; hide(); break;
  }
});

vsc.postMessage({type:'ready'});
</script>
</body>
</html>`;
  }
}

function nonce() {
  let t = "";
  const c = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  for (let i = 0; i < 32; i++) t += c[Math.floor(Math.random() * c.length)];
  return t;
}

function systemPrompt(ros: RosConnection, ws: string): string {
  const conn = ros.robot
    ? `Connected to **${ros.robot.hostname}** (${ros.robot.ip}) · ${ros.robot.rosVersion.toUpperCase()}`
    : "No robot connected — network tools return empty until you connect one.";
  return `You are roscode, the AI agent inside roscode studio (an IDE for ROS 2). Be concise, direct, and practical.

${conn}
Workspace: ${ws || "none"}

Tools available: list_topics, echo_topic, list_nodes, get_node_graph, read_file, write_file, shell, colcon_build.
When asked to fix something, do it: read the file, make the change, briefly explain why.
Use markdown sparingly — backticks for code/paths, bold for emphasis. No headers or bullet spam.
Confirm before running destructive shell commands (rm, git reset, kill).`;
}
