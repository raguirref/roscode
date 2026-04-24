import * as vscode from "vscode";
import * as path from "path";
import Anthropic from "@anthropic-ai/sdk";
import type { RosConnection } from "../ros/connection";
import { getAgentTools, dispatchTool } from "../agent/tools";

export class AgentPanel {
  static currentPanel: AgentPanel | undefined;
  private static readonly viewType = "roscode.agent";

  private readonly _panel: vscode.WebviewPanel;
  private readonly _ros: RosConnection;
  private readonly _context: vscode.ExtensionContext;
  private _client: Anthropic | undefined;
  private _messages: Anthropic.MessageParam[] = [];

  static createOrShow(context: vscode.ExtensionContext, ros: RosConnection) {
    const column = vscode.ViewColumn.Beside;
    if (AgentPanel.currentPanel) {
      AgentPanel.currentPanel._panel.reveal(column);
      return;
    }
    const panel = vscode.window.createWebviewPanel(
      AgentPanel.viewType,
      "roscode agent",
      column,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [
          vscode.Uri.joinPath(context.extensionUri, "webviews"),
          vscode.Uri.joinPath(context.extensionUri, "media"),
        ],
      }
    );
    AgentPanel.currentPanel = new AgentPanel(panel, context, ros);
  }

  private constructor(
    panel: vscode.WebviewPanel,
    context: vscode.ExtensionContext,
    ros: RosConnection
  ) {
    this._panel = panel;
    this._context = context;
    this._ros = ros;

    this._panel.webview.html = this._getHtml();
    this._panel.onDidDispose(() => { AgentPanel.currentPanel = undefined; });
    this._panel.webview.onDidReceiveMessage((msg) => this._handleMessage(msg));

    ros.onStatusChange(() => {
      this._panel.webview.postMessage({ type: "connectionStatus", status: ros.status, host: ros.connectedHost });
    });
  }

  private async _handleMessage(msg: { type: string; text?: string; clear?: boolean }) {
    if (msg.type === "userMessage" && msg.text) {
      await this._runAgent(msg.text);
    } else if (msg.type === "clear") {
      this._messages = [];
    } else if (msg.type === "ready") {
      this._panel.webview.postMessage({
        type: "connectionStatus",
        status: this._ros.status,
        host: this._ros.connectedHost,
      });
    }
  }

  private async _runAgent(userText: string) {
    const apiKey =
      vscode.workspace.getConfiguration("roscode").get<string>("anthropicApiKey") ||
      process.env.ANTHROPIC_API_KEY;

    if (!apiKey) {
      this._send({ type: "error", text: "Set ANTHROPIC_API_KEY or roscode.anthropicApiKey in settings." });
      return;
    }

    if (!this._client) {
      this._client = new Anthropic({ apiKey });
    }

    const model = vscode.workspace.getConfiguration("roscode").get<string>("model", "claude-opus-4-7");
    const workspacePath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? "";

    this._messages.push({ role: "user", content: userText });
    this._send({ type: "thinking" });

    try {
      let continueLoop = true;
      while (continueLoop) {
        const response = await this._client.messages.create({
          model,
          max_tokens: 4096,
          system: getSystemPrompt(this._ros, workspacePath),
          tools: getAgentTools(),
          messages: this._messages,
        });

        this._messages.push({ role: "assistant", content: response.content });

        for (const block of response.content) {
          if (block.type === "text" && block.text) {
            this._send({ type: "assistantText", text: block.text });
          }
          if (block.type === "tool_use") {
            this._send({ type: "toolCall", name: block.name, input: block.input });
            const result = await dispatchTool(block.name, block.input as Record<string, unknown>, this._ros, workspacePath);
            this._send({ type: "toolResult", name: block.name, result });
            this._messages.push({
              role: "user",
              content: [{ type: "tool_result", tool_use_id: block.id, content: result }],
            });
          }
        }

        continueLoop = response.stop_reason === "tool_use";
      }
    } catch (e: any) {
      this._send({ type: "error", text: String(e.message ?? e) });
    } finally {
      this._send({ type: "done" });
    }
  }

  private _send(msg: object) {
    this._panel.webview.postMessage(msg);
  }

  private _getHtml(): string {
    const w = this._panel.webview;
    const nonce = getNonce();
    return /* html */`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}';">
<meta name="viewport" content="width=device-width, initial-scale=1.0"/>
<title>roscode agent</title>
<style nonce="${nonce}">
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:var(--vscode-font-family);font-size:13px;background:var(--vscode-editor-background);color:var(--vscode-editor-foreground);display:flex;flex-direction:column;height:100vh;overflow:hidden}
#header{padding:10px 14px;border-bottom:1px solid var(--vscode-panel-border);display:flex;align-items:center;gap:8px;flex-shrink:0}
.brand{font-weight:700;font-size:14px;color:var(--vscode-textLink-foreground);letter-spacing:-0.3px}
.brand span{color:var(--vscode-descriptionForeground);font-weight:400}
#conn-pill{font-size:11px;padding:2px 8px;border-radius:10px;background:var(--vscode-badge-background);color:var(--vscode-badge-foreground);margin-left:auto}
#conn-pill.connected{background:#0a3d1f;color:#3ddc84}
#messages{flex:1;overflow-y:auto;padding:14px;display:flex;flex-direction:column;gap:12px}
.msg{display:flex;flex-direction:column;gap:4px;max-width:100%}
.msg.user .bubble{background:var(--vscode-input-background);border:1px solid var(--vscode-input-border);border-radius:8px 8px 2px 8px;padding:8px 12px;align-self:flex-end;max-width:80%}
.msg.assistant .bubble{background:var(--vscode-editorWidget-background);border:1px solid var(--vscode-panel-border);border-radius:2px 8px 8px 8px;padding:8px 12px;white-space:pre-wrap;line-height:1.5}
.msg.tool .bubble{background:var(--vscode-terminal-background,#1e1e1e);border:1px solid var(--vscode-panel-border);border-radius:4px;padding:6px 10px;font-family:var(--vscode-editor-font-family);font-size:11px;color:var(--vscode-terminal-foreground)}
.tool-name{color:var(--vscode-textLink-foreground);font-weight:600;margin-bottom:2px}
.tool-result{color:var(--vscode-descriptionForeground);margin-top:4px;white-space:pre-wrap;max-height:120px;overflow-y:auto}
.thinking{display:flex;gap:4px;align-items:center;color:var(--vscode-descriptionForeground);font-size:11px;padding:4px 0}
.dot{width:5px;height:5px;border-radius:50%;background:var(--vscode-textLink-foreground);animation:pulse 1.2s ease-in-out infinite}
.dot:nth-child(2){animation-delay:.2s}.dot:nth-child(3){animation-delay:.4s}
@keyframes pulse{0%,100%{opacity:.3}50%{opacity:1}}
.error{color:var(--vscode-errorForeground);font-size:12px;padding:4px 8px;background:var(--vscode-inputValidation-errorBackground);border-radius:4px}
#input-area{padding:10px 14px;border-top:1px solid var(--vscode-panel-border);display:flex;gap:8px;flex-shrink:0}
#input{flex:1;background:var(--vscode-input-background);border:1px solid var(--vscode-input-border);color:var(--vscode-input-foreground);border-radius:4px;padding:8px 10px;font-family:inherit;font-size:13px;resize:none;min-height:38px;max-height:120px;outline:none}
#input:focus{border-color:var(--vscode-focusBorder)}
#send{background:var(--vscode-button-background);color:var(--vscode-button-foreground);border:none;border-radius:4px;padding:0 14px;cursor:pointer;font-size:13px;height:38px;flex-shrink:0}
#send:hover{background:var(--vscode-button-hoverBackground)}
#send:disabled{opacity:.4;cursor:default}
</style>
</head>
<body>
<div id="header">
  <span class="brand">roscode<span> agent</span></span>
  <span id="conn-pill">offline</span>
</div>
<div id="messages"></div>
<div id="input-area">
  <textarea id="input" placeholder="Ask Claude to inspect topics, fix a node, create a package…" rows="1"></textarea>
  <button id="send">Send</button>
</div>
<script nonce="${nonce}">
const vscode = acquireVsCodeApi();
const msgs = document.getElementById('messages');
const input = document.getElementById('input');
const sendBtn = document.getElementById('send');
const connPill = document.getElementById('conn-pill');
let busy = false;

function setBusy(v){busy=v;sendBtn.disabled=v;input.disabled=v;}

function appendUser(text){
  const d=document.createElement('div');d.className='msg user';
  d.innerHTML=\`<div class="bubble">\${esc(text)}</div>\`;
  msgs.appendChild(d);scroll();
}
function appendAssistant(text){
  let el=msgs.querySelector('.msg.assistant.pending');
  if(!el){el=document.createElement('div');el.className='msg assistant pending';el.innerHTML='<div class="bubble"></div>';msgs.appendChild(el);}
  el.querySelector('.bubble').textContent+=text;scroll();
}
function finalizeAssistant(){
  const el=msgs.querySelector('.msg.assistant.pending');
  if(el)el.classList.remove('pending');
}
function appendThinking(){
  const d=document.createElement('div');d.className='thinking';
  d.id='thinking';d.innerHTML='<div class="dot"></div><div class="dot"></div><div class="dot"></div><span style="margin-left:4px">thinking…</span>';
  msgs.appendChild(d);scroll();
}
function removeThinking(){const t=document.getElementById('thinking');if(t)t.remove();}
function appendTool(name,input){
  const d=document.createElement('div');d.className='msg tool';
  d.id='tool-'+name;
  d.innerHTML=\`<div class="bubble"><div class="tool-name">⚙ \${esc(name)}</div><div class="tool-input" style="color:var(--vscode-descriptionForeground);font-size:10px">\${esc(JSON.stringify(input,null,2).slice(0,200))}</div><div class="tool-result" id="result-\${esc(name)}">running…</div></div>\`;
  msgs.appendChild(d);scroll();
}
function updateToolResult(name,result){
  const el=document.getElementById('result-'+name);
  if(el)el.textContent=result.slice?.(0,400)??String(result);
}
function appendError(text){
  const d=document.createElement('div');d.className='error';d.textContent=text;msgs.appendChild(d);scroll();
}
function scroll(){msgs.scrollTop=msgs.scrollHeight;}
function esc(s){return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}

sendBtn.addEventListener('click',send);
input.addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();send();}});
input.addEventListener('input',()=>{input.style.height='auto';input.style.height=Math.min(input.scrollHeight,120)+'px';});

function send(){
  const text=input.value.trim();
  if(!text||busy)return;
  input.value='';input.style.height='auto';
  appendUser(text);
  setBusy(true);
  vscode.postMessage({type:'userMessage',text});
}

window.addEventListener('message',e=>{
  const m=e.data;
  if(m.type==='thinking'){removeThinking();appendThinking();}
  else if(m.type==='assistantText'){removeThinking();appendAssistant(m.text);}
  else if(m.type==='toolCall'){removeThinking();appendTool(m.name,m.input);}
  else if(m.type==='toolResult'){updateToolResult(m.name,m.result);}
  else if(m.type==='error'){removeThinking();appendError(m.text);setBusy(false);}
  else if(m.type==='done'){finalizeAssistant();removeThinking();setBusy(false);}
  else if(m.type==='connectionStatus'){
    connPill.textContent=m.status==='connected'?\`connected · \${m.host}\`:'offline';
    connPill.className=m.status==='connected'?'connected':'';
  }
});

vscode.postMessage({type:'ready'});
</script>
</body>
</html>`;
  }
}

function getNonce() {
  let text = "";
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  for (let i = 0; i < 32; i++) text += chars.charAt(Math.floor(Math.random() * chars.length));
  return text;
}

function getSystemPrompt(ros: RosConnection, workspacePath: string): string {
  const connected = ros.robot
    ? `Connected to ${ros.robot.hostname} (${ros.robot.ip}) running ${ros.robot.rosVersion.toUpperCase()}.`
    : "No ROS robot connected.";
  return `You are roscode, an AI agent for ROS 2 robotics development.
${connected}
Workspace: ${workspacePath || "No workspace open."}

You have tools to: list/echo topics, list nodes, read/write source files, run colcon builds, execute shell commands.
Be concise. When you spot issues, fix them. Always confirm destructive actions before running them.`;
}
